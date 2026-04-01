import type { LoggerService } from '@backstage/backend-plugin-api';
import { EventsRanRepository } from '../repositories/eventsRanRepository';
import type {
  ScheduledWebhookRow,
  ScheduledWebhookEvent,
} from '../repositories/webhookRepository';
import { WebhookRepository } from '../repositories/webhookRepository';
import { WebhookDeliveryService } from './webhookDeliveryService';
import {
  DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE,
  resolveScheduledWebhookPeriod,
} from './scheduledWebhookPeriod';

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
      deliveryService: WebhookDeliveryService;
      logger: LoggerService;
      now?: () => Date;
      timeZone?: string;
    },
  ) {}

  private getNow(): Date {
    return this.options.now?.() ?? new Date();
  }

  private getTimeZone(): string {
    return this.options.timeZone ?? DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE;
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
      return await this.options.eventsRanRepo.withTransaction(async repo => {
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

        // Hold the transaction lock across the delivery+ledger sequence so
        // concurrent startups do not double-deliver the same webhook period.
        await this.options.deliveryService.sendWebhook(webhook);

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

        return {
          webhookId: webhook.id,
          event,
          periodKey: period.periodKey,
          status: 'executed',
        };
      });
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
