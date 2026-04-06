import type { LoggerService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import Handlebars from 'handlebars';
import type {
  WebhookPagination,
  WebhookRepository,
  WebhookRow,
} from '../repositories/webhookRepository';
import type { WebhookCreationInput } from '../schemas/webhooks/webhookCreationSchema';

type WebhookServiceOpts = {
  credentials: any;
};

export type WebhookResponse = Omit<WebhookRow, 'trigger_event_name'> & {
  events: string[];
};

export type PaginatedWebhookResponse = {
  data: WebhookResponse[];
  pagination: WebhookPagination;
};

export type WebhookEventName = 'quest.completed' | 'badge.earned';

export type WebhookDispatchEvent = {
  name: WebhookEventName;
  context: Record<string, unknown>;
};

export class WebhookService {
  private readonly webhookRepo: WebhookRepository;
  private readonly logger?: LoggerService;

  constructor(options: {
    webhookRepo: WebhookRepository;
    logger?: LoggerService;
  }) {
    this.webhookRepo = options.webhookRepo;
    this.logger = options.logger;
  }

  private buildWebhook(row: WebhookRow): WebhookResponse {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      events: [row.trigger_event_name],
      payload: row.payload,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async createWebhook(data: WebhookCreationInput, _opts: WebhookServiceOpts) {
    const triggerEvent = await this.webhookRepo.getWebhookTriggerEvent(
      data.event,
    );

    if (!triggerEvent) {
      throw new InputError(`Webhook trigger event '${data.event}' not found`);
    }

    const created = await this.webhookRepo.createWebhook({
      title: data.title,
      description: data.description,
      url: data.url,
      trigger_event_name: data.event,
      payload: data.payload,
    });

    return this.buildWebhook(created);
  }

  async getWebhooks(
    filters?: {
      page?: number;
      limit?: number;
    },
    _opts?: WebhookServiceOpts,
  ): Promise<PaginatedWebhookResponse> {
    const result = await this.webhookRepo.getPaginatedWebhooks({
      page: filters?.page,
      limit: filters?.limit,
    });

    return {
      data: result.data.map(row => this.buildWebhook(row)),
      pagination: result.pagination,
    };
  }

  async dispatchEvents(events: WebhookDispatchEvent[]): Promise<void> {
    try {
      const pendingEvents = events.filter(event => Boolean(event?.name));
      if (pendingEvents.length === 0) {
        return;
      }

      const webhooks = await this.webhookRepo.getWebhooksByEventNames(
        pendingEvents.map(event => event.name),
      );

      if (webhooks.length === 0) {
        return;
      }

      const deliveries = webhooks.flatMap(webhook =>
        pendingEvents
          .filter(event => event.name === webhook.trigger_event_name)
          .map(event => this.deliverWebhook(webhook, event)),
      );

      const results = await Promise.allSettled(deliveries);
      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger?.warn(`Webhook delivery failed: ${result.reason}`);
        }
      }
    } catch (error) {
      this.logger?.warn(`Webhook dispatch failed: ${error}`);
    }
  }

  private renderPayloadTemplate(
    templatePayload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const renderedEntries = Object.entries(templatePayload).map(
      ([key, value]) => [
        this.renderTemplateString(key, context),
        this.renderTemplateValue(value, context),
      ],
    );

    return Object.fromEntries(renderedEntries);
  }

  private renderTemplateString(
    template: string,
    context: Record<string, unknown>,
  ): string {
    const render = Handlebars.compile(template, {
      noEscape: true,
      strict: true,
    });

    return render(context);
  }

  private renderTemplateValue(
    value: unknown,
    context: Record<string, unknown>,
  ): unknown {
    if (typeof value === 'string') {
      return this.renderTemplateString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.renderTemplateValue(item, context));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          this.renderTemplateString(key, context),
          this.renderTemplateValue(nestedValue, context),
        ]),
      );
    }

    return value;
  }

  private async deliverWebhook(
    webhook: WebhookRow,
    event: WebhookDispatchEvent,
  ): Promise<void> {
    const payload = this.renderPayloadTemplate(webhook.payload, event.context);
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      return;
    }

    const responseBody = await response.text();
    const reason =
      responseBody.trim() || `${response.status} ${response.statusText}`;

    throw new Error(
      `Webhook '${webhook.title}' (${webhook.url}) for event '${event.name}' returned ${reason}`,
    );
  }
}
