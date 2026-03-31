import type { Knex } from 'knex';

export const SCHEDULED_WEBHOOK_EVENTS = ['daily', 'weekly', 'monthly'] as const;
export type ScheduledWebhookEvent = (typeof SCHEDULED_WEBHOOK_EVENTS)[number];

export type WebhookRow = {
  id: string;
  url: string;
  json: Record<string, unknown>;
  event: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateWebhookRow = {
  url: string;
  json?: Record<string, unknown>;
  event: string;
};

export class WebhooksRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async withTransaction<T>(
    fn: (repo: WebhooksRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx => fn(new WebhooksRepository(trx)));
  }

  async createWebhook(data: CreateWebhookRow): Promise<WebhookRow> {
    const rows = await this.db<WebhookRow>('webhooks')
      .insert({
        url: data.url,
        json: data.json ?? {},
        event: data.event,
      })
      .returning('*');

    return rows[0];
  }

  async listWebhooks(): Promise<WebhookRow[]> {
    return this.db<WebhookRow>('webhooks')
      .select('*')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }

  async getWebhooksByEvent(event: string): Promise<WebhookRow[]> {
    return this.db<WebhookRow>('webhooks')
      .where({ event })
      .select('*')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }

  async getScheduledWebhooks(): Promise<WebhookRow[]> {
    return this.db<WebhookRow>('webhooks')
      .whereIn('event', [...SCHEDULED_WEBHOOK_EVENTS])
      .select('*')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }
}
