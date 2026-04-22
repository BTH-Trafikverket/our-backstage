import { isIP } from 'node:net';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import Handlebars from 'handlebars';
import type {
  DomainEventDeliveryTarget,
  DomainEventRow,
} from '../repositories/domainEventsRepository';
import type {
  WebhookPagination,
  WebhookRepository,
  WebhookRow,
} from '../repositories/webhookRepository';
import type { WebhookCreationInput } from '../schemas/webhooks/webhookCreationSchema';
import type { WebhookEditInput } from '../schemas/webhooks/webhookEditSchema';
import {
  getStaticWebhookEventMetadata,
  type WebhookEventMetadata,
} from './webhookEventMetadata';

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

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split('.').map(part => Number(part));
  if (octets.length !== 4 || octets.some(octet => Number.isNaN(octet))) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.')
  );
}

export class WebhookService {
  private readonly webhookRepo: WebhookRepository;
  private readonly requestTimeoutMs: number;
  private readonly allowedHosts: Set<string>;
  private readonly allowHttp: boolean;
  private readonly allowPrivateTargets: boolean;

  constructor(options: {
    webhookRepo: WebhookRepository;
    logger?: LoggerService;
    requestTimeoutMs?: number;
    allowedHosts?: string[];
    allowHttp?: boolean;
    allowPrivateTargets?: boolean;
  }) {
    this.webhookRepo = options.webhookRepo;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.allowedHosts = new Set(
      (options.allowedHosts ?? []).map(host => host.toLocaleLowerCase('en-US')),
    );
    this.allowHttp = options.allowHttp ?? false;
    this.allowPrivateTargets = options.allowPrivateTargets ?? false;
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

  async getWebhookEventMetadata(
    event: string,
    _opts?: WebhookServiceOpts,
  ): Promise<WebhookEventMetadata> {
    const metadata = getStaticWebhookEventMetadata(event);

    if (!metadata) {
      throw new NotFoundError(`Webhook trigger event '${event}' not found`);
    }

    return metadata;
  }

  async deliverDomainEvent(event: DomainEventRow): Promise<void> {
    const deliveryTargets = await this.resolveDeliveryTargets(event);
    if (deliveryTargets.length === 0) {
      return;
    }

    const context = this.buildDomainEventContext(event);

    for (const target of deliveryTargets) {
      await this.deliverWebhook(target, event.event_name, event.id, context);
    }
  }

  private async resolveDeliveryTargets(
    event: DomainEventRow,
  ): Promise<DomainEventDeliveryTarget[]> {
    if (
      event.delivery_targets !== null &&
      event.delivery_targets !== undefined
    ) {
      return event.delivery_targets;
    }

    const webhooks = await this.webhookRepo.getWebhooksByEventNames([
      event.event_name,
    ]);

    return webhooks.map(webhook => ({
      id: webhook.id,
      title: webhook.title,
      url: webhook.url,
      payload: webhook.payload,
    }));
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

  private validateTarget(
    target: DomainEventDeliveryTarget,
    eventName: WebhookEventName,
  ): URL {
    const url = new URL(target.url);
    const hostname = url.hostname.toLocaleLowerCase('en-US');

    if (url.username || url.password) {
      throw new Error(
        `Webhook '${target.title}' (${target.url}) for event '${eventName}' uses embedded credentials`,
      );
    }

    if (
      url.protocol !== 'https:' &&
      !(this.allowHttp && url.protocol === 'http:')
    ) {
      throw new Error(
        `Webhook '${target.title}' (${target.url}) for event '${eventName}' must use HTTPS`,
      );
    }

    if (this.allowedHosts.size > 0 && !this.allowedHosts.has(hostname)) {
      throw new Error(
        `Webhook '${target.title}' (${target.url}) for event '${eventName}' targets a host that is not allowed`,
      );
    }

    if (
      !this.allowPrivateTargets &&
      (hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        (isIP(hostname) === 4 && isPrivateIpv4Address(hostname)) ||
        (isIP(hostname) === 6 && isPrivateIpv6Address(hostname)))
    ) {
      throw new Error(
        `Webhook '${target.title}' (${target.url}) for event '${eventName}' targets a private host that is not allowed`,
      );
    }

    return url;
  }

  private async deliverWebhook(
    target: DomainEventDeliveryTarget,
    eventName: WebhookEventName,
    eventId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const payload = this.renderPayloadTemplate(target.payload, context);
    const url = this.validateTarget(target, eventName);
    const response = await fetch(url.toString(), {
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
      `Webhook '${target.title}' (${target.url}) for event '${eventName}' returned ${reason}`,
    );
  }
}
