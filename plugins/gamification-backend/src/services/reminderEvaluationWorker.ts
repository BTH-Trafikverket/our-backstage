import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  ReminderEvaluationService,
  type ReminderEvaluationSummary,
} from './reminderEvaluationService';

const DEFAULT_EVALUATION_INTERVAL_MS = 60 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ReminderEvaluationWorker {
  private readonly reminderEvaluationService: ReminderEvaluationService;
  private readonly logger: LoggerService;
  private readonly evaluationIntervalMs: number;
  private running = false;

  constructor(options: {
    reminderEvaluationService: ReminderEvaluationService;
    logger: LoggerService;
    evaluationIntervalMs?: number;
  }) {
    this.reminderEvaluationService = options.reminderEvaluationService;
    this.logger = options.logger;
    this.evaluationIntervalMs =
      options.evaluationIntervalMs ?? DEFAULT_EVALUATION_INTERVAL_MS;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop();
  }

  async runOnce(): Promise<ReminderEvaluationSummary | undefined> {
    try {
      const summary =
        await this.reminderEvaluationService.evaluateConfiguredRules();

      if (
        summary.createdCount > 0 ||
        summary.refreshedCount > 0 ||
        (summary.notificationFailureCount ?? 0) > 0 ||
        summary.skippedRuleCount > 0
      ) {
        this.logger.info(
          `gamification reminder evaluation completed (created=${
            summary.createdCount
          }, refreshed=${summary.refreshedCount}, suppressed=${
            summary.suppressedCount
          }, notified=${summary.notificationCount ?? 0}, notificationFailures=${
            summary.notificationFailureCount ?? 0
          }, skippedRules=${summary.skippedRuleCount})`,
        );
      }

      return summary;
    } catch (error) {
      this.logger.error(`Reminder evaluation worker failed: ${error}`);
      return undefined;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      await this.runOnce();
      await sleep(this.evaluationIntervalMs);
    }
  }
}
