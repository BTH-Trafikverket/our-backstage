import type { LoggerService } from '@backstage/backend-plugin-api';
import { ReminderEvaluationWorker } from '../services/reminderEvaluationWorker';

describe('ReminderEvaluationWorker', () => {
  function createLogger(): jest.Mocked<LoggerService> {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
  }

  it('can re-run safely without duplicating orchestration failures', async () => {
    const reminderEvaluationService = {
      evaluateConfiguredRules: jest
        .fn()
        .mockResolvedValueOnce({
          createdCount: 1,
          refreshedCount: 0,
          suppressedCount: 0,
          skippedRuleCount: 0,
          ruleResults: [],
        })
        .mockResolvedValueOnce({
          createdCount: 0,
          refreshedCount: 1,
          suppressedCount: 1,
          skippedRuleCount: 0,
          ruleResults: [],
        }),
    };
    const logger = createLogger();
    const worker = new ReminderEvaluationWorker({
      reminderEvaluationService: reminderEvaluationService as any,
      logger,
      evaluationIntervalMs: 1_000,
    });

    await expect(worker.runOnce()).resolves.toMatchObject({
      createdCount: 1,
      refreshedCount: 0,
    });
    await expect(worker.runOnce()).resolves.toMatchObject({
      createdCount: 0,
      refreshedCount: 1,
      suppressedCount: 1,
    });

    expect(
      reminderEvaluationService.evaluateConfiguredRules,
    ).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs failures and does not throw when evaluation fails', async () => {
    const reminderEvaluationService = {
      evaluateConfiguredRules: jest.fn(async () => {
        throw new Error('database unavailable');
      }),
    };
    const logger = createLogger();
    const worker = new ReminderEvaluationWorker({
      reminderEvaluationService: reminderEvaluationService as any,
      logger,
      evaluationIntervalMs: 1_000,
    });

    await expect(worker.runOnce()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Reminder evaluation worker failed: Error: database unavailable',
    );
  });
});
