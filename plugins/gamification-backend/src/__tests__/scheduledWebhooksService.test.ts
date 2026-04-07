import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  EventRunRow,
  EventsRanRepository,
} from '../repositories/eventsRanRepository';
import type {
  ScheduledWebhookRow,
  WebhookRepository,
} from '../repositories/webhookRepository';
import { ScheduledWebhooksService } from '../services/scheduledWebhooksService';

describe('ScheduledWebhooksService', () => {
  function createWebhook(
    overrides?: Partial<ScheduledWebhookRow>,
  ): ScheduledWebhookRow {
    return {
      id: 'webhook-1',
      title: 'Webhook',
      description: '',
      url: 'https://example.com/webhook',
      payload: { hello: 'world' },
      trigger_event_name: 'daily',
      created_at: new Date('2026-04-01T00:00:00.000Z'),
      updated_at: new Date('2026-04-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function createRun(overrides?: Partial<EventRunRow>): EventRunRow {
    return {
      id: 'run-1',
      webhook_id: 'webhook-1',
      trigger_event_name: 'daily',
      period_key: '2026-03-31',
      time_zone: 'UTC',
      period_start: new Date('2026-03-31T00:00:00.000Z'),
      period_end_exclusive: new Date('2026-04-01T00:00:00.000Z'),
      executed_at: new Date('2026-04-01T00:00:05.000Z'),
      created_at: new Date('2026-04-01T00:00:05.000Z'),
      ...overrides,
    };
  }

  function createMocks() {
    const txRepo = {
      lockWebhookPeriod: jest.fn(),
      findRunForPeriod: jest.fn(),
      tryInsertRun: jest.fn(),
    };
    const enqueueEvent = jest.fn();
    const getSummary = jest.fn(async () => ({
      total_quests_completed: 7,
      total_badges_earned: 2,
      total_xp_awarded: 450,
      top_user_name: 'alice',
      top_user_xp: 250,
      top_team_name: 'payments',
      top_team_xp: 320,
    }));

    const eventsRanRepo = {
      withTransaction: jest.fn(async fn => fn(txRepo, {})),
      lockWebhookPeriod: jest.fn(),
      findRunForPeriod: jest.fn(),
      tryInsertRun: jest.fn(),
    } as unknown as jest.Mocked<EventsRanRepository>;

    const webhooksRepo = {
      getScheduledWebhooks: jest.fn(),
    } as unknown as jest.Mocked<WebhookRepository>;

    const logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    return {
      webhooksRepo,
      eventsRanRepo,
      txRepo,
      enqueueEvent,
      getSummary,
      logger,
    };
  }

  it('executes a daily webhook on startup when no run exists for the current day', async () => {
    const {
      webhooksRepo,
      eventsRanRepo,
      txRepo,
      enqueueEvent,
      getSummary,
      logger,
    } = createMocks();
    webhooksRepo.getScheduledWebhooks.mockResolvedValue([
      createWebhook({ trigger_event_name: 'daily' }),
    ]);
    txRepo.findRunForPeriod.mockResolvedValue(undefined);
    txRepo.tryInsertRun.mockResolvedValue(true);

    const service = new ScheduledWebhooksService({
      webhookRepo: webhooksRepo,
      eventsRanRepo,
      logger,
      createDomainEventsRepo: () => ({ enqueueEvent } as any),
      createScheduledSummaryRepo: () => ({ getSummary } as any),
      now: () => new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(service.scanAndRunScheduledWebhooks()).resolves.toEqual({
      executedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      results: [
        {
          webhookId: 'webhook-1',
          event: 'daily',
          periodKey: '2026-03-31',
          status: 'executed',
        },
      ],
    });

    expect(txRepo.lockWebhookPeriod).toHaveBeenCalledWith(
      'webhook-1',
      '2026-03-31',
    );
    expect(txRepo.tryInsertRun).toHaveBeenCalledTimes(1);
    expect(enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'daily',
        sourceTable: 'scheduled_webhooks',
        sourceId: 'webhook-1:2026-03-31',
        payload: expect.objectContaining({
          total_quests_completed: 7,
          total_badges_earned: 2,
          total_xp_awarded: 450,
          top_user_name: 'alice',
          top_team_name: 'payments',
        }),
      }),
    );
  });

  it('executes weekly and monthly webhooks when their current periods are missing', async () => {
    const {
      webhooksRepo,
      eventsRanRepo,
      txRepo,
      enqueueEvent,
      getSummary,
      logger,
    } = createMocks();
    webhooksRepo.getScheduledWebhooks.mockResolvedValue([
      createWebhook({ id: 'weekly-1', trigger_event_name: 'weekly' }),
      createWebhook({ id: 'monthly-1', trigger_event_name: 'monthly' }),
    ]);
    txRepo.findRunForPeriod.mockResolvedValue(undefined);
    txRepo.tryInsertRun.mockResolvedValue(true);

    const service = new ScheduledWebhooksService({
      webhookRepo: webhooksRepo,
      eventsRanRepo,
      logger,
      createDomainEventsRepo: () => ({ enqueueEvent } as any),
      createScheduledSummaryRepo: () => ({ getSummary } as any),
      now: () => new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    const summary = await service.scanAndRunScheduledWebhooks();

    expect(summary.executedCount).toBe(2);
    expect(summary.results).toEqual([
      expect.objectContaining({
        webhookId: 'weekly-1',
        event: 'weekly',
        periodKey: 'week:2026-03-23',
        status: 'executed',
      }),
      expect.objectContaining({
        webhookId: 'monthly-1',
        event: 'monthly',
        periodKey: '2026-03',
        status: 'executed',
      }),
    ]);
    expect(enqueueEvent).toHaveBeenCalledTimes(2);
  });

  it('skips execution when a run already exists for the current period', async () => {
    const {
      webhooksRepo,
      eventsRanRepo,
      txRepo,
      enqueueEvent,
      getSummary,
      logger,
    } = createMocks();
    webhooksRepo.getScheduledWebhooks.mockResolvedValue([
      createWebhook({ trigger_event_name: 'daily' }),
    ]);
    txRepo.findRunForPeriod.mockResolvedValue(createRun());

    const service = new ScheduledWebhooksService({
      webhookRepo: webhooksRepo,
      eventsRanRepo,
      logger,
      createDomainEventsRepo: () => ({ enqueueEvent } as any),
      createScheduledSummaryRepo: () => ({ getSummary } as any),
      now: () => new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(service.scanAndRunScheduledWebhooks()).resolves.toEqual({
      executedCount: 0,
      skippedCount: 1,
      failedCount: 0,
      results: [
        {
          webhookId: 'webhook-1',
          event: 'daily',
          periodKey: '2026-03-31',
          status: 'skipped',
          reason: 'already_ran',
        },
      ],
    });

    expect(enqueueEvent).not.toHaveBeenCalled();
    expect(txRepo.tryInsertRun).not.toHaveBeenCalled();
  });

  it('continues startup scanning when one webhook enqueue fails', async () => {
    const {
      webhooksRepo,
      eventsRanRepo,
      txRepo,
      enqueueEvent,
      getSummary,
      logger,
    } = createMocks();
    webhooksRepo.getScheduledWebhooks.mockResolvedValue([
      createWebhook({ id: 'broken-1', trigger_event_name: 'daily' }),
      createWebhook({ id: 'healthy-1', trigger_event_name: 'daily' }),
    ]);
    txRepo.findRunForPeriod.mockResolvedValue(undefined);
    txRepo.tryInsertRun.mockResolvedValue(true);
    enqueueEvent.mockRejectedValueOnce(new Error('upstream unavailable'));

    const service = new ScheduledWebhooksService({
      webhookRepo: webhooksRepo,
      eventsRanRepo,
      logger,
      createDomainEventsRepo: () => ({ enqueueEvent } as any),
      createScheduledSummaryRepo: () => ({ getSummary } as any),
      now: () => new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    const summary = await service.scanAndRunScheduledWebhooks();

    expect(summary.executedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.results).toEqual([
      {
        webhookId: 'broken-1',
        event: 'daily',
        periodKey: '2026-03-31',
        status: 'failed',
        error: 'upstream unavailable',
      },
      {
        webhookId: 'healthy-1',
        event: 'daily',
        periodKey: '2026-03-31',
        status: 'executed',
      },
    ]);
    expect(logger.error).toHaveBeenCalled();
  });
});
