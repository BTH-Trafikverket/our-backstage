import type { Knex } from 'knex';

export const SCHEDULED_WEBHOOK_TRIGGER_EVENTS = [
  'daily',
  'weekly',
  'monthly',
] as const;

export type ScheduledWebhookEvent =
  (typeof SCHEDULED_WEBHOOK_TRIGGER_EVENTS)[number];

export type WebhookRow = {
  id: string;
  title: string;
  description: string;
  url: string;
  trigger_event_name: string;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type WebhookTriggerEventRow = {
  name: string;
  created_at: Date;
  updated_at: Date;
};

export type ScheduledWebhookRow = WebhookRow & {
  trigger_event_name: ScheduledWebhookEvent;
};

export type CreateWebhookRow = {
  title: string;
  description: string;
  url: string;
  trigger_event_name: string;
  payload: Record<string, unknown>;
};

export type UpdateWebhookRow = Partial<CreateWebhookRow>;

export type WebhookPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedWebhookRowsResult = {
  data: WebhookRow[];
  pagination: WebhookPagination;
};

export class WebhookRepository {
  private readonly db: Knex | Knex.Transaction;

  constructor(db: Knex | Knex.Transaction) {
    this.db = db;
  }

  async withTransaction<T>(
    fn: (repo: WebhookRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx => fn(new WebhookRepository(trx)));
  }

  async createWebhook(data: CreateWebhookRow): Promise<WebhookRow> {
    const rows = await this.db<WebhookRow>('webhooks')
      .insert({
        title: data.title,
        description: data.description,
        url: data.url,
        trigger_event_name: data.trigger_event_name,
        payload: data.payload,
      })
      .returning('*');

    return rows[0];
  }

  async getWebhookById(id: string): Promise<WebhookRow | undefined> {
    return this.db<WebhookRow>('webhooks').where({ id }).first();
  }

  async updateWebhook(
    id: string,
    data: UpdateWebhookRow,
  ): Promise<WebhookRow | undefined> {
    const rows = await this.db<WebhookRow>('webhooks')
      .where({ id })
      .update(data)
      .returning('*');

    return rows[0];
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const deletedCount = await this.db<WebhookRow>('webhooks')
      .where({ id })
      .del();

    return deletedCount > 0;
  }

  async getWebhookTriggerEvent(
    name: string,
  ): Promise<WebhookTriggerEventRow | undefined> {
    return this.db<WebhookTriggerEventRow>('webhook_trigger_events')
      .where({ name })
      .first();
  }

  async getScheduledWebhooks(): Promise<ScheduledWebhookRow[]> {
    const rows = await this.db<WebhookRow>('webhooks')
      .select('*')
      .whereIn('trigger_event_name', [...SCHEDULED_WEBHOOK_TRIGGER_EVENTS])
      .orderBy([
        { column: 'created_at', order: 'asc' },
        { column: 'id', order: 'asc' },
      ]);

    return rows as ScheduledWebhookRow[];
  }

  private getSafePagination(page = 1, limit = 10) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;

    return { safePage, safeLimit, offset };
  }

  async getPaginatedWebhooks(params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedWebhookRowsResult> {
    const { page = 1, limit = 10 } = params ?? {};
    const { safePage, safeLimit, offset } = this.getSafePagination(page, limit);

    const results = await this.db<WebhookRow>('webhooks')
      .select('*')
      .select(this.db.raw('COUNT(*) OVER() as full_count'))
      .orderBy([
        { column: 'created_at', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(safeLimit)
      .offset(offset);

    let total =
      results.length > 0 ? Number((results[0] as any).full_count ?? 0) : 0;

    if (results.length === 0 && safePage > 1) {
      const countRow = await this.db<WebhookRow>('webhooks')
        .count<{ count: string }[]>({ count: '*' })
        .first();

      total = Number(countRow?.count ?? 0);
    }

    const totalPages = Math.ceil(total / safeLimit) || 0;
    const data = results.map(row => {
      const { full_count, ...rest } = row as any;
      return rest as WebhookRow;
    });

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };
  }
}
