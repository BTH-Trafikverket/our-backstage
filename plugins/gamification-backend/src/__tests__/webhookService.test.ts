import { WebhookService } from '../services/webhookService';

describe('WebhookService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('renders handlebars variables into the saved JSON payload before POSTing', async () => {
    const webhookRepo = {
      getWebhooksByEventNames: jest.fn(async () => [
        {
          id: 'webhook-1',
          title: 'Quest feed',
          description: '',
          url: 'https://example.com/webhook',
          trigger_event_name: 'quest.completed',
          payload: {
            content:
              '{{username}} has completed {{quest_title}} and earned {{xp_reward}} XP.',
          },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    };
    const logger = {
      warn: jest.fn(),
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
      logger: logger as any,
    });

    await service.dispatchEvents([
      {
        name: 'quest.completed',
        context: {
          username: 'alice',
          quest_title: 'Daily Commit',
          xp_reward: 100,
        },
      },
    ]);

    expect(webhookRepo.getWebhooksByEventNames).toHaveBeenCalledWith([
      'quest.completed',
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'alice has completed Daily Commit and earned 100 XP.',
        }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs render errors instead of throwing when template variables are missing', async () => {
    const webhookRepo = {
      getWebhooksByEventNames: jest.fn(async () => [
        {
          id: 'webhook-1',
          title: 'Quest feed',
          description: '',
          url: 'https://example.com/webhook',
          trigger_event_name: 'quest.completed',
          payload: {
            content: '{{username}} completed {{quest_title}}',
          },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    };
    const logger = {
      warn: jest.fn(),
    };

    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
      logger: logger as any,
    });

    await expect(
      service.dispatchEvents([
        {
          name: 'quest.completed',
          context: {
            username: 'alice',
          },
        },
      ]),
    ).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
