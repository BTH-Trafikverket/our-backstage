import { EventsRanRepository } from '../repositories/eventsRanRepository';
import type { WebhookRow } from '../repositories/webhooksRepository';
import type { ScheduledWebhookPeriod } from './scheduledWebhookPeriod';

export class ScheduledWebhookLedgerService {
  constructor(private readonly eventsRanRepo: EventsRanRepository) {}

  async hasRunForPeriod(
    webhook: Pick<WebhookRow, 'id' | 'event'>,
    period: Pick<ScheduledWebhookPeriod, 'periodKey'>,
  ): Promise<boolean> {
    const existing = await this.eventsRanRepo.findRunForPeriod({
      webhookId: webhook.id,
      event: webhook.event,
      periodKey: period.periodKey,
    });

    return Boolean(existing);
  }

  async tryRecordRun(
    webhook: Pick<WebhookRow, 'id' | 'event'>,
    period: ScheduledWebhookPeriod,
    executedAt?: Date,
  ): Promise<boolean> {
    return this.eventsRanRepo.tryInsertRun({
      webhookId: webhook.id,
      event: webhook.event,
      periodKey: period.periodKey,
      timeZone: period.timeZone,
      periodStart: period.periodStart,
      periodEndExclusive: period.periodEndExclusive,
      executedAt,
    });
  }
}
