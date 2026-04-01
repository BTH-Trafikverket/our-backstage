import { EventsRanRepository } from '../repositories/eventsRanRepository';
import type { WebhookRow } from '../repositories/webhookRepository';
import type { ScheduledWebhookPeriod } from './scheduledWebhookPeriod';

export class ScheduledWebhookLedgerService {
  constructor(private readonly eventsRanRepo: EventsRanRepository) {}

  async hasRunForPeriod(
    webhook: Pick<WebhookRow, 'id' | 'trigger_event_name'>,
    period: Pick<ScheduledWebhookPeriod, 'periodKey'>,
  ): Promise<boolean> {
    const existing = await this.eventsRanRepo.findRunForPeriod({
      webhookId: webhook.id,
      triggerEventName: webhook.trigger_event_name,
      periodKey: period.periodKey,
    });

    return Boolean(existing);
  }

  async tryRecordRun(
    webhook: Pick<WebhookRow, 'id' | 'trigger_event_name'>,
    period: ScheduledWebhookPeriod,
    executedAt?: Date,
  ): Promise<boolean> {
    return this.eventsRanRepo.tryInsertRun({
      webhookId: webhook.id,
      triggerEventName: webhook.trigger_event_name,
      periodKey: period.periodKey,
      timeZone: period.timeZone,
      periodStart: period.periodStart,
      periodEndExclusive: period.periodEndExclusive,
      executedAt,
    });
  }
}
