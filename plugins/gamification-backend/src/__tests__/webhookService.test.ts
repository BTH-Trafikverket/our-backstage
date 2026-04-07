import { NotFoundError } from '@backstage/errors';
import { WebhookService } from '../services/webhookService';

describe('WebhookService', () => {
  function createService() {
    return new WebhookService({
      webhookRepo: {} as any,
    });
  }

  it('returns static metadata for a known webhook event', async () => {
    const service = createService();

    await expect(
      service.getWebhookEventMetadata('quest.completed'),
    ).resolves.toEqual({
      event: 'quest.completed',
      labels: ['username', 'quest_title', 'total_xp', 'xp_reward'],
      template: {
        content:
          '{{username}} completed {{quest_title}} and earned {{xp_reward}} XP.',
      },
    });
  });

  it('throws NotFoundError for an unknown webhook event', async () => {
    const service = createService();

    await expect(
      service.getWebhookEventMetadata('unknown.event'),
    ).rejects.toThrow(NotFoundError);
  });
});
