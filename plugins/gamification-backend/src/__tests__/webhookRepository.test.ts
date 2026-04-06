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

    expect(await repository.getWebhookTriggerEvent('daily')).toEqual(
      expect.objectContaining({ name: 'daily' }),
    );

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

  it('updates and deletes persisted webhooks', async () => {
    const knex = await initDb();
    const repository = new WebhookRepository(knex);

    const webhook = await repository.createWebhook({
      title: 'Mutable Webhook',
      description: 'Before update',
      url: 'https://example.com/original',
      trigger_event_name: 'quest.completed',
      payload: { retries: 1 },
    });

    const updated = await repository.updateWebhook(webhook.id, {
      title: 'Updated Webhook',
      description: '',
      url: 'https://example.com/updated',
      trigger_event_name: 'badge.earned',
      payload: { retries: 5 },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        id: webhook.id,
        title: 'Updated Webhook',
        description: '',
        url: 'https://example.com/updated',
        trigger_event_name: 'badge.earned',
        payload: { retries: 5 },
      }),
    );
    expect(updated?.updated_at.getTime()).toBeGreaterThanOrEqual(
      webhook.updated_at.getTime(),
    );
    expect(await repository.getWebhookById(webhook.id)).toEqual(
      expect.objectContaining({
        id: webhook.id,
        title: 'Updated Webhook',
      }),
    );

    await expect(repository.deleteWebhook(webhook.id)).resolves.toBe(true);
    await expect(
      repository.getWebhookById(webhook.id),
    ).resolves.toBeUndefined();

    await knex.destroy();
  });
});
