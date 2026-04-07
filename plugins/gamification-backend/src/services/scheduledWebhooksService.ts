import type { LoggerService } from '@backstage/backend-plugin-api';
import { DomainEventsRepository } from '../repositories/domainEventsRepository';
import { EventsRanRepository } from '../repositories/eventsRanRepository';
import { ScheduledWebhookSummaryRepository } from '../repositories/scheduledWebhookSummaryRepository';
import type { Knex } from 'knex';
import type {
  ScheduledWebhookRow,
  ScheduledWebhookEvent,
} from '../repositories/webhookRepository';
import { WebhookRepository } from '../repositories/webhookRepository';
import {
  DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE,
  resolveScheduledWebhookPeriod,
} from './scheduledWebhookPeriod';

const SCHEDULED_WEBHOOK_SUBJECT_REF = 'system:default/gamification-scheduler';

export type ScheduledWebhookScanResult = {
  webhookId: string;
  event: ScheduledWebhookEvent;
  periodKey: string;
  status: 'executed' | 'skipped' | 'failed';
  reason?: 'already_ran';
  error?: string;
};

export type ScheduledWebhookScanSummary = {
  executedCount: number;
  skippedCount: number;
  failedCount: number;
  results: ScheduledWebhookScanResult[];
};

export class ScheduledWebhooksService {
  constructor(
    private readonly options: {
      webhookRepo: WebhookRepository;
      eventsRanRepo: EventsRanRepository;
      logger: LoggerService;
      now?: () => Date;
      timeZone?: string;
      createDomainEventsRepo?: (
        trx: Knex.Transaction,
      ) => Pick<DomainEventsRepository, 'enqueueEvent'>;
      createScheduledSummaryRepo?: (
        trx: Knex.Transaction,
      ) => Pick<ScheduledWebhookSummaryRepository, 'getSummary'>;
    },
  ) {}

  private getNow(): Date {
    return this.options.now?.() ?? new Date();
  }

  private getTimeZone(): string {
    return this.options.timeZone ?? DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE;
  }

  private buildBaseScheduledDomainEventPayload(
    webhook: ScheduledWebhookRow,
    event: ScheduledWebhookEvent,
    period: ReturnType<typeof resolveScheduledWebhookPeriod>,
  ): Record<string, unknown> {
    return {
      schedule: {
        event,
        periodKey: period.periodKey,
        timeZone: period.timeZone,
        periodStart: period.periodStart.toISOString(),
        periodEndExclusive: period.periodEndExclusive.toISOString(),
      },
      webhook: {
        id: webhook.id,
        title: webhook.title,
      },
      webhook_id: webhook.id,
      webhook_title: webhook.title,
      period_key: period.periodKey,
      time_zone: period.timeZone,
      period_start: period.periodStart.toISOString(),
      period_end_exclusive: period.periodEndExclusive.toISOString(),
    };
  }

  async scanAndRunScheduledWebhooks(): Promise<ScheduledWebhookScanSummary> {
    const scheduledWebhooks =
      await this.options.webhookRepo.getScheduledWebhooks();
    const results: ScheduledWebhookScanResult[] = [];

    for (const webhook of scheduledWebhooks) {
      results.push(await this.runWebhookIfDue(webhook));
    }

    return {
      executedCount: results.filter(result => result.status === 'executed')
        .length,
      skippedCount: results.filter(result => result.status === 'skipped')
        .length,
      failedCount: results.filter(result => result.status === 'failed').length,
      results,
    };
  }

  private async runWebhookIfDue(
    webhook: ScheduledWebhookRow,
  ): Promise<ScheduledWebhookScanResult> {
    const event = webhook.trigger_event_name as ScheduledWebhookEvent;
    const period = resolveScheduledWebhookPeriod({
      event,
      now: this.getNow(),
      timeZone: this.getTimeZone(),
    });

    try {
      return await this.options.eventsRanRepo.withTransaction(
        async (repo, trx) => {
          const domainEventsRepo =
            this.options.createDomainEventsRepo?.(trx) ??
            new DomainEventsRepository(trx);
          const scheduledSummaryRepo =
            this.options.createScheduledSummaryRepo?.(trx) ??
            new ScheduledWebhookSummaryRepository(trx);

          await repo.lockWebhookPeriod(webhook.id, period.periodKey);

          const existingRun = await repo.findRunForPeriod({
            webhookId: webhook.id,
            triggerEventName: webhook.trigger_event_name,
            periodKey: period.periodKey,
          });

          if (existingRun) {
            return {
              webhookId: webhook.id,
              event,
              periodKey: period.periodKey,
              status: 'skipped',
              reason: 'already_ran',
            };
          }

          const recorded = await repo.tryInsertRun({
            webhookId: webhook.id,
            triggerEventName: webhook.trigger_event_name,
            periodKey: period.periodKey,
            timeZone: period.timeZone,
            periodStart: period.periodStart,
            periodEndExclusive: period.periodEndExclusive,
            executedAt: this.getNow(),
          });

          if (!recorded) {
            return {
              webhookId: webhook.id,
              event,
              periodKey: period.periodKey,
              status: 'skipped',
              reason: 'already_ran',
            };
          }

          const payload = {
            ...this.buildBaseScheduledDomainEventPayload(
              webhook,
              event,
              period,
            ),
            ...(await scheduledSummaryRepo.getSummary({
              periodStart: period.periodStart,
              periodEndExclusive: period.periodEndExclusive,
            })),
          };

          await domainEventsRepo.enqueueEvent({
            eventName: event,
            sourceTable: 'scheduled_webhooks',
            sourceId: `${webhook.id}:${period.periodKey}`,
            subjectRef: SCHEDULED_WEBHOOK_SUBJECT_REF,
            payload,
            occurredAt: this.getNow(),
            availableAt: this.getNow(),
          });

          return {
            webhookId: webhook.id,
            event,
            periodKey: period.periodKey,
            status: 'executed',
          };
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.error(
        `gamification scheduled webhook '${webhook.id}' failed for ${period.periodKey}: ${message}`,
      );

      return {
        webhookId: webhook.id,
        event,
        periodKey: period.periodKey,
        status: 'failed',
        error: message,
      };
    }
  }
}
