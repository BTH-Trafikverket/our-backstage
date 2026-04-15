import { DomainEventWorker } from '../services/domainEventWorker';

describe('DomainEventWorker', () => {
  it('claims, delivers, and marks domain events as processed', async () => {
    const domainEventsRepo = {
      claimPendingEvents: jest.fn(async () => [
        {
          id: 'event-1',
          event_name: 'quest.completed',
          attempt_count: 1,
        },
      ]),
      markProcessed: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    };
    const webhookService = {
      deliverDomainEvent: jest.fn(async () => undefined),
    };
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    const worker = new DomainEventWorker({
      domainEventsRepo: domainEventsRepo as any,
      webhookService: webhookService as any,
      logger: logger as any,
      batchSize: 10,
      maxAttempts: 5,
      claimTtlMs: 30_000,
    });

    const count = await worker.processOnce();

    expect(count).toBe(1);
    expect(domainEventsRepo.claimPendingEvents).toHaveBeenCalled();
    expect(webhookService.deliverDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        event_name: 'quest.completed',
      }),
    );
    expect(domainEventsRepo.markProcessed).toHaveBeenCalledWith('event-1');
    expect(domainEventsRepo.markFailed).not.toHaveBeenCalled();
  });

  it('releases failed events for retry', async () => {
    const domainEventsRepo = {
      claimPendingEvents: jest.fn(async () => [
        {
          id: 'event-1',
          event_name: 'badge.earned',
          attempt_count: 2,
        },
      ]),
      markProcessed: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    };
    const webhookService = {
      deliverDomainEvent: jest.fn(async () => {
        throw new Error('webhook down');
      }),
    };
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    const worker = new DomainEventWorker({
      domainEventsRepo: domainEventsRepo as any,
      webhookService: webhookService as any,
      logger: logger as any,
      batchSize: 10,
      maxAttempts: 5,
      claimTtlMs: 30_000,
    });

    await expect(worker.processOnce()).resolves.toBe(1);

    expect(domainEventsRepo.markProcessed).not.toHaveBeenCalled();
    expect(domainEventsRepo.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        attemptCount: 2,
        maxAttempts: 5,
        error: 'webhook down',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });
});
