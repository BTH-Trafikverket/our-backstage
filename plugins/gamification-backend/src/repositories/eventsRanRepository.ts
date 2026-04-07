import type { Knex } from 'knex';
import type { WebhookRow } from './webhookRepository';

export type EventRunRow = {
  id: string;
  webhook_id: string;
  trigger_event_name: string;
  period_key: string;
  time_zone: string;
  period_start: Date;
  period_end_exclusive: Date;
  executed_at: Date;
  created_at: Date;
};

export type CreateEventRunRow = {
  webhookId: string;
  triggerEventName: string;
  periodKey: string;
  timeZone: string;
  periodStart: Date;
  periodEndExclusive: Date;
  executedAt?: Date;
};

export class EventsRanRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async withTransaction<T>(
    fn: (repo: EventsRanRepository, trx: Knex.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx =>
      fn(new EventsRanRepository(trx), trx),
    );
  }

  async lockWebhookPeriod(webhookId: string, periodKey: string): Promise<void> {
    await this.db.raw(
      'SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))',
      [webhookId, periodKey],
    );
  }

  async findRunForPeriod(params: {
    webhookId: string;
    triggerEventName: WebhookRow['trigger_event_name'];
    periodKey: string;
  }): Promise<EventRunRow | undefined> {
    return this.db<EventRunRow>('events_ran')
      .where({
        webhook_id: params.webhookId,
        trigger_event_name: params.triggerEventName,
        period_key: params.periodKey,
      })
      .first();
  }

  async tryInsertRun(params: CreateEventRunRow): Promise<boolean> {
    try {
      await this.db<EventRunRow>('events_ran').insert({
        webhook_id: params.webhookId,
        trigger_event_name: params.triggerEventName,
        period_key: params.periodKey,
        time_zone: params.timeZone,
        period_start: params.periodStart,
        period_end_exclusive: params.periodEndExclusive,
        ...(params.executedAt ? { executed_at: params.executedAt } : {}),
      });
      return true;
    } catch (e: any) {
      if (e?.code === '23505') {
        return false;
      }
      throw e;
    }
  }
}
