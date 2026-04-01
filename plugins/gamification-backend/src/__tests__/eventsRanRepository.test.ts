import { EventsRanRepository } from '../repositories/eventsRanRepository';
import { WebhookRepository } from '../repositories/webhookRepository';
import { resolveScheduledWebhookPeriod } from '../services/scheduledWebhookPeriod';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('EventsRanRepository integration', () => {
  it('stores one execution per webhook, event, and period key', async () => {
    const knex = await initDb();
    const webhookRepository = new WebhookRepository(knex);
    const eventsRanRepository = new EventsRanRepository(knex);
    const webhook = await webhookRepository.createWebhook({
      title: 'Daily Webhook',
      description: '',
      url: 'https://example.com/daily',
      payload: { kind: 'daily' },
      trigger_event_name: 'daily',
    });
    const period = resolveScheduledWebhookPeriod({
      event: 'daily',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      eventsRanRepository.tryInsertRun({
        webhookId: webhook.id,
        triggerEventName: webhook.trigger_event_name,
        periodKey: period.periodKey,
        timeZone: period.timeZone,
        periodStart: period.periodStart,
        periodEndExclusive: period.periodEndExclusive,
      }),
    ).resolves.toBe(true);

    await expect(
      eventsRanRepository.tryInsertRun({
        webhookId: webhook.id,
        triggerEventName: webhook.trigger_event_name,
        periodKey: period.periodKey,
        timeZone: period.timeZone,
        periodStart: period.periodStart,
        periodEndExclusive: period.periodEndExclusive,
      }),
    ).resolves.toBe(false);

    await expect(
      eventsRanRepository.findRunForPeriod({
        webhookId: webhook.id,
        triggerEventName: webhook.trigger_event_name,
        periodKey: period.periodKey,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        webhook_id: webhook.id,
        trigger_event_name: 'daily',
        period_key: '2026-04-01',
      }),
    );
  });
});
