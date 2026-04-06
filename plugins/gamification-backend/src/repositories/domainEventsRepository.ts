import type { Knex } from 'knex';
import type { WebhookEventName } from '../services/webhookService';

export type DomainEventRow = {
  id: string;
  event_name: WebhookEventName;
  source_table: string;
  source_id: string;
  subject_ref: string;
  quest_id: string | null;
  badge_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: Date;
  available_at: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  attempt_count: number;
  processed_at: Date | null;
  dead_lettered_at: Date | null;
  last_error: string | null;
};

export class DomainEventsRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async claimPendingEvents(params: {
    workerId: string;
    batchSize: number;
    maxAttempts: number;
    claimTtlMs: number;
  }): Promise<DomainEventRow[]> {
    const result = await this.db.raw<
      { rows: DomainEventRow[] } | DomainEventRow[]
    >(
      `
        WITH candidates AS (
          SELECT id
          FROM domain_events
          WHERE processed_at IS NULL
            AND dead_lettered_at IS NULL
            AND available_at <= now()
            AND attempt_count < ?
            AND (
              claimed_at IS NULL
              OR claimed_at <= now() - (? * interval '1 millisecond')
            )
          ORDER BY occurred_at ASC, id ASC
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
        UPDATE domain_events domain_events
        SET claimed_at = now(),
            claimed_by = ?,
            attempt_count = domain_events.attempt_count + 1,
            last_error = NULL
        FROM candidates
        WHERE domain_events.id = candidates.id
        RETURNING domain_events.*;
      `,
      [
        params.maxAttempts,
        params.claimTtlMs,
        params.batchSize,
        params.workerId,
      ],
    );

    return Array.isArray(result) ? result : result.rows;
  }

  async markProcessed(id: string): Promise<void> {
    await this.db<DomainEventRow>('domain_events').where({ id }).update({
      processed_at: this.db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      last_error: null,
    });
  }

  async markFailed(params: {
    id: string;
    attemptCount: number;
    maxAttempts: number;
    retryDelayMs: number;
    error: string;
  }): Promise<void> {
    const lastError = params.error.slice(0, 4000);

    if (params.attemptCount >= params.maxAttempts) {
      await this.db<DomainEventRow>('domain_events')
        .where({ id: params.id })
        .update({
          claimed_at: null,
          claimed_by: null,
          dead_lettered_at: this.db.fn.now(),
          last_error: lastError,
        });
      return;
    }

    await this.db<DomainEventRow>('domain_events')
      .where({ id: params.id })
      .update({
        claimed_at: null,
        claimed_by: null,
        available_at: this.db.raw(`now() + (? * interval '1 millisecond')`, [
          params.retryDelayMs,
        ]),
        last_error: lastError,
      });
  }
}
