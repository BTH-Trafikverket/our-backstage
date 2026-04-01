import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';
import { WebhookRepository } from '../repositories/webhookRepository';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('WebhookRepository integration', () => {
  it('creates and paginates webhooks ordered by newest first', async () => {
    const knex = await initDb();
    const repository = new WebhookRepository(knex);

    const first = await repository.createWebhook({
      title: 'First Webhook',
      description: 'First destination',
      url: 'https://example.com/first',
      trigger_event_name: 'quest.completed',
      payload: { timeout: 1000 },
    });
    const second = await repository.createWebhook({
      title: 'Second Webhook',
      description: 'Second destination',
      url: 'https://example.com/second',
      trigger_event_name: 'badge.earned',
      payload: { retries: 3 },
    });
    const third = await repository.createWebhook({
      title: 'Third Webhook',
      description: '',
      url: 'https://example.com/third',
      trigger_event_name: 'user.leveled_up',
      payload: {},
    });

    const firstPage = await repository.getPaginatedWebhooks({
      page: 1,
      limit: 2,
    });
    const secondPage = await repository.getPaginatedWebhooks({
      page: 2,
      limit: 2,
    });

    expect(await repository.getWebhookTriggerEvent('quest.completed')).toEqual(
      expect.objectContaining({ name: 'quest.completed' }),
    );
    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(firstPage.data.map(webhook => webhook.id)).toEqual([
      third.id,
      second.id,
    ]);
    expect(secondPage.data.map(webhook => webhook.id)).toEqual([first.id]);
    expect(firstPage.data[0]?.payload).toEqual({});
    expect(firstPage.data[1]?.payload).toEqual({ retries: 3 });

    await knex.destroy();
  });

  it('enforces that webhooks reference a known trigger event', async () => {
    const knex = await initDb();
    const repository = new WebhookRepository(knex);

    await expect(
      repository.createWebhook({
        title: 'Invalid Webhook',
        description: '',
        url: 'https://example.com/invalid',
        trigger_event_name: 'not.real',
        payload: {},
      }),
    ).rejects.toThrow();

    await knex.destroy();
  });
});
