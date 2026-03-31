import { WebhooksRepository } from '../repositories/webhooksRepository';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('WebhooksRepository integration', () => {
  it('stores webhooks and filters scheduled rows separately from immediate ones', async () => {
    const knex = await initDb();
    const repository = new WebhooksRepository(knex);

    const dailyWebhook = await repository.createWebhook({
      url: 'https://example.com/daily',
      json: { kind: 'daily' },
      event: 'daily',
    });
    await repository.createWebhook({
      url: 'https://example.com/weekly',
      json: { kind: 'weekly' },
      event: 'weekly',
    });
    await repository.createWebhook({
      url: 'https://example.com/quest',
      json: { kind: 'quest' },
      event: 'quest_completion',
    });

    await expect(repository.getWebhooksByEvent('daily')).resolves.toEqual([
      expect.objectContaining({
        id: dailyWebhook.id,
        url: 'https://example.com/daily',
        event: 'daily',
        json: { kind: 'daily' },
      }),
    ]);

    await expect(repository.getScheduledWebhooks()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://example.com/daily',
          event: 'daily',
        }),
        expect.objectContaining({
          url: 'https://example.com/weekly',
          event: 'weekly',
        }),
      ]),
    );
  });
});
