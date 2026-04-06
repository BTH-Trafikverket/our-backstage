import { WebhookService } from '../services/webhookService';
import type { DomainEventRow } from '../repositories/domainEventsRepository';

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

    await service.deliverDomainEvent({
      id: 'event-1',
      event_name: 'quest.completed',
      source_table: 'xp_awards',
      source_id: 'xp-award-1',
      subject_ref: 'user:default/alice',
      quest_id: 'quest-1',
      badge_id: null,
      payload: {
        username: 'alice',
        quest_title: 'Daily Commit',
        xp_reward: 100,
      },
      occurred_at: new Date('2026-04-06T10:00:00.000Z'),
      available_at: new Date('2026-04-06T10:00:00.000Z'),
      claimed_at: null,
      claimed_by: null,
      attempt_count: 1,
      processed_at: null,
      dead_lettered_at: null,
      last_error: null,
    } as DomainEventRow);

    expect(webhookRepo.getWebhooksByEventNames).toHaveBeenCalledWith([
      'quest.completed',
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gamification-Event-Id': 'event-1',
          'X-Gamification-Event-Name': 'quest.completed',
        },
        body: JSON.stringify({
          content: 'alice has completed Daily Commit and earned 100 XP.',
        }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('throws render errors when template variables are missing', async () => {
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
      service.deliverDomainEvent({
        id: 'event-2',
        event_name: 'quest.completed',
        source_table: 'xp_awards',
        source_id: 'xp-award-2',
        subject_ref: 'user:default/alice',
        quest_id: 'quest-1',
        badge_id: null,
        payload: {
          username: 'alice',
        },
        occurred_at: new Date('2026-04-06T10:00:00.000Z'),
        available_at: new Date('2026-04-06T10:00:00.000Z'),
        claimed_at: null,
        claimed_by: null,
        attempt_count: 1,
        processed_at: null,
        dead_lettered_at: null,
        last_error: null,
      } as DomainEventRow),
    ).rejects.toThrow();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
