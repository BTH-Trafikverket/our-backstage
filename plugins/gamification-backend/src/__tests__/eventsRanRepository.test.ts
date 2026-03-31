import { EventsRanRepository } from '../repositories/eventsRanRepository';
import { WebhooksRepository } from '../repositories/webhooksRepository';
import { resolveScheduledWebhookPeriod } from '../services/scheduledWebhookPeriod';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('EventsRanRepository integration', () => {
  it('stores one execution per webhook, event, and period key', async () => {
    const knex = await initDb();
    const webhooksRepository = new WebhooksRepository(knex);
    const eventsRanRepository = new EventsRanRepository(knex);
    const webhook = await webhooksRepository.createWebhook({
      url: 'https://example.com/daily',
      json: { kind: 'daily' },
      event: 'daily',
    });
    const period = resolveScheduledWebhookPeriod({
      event: 'daily',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      eventsRanRepository.tryInsertRun({
        webhookId: webhook.id,
        event: webhook.event,
        periodKey: period.periodKey,
        timeZone: period.timeZone,
        periodStart: period.periodStart,
        periodEndExclusive: period.periodEndExclusive,
      }),
    ).resolves.toBe(true);

    await expect(
      eventsRanRepository.tryInsertRun({
        webhookId: webhook.id,
        event: webhook.event,
        periodKey: period.periodKey,
        timeZone: period.timeZone,
        periodStart: period.periodStart,
        periodEndExclusive: period.periodEndExclusive,
      }),
    ).resolves.toBe(false);

    await expect(
      eventsRanRepository.findRunForPeriod({
        webhookId: webhook.id,
        event: webhook.event,
        periodKey: period.periodKey,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        webhook_id: webhook.id,
        event: 'daily',
        period_key: '2026-04-01',
      }),
    );
  });
});
