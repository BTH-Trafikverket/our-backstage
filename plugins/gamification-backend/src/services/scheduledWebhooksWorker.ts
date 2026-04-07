import type { LoggerService } from '@backstage/backend-plugin-api';
import { ScheduledWebhooksService } from './scheduledWebhooksService';

const DEFAULT_SCAN_INTERVAL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ScheduledWebhooksWorker {
  private readonly scheduledWebhooksService: ScheduledWebhooksService;
  private readonly logger: LoggerService;
  private readonly scanIntervalMs: number;
  private running = false;

  constructor(options: {
    scheduledWebhooksService: ScheduledWebhooksService;
    logger: LoggerService;
    scanIntervalMs?: number;
  }) {
    this.scheduledWebhooksService = options.scheduledWebhooksService;
    this.logger = options.logger;
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop();
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const summary =
          await this.scheduledWebhooksService.scanAndRunScheduledWebhooks();

        if (summary.executedCount > 0 || summary.failedCount > 0) {
          this.logger.info(
            `gamification scheduled webhook scan completed (executed=${summary.executedCount}, skipped=${summary.skippedCount}, failed=${summary.failedCount})`,
          );
        }
      } catch (error) {
        this.logger.error(`Scheduled webhook worker failed: ${error}`);
      }

      await sleep(this.scanIntervalMs);
    }
  }
}
