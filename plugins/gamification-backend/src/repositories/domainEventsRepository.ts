import type { Knex } from 'knex';
import type { WebhookEventName } from '../services/webhookService';

export type DomainEventDeliveryTarget = {
  id: string;
  title: string;
  url: string;
  payload: Record<string, unknown>;
};

export type DomainEventRow = {
  id: string;
  event_name: WebhookEventName;
  source_table: string;
  source_id: string;
  subject_ref: string;
  quest_id: string | null;
  badge_id: string | null;
  payload: Record<string, unknown>;
  delivery_targets: DomainEventDeliveryTarget[] | null;
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

  async enqueueEvent(params: {
    eventName: WebhookEventName;
    sourceTable: string;
    sourceId: string;
    subjectRef: string;
    questId?: string | null;
    badgeId?: string | null;
    payload?: Record<string, unknown>;
    deliveryTargets?: DomainEventDeliveryTarget[];
    occurredAt?: Date;
    availableAt?: Date;
  }): Promise<DomainEventRow | undefined> {
    const payloadJson = this.db.raw('?::jsonb', [
      JSON.stringify(params.payload ?? {}),
    ]);
    const deliveryTargetsJson = this.db.raw('?::jsonb', [
      JSON.stringify(params.deliveryTargets ?? []),
    ]);

    const rows = await this.db<DomainEventRow>('domain_events')
      .insert({
        event_name: params.eventName,
        source_table: params.sourceTable,
        source_id: params.sourceId,
        subject_ref: params.subjectRef,
        quest_id: params.questId ?? null,
        badge_id: params.badgeId ?? null,
        payload: payloadJson,
        delivery_targets: deliveryTargetsJson,
        ...(params.occurredAt ? { occurred_at: params.occurredAt } : {}),
        ...(params.availableAt ? { available_at: params.availableAt } : {}),
      })
      .onConflict(['event_name', 'source_table', 'source_id'])
      .ignore()
      .returning('*');

    const created = rows[0];
    if (!created) {
      return undefined;
    }

    await this.db.raw('SELECT pg_notify(?, ?::text)', [
      'gamification_domain_events',
      JSON.stringify({
        id: created.id,
        eventName: created.event_name,
      }),
    ]);

    return created;
  }

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
