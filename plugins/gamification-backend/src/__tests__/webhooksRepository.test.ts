import { WebhookRepository } from '../repositories/webhookRepository';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('WebhookRepository scheduled integration', () => {
  it('stores webhooks and filters scheduled rows separately from immediate ones', async () => {
    const knex = await initDb();
    const repository = new WebhookRepository(knex);

    const dailyWebhook = await repository.createWebhook({
      title: 'Daily Webhook',
      description: '',
      url: 'https://example.com/daily',
      payload: { kind: 'daily' },
      trigger_event_name: 'daily',
    });
    await repository.createWebhook({
      title: 'Weekly Webhook',
      description: '',
      url: 'https://example.com/weekly',
      payload: { kind: 'weekly' },
      trigger_event_name: 'weekly',
    });
    await repository.createWebhook({
      title: 'Quest Webhook',
      description: '',
      url: 'https://example.com/quest',
      payload: { kind: 'quest' },
      trigger_event_name: 'quest.completed',
    });

    await expect(repository.getScheduledWebhooks()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: dailyWebhook.id,
          url: 'https://example.com/daily',
          trigger_event_name: 'daily',
        }),
        expect.objectContaining({
          url: 'https://example.com/weekly',
          trigger_event_name: 'weekly',
        }),
      ]),
    );
  });
});
