import { InputError } from '@backstage/errors';
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

export class WebhookService {
  private readonly webhookRepo: WebhookRepository;

  constructor(options: { webhookRepo: WebhookRepository }) {
    this.webhookRepo = options.webhookRepo;
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
}
