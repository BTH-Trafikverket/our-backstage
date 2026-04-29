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
import {
  normalizeWebhookTargetPolicy,
  validateWebhookTargetUrl,
  WebhookTargetValidationError,
} from './webhookTargetPolicy';

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

export class WebhookTargetReachabilityError extends Error {
  readonly url: string;
  readonly statusCode?: number;

  constructor(options: { url: string; message: string; statusCode?: number }) {
    super(options.message);
    this.name = 'WebhookTargetReachabilityError';
    this.url = options.url;
    this.statusCode = options.statusCode;
  }
}

export class WebhookService {
  private readonly webhookRepo: WebhookRepository;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly targetPolicy: ReturnType<
    typeof normalizeWebhookTargetPolicy
  >;

  constructor(options: {
    webhookRepo: WebhookRepository;
    logger?: LoggerService;
    requestTimeoutMs?: number;
    allowedHosts?: string[];
    allowHttp?: boolean;
    allowPrivateTargets?: boolean;
    fetchImpl?: typeof fetch;
  }) {
    this.webhookRepo = options.webhookRepo;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.targetPolicy = normalizeWebhookTargetPolicy(options);
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
    this.validateCrudTarget(data.url);

    const triggerEvent = await this.webhookRepo.getWebhookTriggerEvent(
      data.event,
    );

    if (!triggerEvent) {
      throw new InputError(`Webhook trigger event '${data.event}' not found`);
    }

    if (!data.skipEndpointHealthCheck) {
      await this.checkCrudTargetReachability(data.url);
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

    const targetUrl = data.url ?? current.url;
    this.validateCrudTarget(targetUrl);

    if (data.event !== undefined) {
      const triggerEvent = await this.webhookRepo.getWebhookTriggerEvent(
        data.event,
      );

      if (!triggerEvent) {
        throw new InputError(`Webhook trigger event '${data.event}' not found`);
      }
    }

    if (
      data.url !== undefined &&
      data.url !== current.url &&
      !data.skipEndpointHealthCheck
    ) {
      await this.checkCrudTargetReachability(data.url);
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
    try {
      return validateWebhookTargetUrl(target.url, this.targetPolicy);
    } catch (error) {
      if (!(error instanceof WebhookTargetValidationError)) {
        throw error;
      }

      switch (error.code) {
        case 'embeddedCredentials':
          throw new Error(
            `Webhook '${target.title}' (${target.url}) for event '${eventName}' uses embedded credentials`,
          );
        case 'protocolNotAllowed':
          throw new Error(
            `Webhook '${target.title}' (${target.url}) for event '${eventName}' must use HTTPS`,
          );
        case 'hostNotAllowed':
          throw new Error(
            `Webhook '${target.title}' (${target.url}) for event '${eventName}' targets a host that is not allowed`,
          );
        case 'privateTargetNotAllowed':
          throw new Error(
            `Webhook '${target.title}' (${target.url}) for event '${eventName}' targets a private host that is not allowed`,
          );
        default:
          throw error;
      }
    }
  }

  private validateCrudTarget(url: string): void {
    try {
      validateWebhookTargetUrl(url, this.targetPolicy);
    } catch (error) {
      if (!(error instanceof WebhookTargetValidationError)) {
        throw error;
      }

      switch (error.code) {
        case 'embeddedCredentials':
          throw new InputError(
            'Webhook URL must not include embedded credentials',
          );
        case 'protocolNotAllowed':
          throw new InputError('Webhook URL must use HTTPS');
        case 'hostNotAllowed':
        case 'privateTargetNotAllowed':
          throw new InputError(
            `Webhook target host '${error.hostname}' is not allowed`,
          );
        default:
          throw error;
      }
    }
  }

  private async checkCrudTargetReachability(urlString: string): Promise<void> {
    const url = validateWebhookTargetUrl(urlString, this.targetPolicy);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new WebhookTargetReachabilityError({
          url: url.toString(),
          message: `Webhook endpoint did not respond to a health check within ${this.requestTimeoutMs}ms. Double-check the URL before saving.`,
        });
      }

      throw new WebhookTargetReachabilityError({
        url: url.toString(),
        message:
          'Webhook endpoint could not be reached right now. Double-check the URL before saving.',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (
      response.ok ||
      response.status < 400 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 405
    ) {
      return;
    }

    const responseBody = await response.text();
    const detail = responseBody.trim();

    if (response.status === 404 || response.status === 410) {
      throw new WebhookTargetReachabilityError({
        url: url.toString(),
        statusCode: response.status,
        message: `Webhook endpoint responded with status ${response.status} to a health check. Double-check the URL before saving.`,
      });
    }

    throw new WebhookTargetReachabilityError({
      url: url.toString(),
      statusCode: response.status,
      message: detail
        ? `Webhook endpoint responded with status ${response.status} to a health check: ${detail}`
        : `Webhook endpoint responded with status ${response.status} to a health check and may not be available right now.`,
    });
  }

  private async deliverWebhook(
    target: DomainEventDeliveryTarget,
    eventName: WebhookEventName,
    eventId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const payload = this.renderPayloadTemplate(target.payload, context);
    const url = this.validateTarget(target, eventName);
    const response = await this.fetchImpl(url.toString(), {
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
