import { NotFoundError } from '@backstage/errors';
import type { DomainEventRow } from '../repositories/domainEventsRepository';
import {
  WebhookService,
  WebhookTargetReachabilityError,
} from '../services/webhookService';

describe('WebhookService', () => {
  const originalFetch = global.fetch;
  const serviceOpts = { credentials: {} as any };

  const createDomainEvent = (
    overrides: Partial<DomainEventRow> = {},
  ): DomainEventRow =>
    ({
      id: 'event-1',
      event_name: 'quest.completed',
      source_table: 'xp_awards',
      source_id: 'xp-award-1',
      subject_ref: 'user:default/alice',
      quest_id: 'quest-1',
      badge_id: null,
      payload: {},
      delivery_targets: null,
      occurred_at: new Date('2026-04-06T10:00:00.000Z'),
      available_at: new Date('2026-04-06T10:00:00.000Z'),
      claimed_at: null,
      claimed_by: null,
      attempt_count: 1,
      processed_at: null,
      dead_lettered_at: null,
      last_error: null,
      ...overrides,
    } as DomainEventRow);

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('returns static metadata for a known webhook event', async () => {
    const service = new WebhookService({
      webhookRepo: {} as any,
    });

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
    const service = new WebhookService({
      webhookRepo: {} as any,
    });

    await expect(
      service.getWebhookEventMetadata('unknown.event'),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects private targets during create using the delivery policy', async () => {
    const webhookRepo = {
      getWebhookTriggerEvent: jest.fn(),
      createWebhook: jest.fn(),
    };
    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
    });

    await expect(
      service.createWebhook(
        {
          title: 'Private target',
          description: '',
          url: 'https://127.0.0.1/webhook',
          event: 'quest.completed',
          payload: {},
        },
        serviceOpts,
      ),
    ).rejects.toThrow("Webhook target host '127.0.0.1' is not allowed");

    expect(webhookRepo.getWebhookTriggerEvent).not.toHaveBeenCalled();
    expect(webhookRepo.createWebhook).not.toHaveBeenCalled();
  });

  it('raises an overrideable reachability warning when create health check gets a 404', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue(''),
    });
    const webhookRepo = {
      getWebhookTriggerEvent: jest.fn().mockResolvedValue({ name: 'daily' }),
      createWebhook: jest.fn(),
    };
    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      service.createWebhook(
        {
          title: 'Down target',
          description: '',
          url: 'https://example.com/webhook',
          event: 'quest.completed',
          payload: {},
        },
        serviceOpts,
      ),
    ).rejects.toThrow(WebhookTargetReachabilityError);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
        signal: expect.any(Object),
      }),
    );
    expect(webhookRepo.createWebhook).not.toHaveBeenCalled();
  });

  it('allows create to proceed when the caller skips the endpoint health check warning', async () => {
    const fetchImpl = jest.fn();
    const webhookRepo = {
      getWebhookTriggerEvent: jest.fn().mockResolvedValue({ name: 'daily' }),
      createWebhook: jest.fn().mockResolvedValue({
        id: 'webhook-1',
        title: 'Override target',
        description: '',
        url: 'https://example.com/webhook',
        trigger_event_name: 'quest.completed',
        payload: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
    };
    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      service.createWebhook(
        {
          title: 'Override target',
          description: '',
          url: 'https://example.com/webhook',
          event: 'quest.completed',
          payload: {},
          skipEndpointHealthCheck: true,
        },
        serviceOpts,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'webhook-1',
        url: 'https://example.com/webhook',
      }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(webhookRepo.createWebhook).toHaveBeenCalled();
  });

  it('does not probe reachability when editing a webhook without changing its URL', async () => {
    const fetchImpl = jest.fn();
    const webhookRepo = {
      getWebhookById: jest.fn().mockResolvedValue({
        id: 'webhook-1',
        title: 'Existing webhook',
        description: '',
        url: 'https://example.com/webhook',
        trigger_event_name: 'quest.completed',
        payload: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
      updateWebhook: jest.fn().mockResolvedValue({
        id: 'webhook-1',
        title: 'Renamed webhook',
        description: '',
        url: 'https://example.com/webhook',
        trigger_event_name: 'quest.completed',
        payload: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
      getWebhookTriggerEvent: jest.fn(),
    };
    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await service.editWebhook(
      'webhook-1',
      { title: 'Renamed webhook' },
      serviceOpts,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(webhookRepo.updateWebhook).toHaveBeenCalled();
  });

  it('renders handlebars variables into the saved JSON payload before POSTing', async () => {
    const webhookRepo = {
      getWebhooksByEventNames: jest.fn(),
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
    });

    await service.deliverDomainEvent(
      createDomainEvent({
        payload: {
          username: 'alice',
          quest_title: 'Daily Commit',
          xp_reward: 100,
        },
        delivery_targets: [
          {
            id: 'webhook-1',
            title: 'Quest feed',
            url: 'https://example.com/webhook',
            payload: {
              content:
                '{{username}} has completed {{quest_title}} and earned {{xp_reward}} XP.',
            },
          },
        ],
      }),
    );

    expect(webhookRepo.getWebhooksByEventNames).not.toHaveBeenCalled();
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
  });

  it('throws render errors when template variables are missing', async () => {
    const webhookRepo = {
      getWebhooksByEventNames: jest.fn(),
    };

    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
    });

    await expect(
      service.deliverDomainEvent(
        createDomainEvent({
          payload: {
            username: 'alice',
          },
          delivery_targets: [
            {
              id: 'webhook-1',
              title: 'Quest feed',
              url: 'https://example.com/webhook',
              payload: {
                content: '{{username}} completed {{quest_title}}',
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to current webhook lookup only for legacy events without target snapshots', async () => {
    const webhookRepo = {
      getWebhooksByEventNames: jest.fn(async () => [
        {
          id: 'webhook-1',
          title: 'Legacy Quest feed',
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
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const service = new WebhookService({
      webhookRepo: webhookRepo as any,
    });

    await service.deliverDomainEvent(
      createDomainEvent({
        id: 'event-legacy',
        source_id: 'xp-award-legacy',
        payload: {
          username: 'alice',
          quest_title: 'Legacy Quest',
        },
      }),
    );

    expect(webhookRepo.getWebhooksByEventNames).toHaveBeenCalledWith([
      'quest.completed',
    ]);
  });
});
