import { randomUUID } from 'node:crypto';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import {
  DomainEventsRepository,
  type DomainEventRow,
} from '../repositories/domainEventsRepository';
import { WebhookService } from './webhookService';

const DOMAIN_EVENT_NOTIFY_CHANNEL = 'gamification_domain_events';
const DEFAULT_POLL_INTERVAL_MS = 10 * 60_000;
const DEFAULT_LISTENER_RECONNECT_MS = 5_000;

type DomainEventWorkerOptions = {
  db?: Knex;
  domainEventsRepo: DomainEventsRepository;
  webhookService: WebhookService;
  logger: LoggerService;
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  claimTtlMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type PgNotificationMessage = {
  channel: string;
  payload?: string;
};

type PgNotificationConnection = {
  query(sql: string): Promise<unknown>;
  on(
    event: 'notification',
    listener: (message: PgNotificationMessage) => void,
  ): PgNotificationConnection;
  on(
    event: 'error',
    listener: (error: Error) => void,
  ): PgNotificationConnection;
  on(event: 'end', listener: () => void): PgNotificationConnection;
  removeListener(
    event: 'notification',
    listener: (message: PgNotificationMessage) => void,
  ): PgNotificationConnection;
  removeListener(
    event: 'error',
    listener: (error: Error) => void,
  ): PgNotificationConnection;
  removeListener(event: 'end', listener: () => void): PgNotificationConnection;
};

export class DomainEventWorker {
  private readonly db?: Knex;
  private readonly domainEventsRepo: DomainEventsRepository;
  private readonly webhookService: WebhookService;
  private readonly logger: LoggerService;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly claimTtlMs: number;
  private readonly workerId: string;
  private running = false;
  private wakeRequested = false;
  private waitResolver?: () => void;
  private retryWakeTimer?: ReturnType<typeof setTimeout>;
  private nextRetryWakeAt?: number;

  constructor(options: DomainEventWorkerOptions) {
    this.db = options.db;
    this.domainEventsRepo = options.domainEventsRepo;
    this.webhookService = options.webhookService;
    this.logger = options.logger;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? 25;
    this.maxAttempts = options.maxAttempts ?? 10;
    this.claimTtlMs = options.claimTtlMs ?? 60_000;
    this.workerId = `gamification-domain-worker:${randomUUID()}`;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.wake();
    if (this.db) {
      void this.runNotificationListener();
    }
    void this.runLoop();
  }

  async processOnce(): Promise<number> {
    const events = await this.domainEventsRepo.claimPendingEvents({
      workerId: this.workerId,
      batchSize: this.batchSize,
      maxAttempts: this.maxAttempts,
      claimTtlMs: this.claimTtlMs,
    });

    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      await this.waitForWakeOrPoll();
      if (!this.running) {
        return;
      }

      try {
        await this.processAvailableEvents();
      } catch (error) {
        this.logger.error(`Domain event worker failed: ${error}`);
      }
    }
  }

  private getRetryDelayMs(attemptCount: number): number {
    return Math.min(15_000 * 2 ** Math.max(0, attemptCount - 1), 15 * 60_000);
  }

  private wake(): void {
    this.wakeRequested = true;
    const resolve = this.waitResolver;
    if (resolve) {
      this.waitResolver = undefined;
      resolve();
    }
  }

  private async waitForWakeOrPoll(): Promise<void> {
    if (this.wakeRequested) {
      this.wakeRequested = false;
      return;
    }

    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        this.waitResolver = undefined;
        this.wakeRequested = false;
        resolve();
      };
      const timer = setTimeout(() => {
        finish();
      }, this.pollIntervalMs);

      this.waitResolver = () => {
        clearTimeout(timer);
        finish();
      };
    });
  }

  private async processAvailableEvents(): Promise<void> {
    let claimedCount = 0;

    do {
      claimedCount = await this.processOnce();
    } while (this.running && claimedCount === this.batchSize);
  }

  private scheduleRetryWake(delayMs: number): void {
    if (!this.running) {
      return;
    }

    const scheduledFor = Date.now() + Math.max(0, delayMs);
    if (
      this.nextRetryWakeAt !== undefined &&
      this.nextRetryWakeAt <= scheduledFor
    ) {
      return;
    }

    if (this.retryWakeTimer) {
      clearTimeout(this.retryWakeTimer);
    }

    this.nextRetryWakeAt = scheduledFor;
    this.retryWakeTimer = setTimeout(() => {
      this.retryWakeTimer = undefined;
      this.nextRetryWakeAt = undefined;
      this.wake();
    }, Math.max(0, delayMs));
  }

  private async runNotificationListener(): Promise<void> {
    while (this.running && this.db) {
      let connection: PgNotificationConnection | undefined;

      try {
        connection = (await this.db.client.acquireConnection()) as
          | PgNotificationConnection
          | undefined;

        if (!connection) {
          throw new Error('No database connection available for LISTEN/NOTIFY');
        }

        await connection.query(`LISTEN ${DOMAIN_EVENT_NOTIFY_CHANNEL}`);
        this.logger.info(
          `Domain event worker listening on ${DOMAIN_EVENT_NOTIFY_CHANNEL}`,
        );

        await new Promise<void>(resolve => {
          let cleanup = () => {};
          const handleNotification = (message: PgNotificationMessage) => {
            if (message.channel === DOMAIN_EVENT_NOTIFY_CHANNEL) {
              this.wake();
            }
          };
          const handleError = (error: Error) => {
            cleanup();
            this.logger.error(
              `Domain event LISTEN connection failed: ${error.message}`,
            );
            resolve();
          };
          const handleEnd = () => {
            cleanup();
            if (this.running) {
              this.logger.warn(
                'Domain event LISTEN connection ended; retrying',
              );
            }
            resolve();
          };
          cleanup = () => {
            connection?.removeListener('notification', handleNotification);
            connection?.removeListener('error', handleError);
            connection?.removeListener('end', handleEnd);
          };

          connection.on('notification', handleNotification);
          connection.on('error', handleError);
          connection.on('end', handleEnd);
        });
      } catch (error) {
        this.logger.error(`Failed to start domain event listener: ${error}`);
      } finally {
        if (connection) {
          try {
            await connection.query(`UNLISTEN ${DOMAIN_EVENT_NOTIFY_CHANNEL}`);
          } catch {
            // Ignore connection cleanup errors during reconnect.
          }

          await this.db.client.releaseConnection(connection);
        }
      }

      if (this.running) {
        await sleep(DEFAULT_LISTENER_RECONNECT_MS);
      }
    }
  }

  private async processEvent(event: DomainEventRow): Promise<void> {
    try {
      await this.webhookService.deliverDomainEvent(event);
      await this.domainEventsRepo.markProcessed(event.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown error: ${error}`;
      const retryDelayMs = this.getRetryDelayMs(event.attempt_count);

      await this.domainEventsRepo.markFailed({
        id: event.id,
        attemptCount: event.attempt_count,
        maxAttempts: this.maxAttempts,
        retryDelayMs,
        error: message,
      });
      if (event.attempt_count < this.maxAttempts) {
        this.scheduleRetryWake(retryDelayMs);
      }

      this.logger.warn(
        `Domain event ${event.id} (${event.event_name}) delivery failed on attempt ${event.attempt_count}: ${message}`,
      );
    }
  }
}
