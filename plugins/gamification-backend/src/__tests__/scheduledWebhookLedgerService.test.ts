import type {
  EventRunRow,
  EventsRanRepository,
} from '../repositories/eventsRanRepository';
import { ScheduledWebhookLedgerService } from '../services/scheduledWebhookLedgerService';
import { resolveScheduledWebhookPeriod } from '../services/scheduledWebhookPeriod';

describe('ScheduledWebhookLedgerService', () => {
  function createRepoMock(): jest.Mocked<EventsRanRepository> {
    return {
      withTransaction: jest.fn(),
      findRunForPeriod: jest.fn(),
      tryInsertRun: jest.fn(),
    } as unknown as jest.Mocked<EventsRanRepository>;
  }

  function createRun(overrides?: Partial<EventRunRow>): EventRunRow {
    return {
      id: 'run-1',
      webhook_id: 'webhook-1',
      trigger_event_name: 'daily',
      period_key: '2026-04-01',
      time_zone: 'UTC',
      period_start: new Date('2026-04-01T00:00:00.000Z'),
      period_end_exclusive: new Date('2026-04-02T00:00:00.000Z'),
      executed_at: new Date('2026-04-01T00:00:10.000Z'),
      created_at: new Date('2026-04-01T00:00:10.000Z'),
      ...overrides,
    };
  }

  it('detects that a daily webhook has already run for the current period', async () => {
    const repo = createRepoMock();
    repo.findRunForPeriod.mockResolvedValue(createRun());
    const service = new ScheduledWebhookLedgerService(repo);
    const period = resolveScheduledWebhookPeriod({
      event: 'daily',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      service.hasRunForPeriod(
        { id: 'webhook-1', trigger_event_name: 'daily' },
        period,
      ),
    ).resolves.toBe(true);
  });

  it('detects when no run exists for the current weekly period', async () => {
    const repo = createRepoMock();
    repo.findRunForPeriod.mockResolvedValue(undefined);
    const service = new ScheduledWebhookLedgerService(repo);
    const period = resolveScheduledWebhookPeriod({
      event: 'weekly',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      service.hasRunForPeriod(
        { id: 'webhook-1', trigger_event_name: 'weekly' },
        period,
      ),
    ).resolves.toBe(false);
  });

  it('records monthly executions using the resolved period window', async () => {
    const repo = createRepoMock();
    repo.tryInsertRun.mockResolvedValue(true);
    const service = new ScheduledWebhookLedgerService(repo);
    const period = resolveScheduledWebhookPeriod({
      event: 'monthly',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      service.tryRecordRun(
        { id: 'webhook-1', trigger_event_name: 'monthly' },
        period,
        new Date('2026-04-01T00:00:05.000Z'),
      ),
    ).resolves.toBe(true);

    expect(repo.tryInsertRun).toHaveBeenCalledWith({
      webhookId: 'webhook-1',
      triggerEventName: 'monthly',
      periodKey: '2026-04',
      timeZone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-05-01T00:00:00.000Z'),
      executedAt: new Date('2026-04-01T00:00:05.000Z'),
    });
  });

  it('prevents duplicate execution recording within the same period', async () => {
    const repo = createRepoMock();
    repo.tryInsertRun.mockResolvedValue(false);
    const service = new ScheduledWebhookLedgerService(repo);
    const period = resolveScheduledWebhookPeriod({
      event: 'daily',
      now: new Date('2026-04-01T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    await expect(
      service.tryRecordRun(
        { id: 'webhook-1', trigger_event_name: 'daily' },
        period,
      ),
    ).resolves.toBe(false);
  });
});
