import type { LoggerService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import Handlebars from 'handlebars';
import type { DomainEventRow } from '../repositories/domainEventsRepository';
import type {
  WebhookPagination,
  WebhookRepository,
  WebhookRow,
} from '../repositories/webhookRepository';
import type { WebhookCreationInput } from '../schemas/webhooks/webhookCreationSchema';
import type { WebhookEditInput } from '../schemas/webhooks/webhookEditSchema';

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

export type WebhookEventName =
  | 'quest.completed'
  | 'badge.earned'
  | 'daily'
  | 'weekly'
  | 'monthly';

export class WebhookService {
  private readonly webhookRepo: WebhookRepository;
  private readonly logger?: LoggerService;
  private readonly requestTimeoutMs: number;

  constructor(options: {
    webhookRepo: WebhookRepository;
    logger?: LoggerService;
    requestTimeoutMs?: number;
  }) {
    this.webhookRepo = options.webhookRepo;
    this.logger = options.logger;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
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

  async editWebhook(
    id: string,
    data: WebhookEditInput,
    _opts: WebhookServiceOpts,
  ) {
    const current = await this.webhookRepo.getWebhookById(id);
    if (!current) {
      return undefined;
    }

    if (data.event !== undefined) {
      const triggerEvent = await this.webhookRepo.getWebhookTriggerEvent(
        data.event,
      );

      if (!triggerEvent) {
        throw new InputError(`Webhook trigger event '${data.event}' not found`);
      }
    }

    const updated = await this.webhookRepo.updateWebhook(id, {
      title: data.title,
      description: data.description,
      url: data.url,
      trigger_event_name: data.event,
      payload: data.payload,
    });

    if (!updated) {
      return undefined;
    }

    return this.buildWebhook(updated);
  }

  async deleteWebhook(id: string, _opts: WebhookServiceOpts) {
    return this.webhookRepo.deleteWebhook(id);
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

  async deliverDomainEvent(event: DomainEventRow): Promise<void> {
    const webhooks = await this.webhookRepo.getWebhooksByEventNames([
      event.event_name,
    ]);

    if (webhooks.length === 0) {
      return;
    }

    const context = this.buildDomainEventContext(event);

    for (const webhook of webhooks) {
      await this.deliverWebhook(webhook, event.event_name, event.id, context);
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

  private buildDomainEventContext(
    event: DomainEventRow,
  ): Record<string, unknown> {
    return {
      event: {
        id: event.id,
        name: event.event_name,
        occurredAt: event.occurred_at.toISOString(),
      },
      event_id: event.id,
      event_name: event.event_name,
      event_occurred_at: event.occurred_at.toISOString(),
      ...(event.payload ?? {}),
    };
  }

  private async deliverWebhook(
    webhook: WebhookRow,
    eventName: WebhookEventName,
    eventId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const payload = this.renderPayloadTemplate(webhook.payload, context);
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gamification-Event-Id': eventId,
        'X-Gamification-Event-Name': eventName,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (response.ok) {
      return;
    }

    const responseBody = await response.text();
    const reason =
      responseBody.trim() || `${response.status} ${response.statusText}`;

    throw new Error(
      `Webhook '${webhook.title}' (${webhook.url}) for event '${eventName}' returned ${reason}`,
    );
  }
}
