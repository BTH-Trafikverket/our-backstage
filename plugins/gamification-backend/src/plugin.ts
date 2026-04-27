import {
  coreServices,
  createBackendPlugin,
  type LoggerService,
  type RootConfigService,
} from '@backstage/backend-plugin-api';
import { initGameDb } from './database';
import { EventsRanRepository } from './repositories/eventsRanRepository';
import { QuestsRepository } from './repositories/questsRepository';
import { ReminderRepository } from './repositories/reminderRepository';
import { runSeeds } from './seed';
import { createRouter } from './router';
import { DomainEventsRepository } from './repositories/domainEventsRepository';
import { WebhookRepository } from './repositories/webhookRepository';
import { DomainEventWorker } from './services/domainEventWorker';
import {
  ReminderEvaluationService,
  type ReminderEvaluationRule,
} from './services/reminderEvaluationService';
import { ReminderEvaluationWorker } from './services/reminderEvaluationWorker';
import { WebhookService } from './services/webhookService';
import { ScheduledWebhooksService } from './services/scheduledWebhooksService';
import { DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE } from './services/scheduledWebhookPeriod';
import { ScheduledWebhooksWorker } from './services/scheduledWebhooksWorker';

function readReminderEvaluationRules(
  config: RootConfigService,
  logger: LoggerService,
): ReminderEvaluationRule[] {
  const remindersConfig = config.getOptionalConfig('gamification.reminders');
  const ruleConfigs = remindersConfig?.getOptionalConfigArray('rules') ?? [];
  const rules: ReminderEvaluationRule[] = [];

  for (const ruleConfig of ruleConfigs) {
    const key = ruleConfig.getOptionalString('key')?.trim();
    const questId = ruleConfig.getOptionalString('questId')?.trim();
    const inactivityDays = ruleConfig.getOptionalNumber('inactivityDays');
    const activityDescription = ruleConfig
      .getOptionalString('activityDescription')
      ?.trim();
    const activitySource =
      ruleConfig.getOptionalString('activitySource') ?? 'quest_event_receipts';

    if (
      !key ||
      !questId ||
      !activityDescription ||
      inactivityDays === undefined
    ) {
      logger.warn(
        'Skipping gamification reminder rule because key, questId, inactivityDays, or activityDescription is missing',
      );
      continue;
    }

    if (!Number.isInteger(inactivityDays) || inactivityDays < 1) {
      logger.warn(
        `Skipping gamification reminder rule '${key}' because inactivityDays must be a positive integer`,
      );
      continue;
    }

    rules.push({
      key,
      questId,
      inactivityDays,
      activityDescription,
      activitySource,
    });
  }

  return rules;
}

export const gamificationBackendPlugin = createBackendPlugin({
  pluginId: 'gamification',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
      },
      async init({
        database,
        logger,
        config,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        discovery,
      }) {
        const knex = await initGameDb({
          database,
          migrationPackageName: '@internal/gamification-backend',
        });

        logger.info('gamification migrations applied');

        const seedEnabled =
          config.getOptionalBoolean('gamification.seed.enabled') ?? false;
        const seedReset =
          config.getOptionalBoolean('gamification.seed.reset') ?? false;
        const isProduction = process.env.NODE_ENV === 'production';
        const allowProductionSeeds =
          process.env.GAMIFICATION_ALLOW_PRODUCTION_SEEDS === 'true';

        if (seedEnabled) {
          if (isProduction && !allowProductionSeeds) {
            logger.warn(
              'gamification seeds are enabled in config but were skipped in production; set GAMIFICATION_ALLOW_PRODUCTION_SEEDS=true to override',
            );
          } else {
            await runSeeds(knex, { reset: seedReset });
            logger.info(`gamification seeds applied (reset=${seedReset})`);
          }
        }

        const webhookTimeZone =
          config.getOptionalString('gamification.webhooks.timeZone') ??
          DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE;
        const scheduledWebhooksService = new ScheduledWebhooksService({
          webhookRepo: new WebhookRepository(knex),
          eventsRanRepo: new EventsRanRepository(knex),
          logger,
          timeZone: webhookTimeZone,
        });
        const scheduledWebhooksWorker = new ScheduledWebhooksWorker({
          scheduledWebhooksService,
          logger,
          scanIntervalMs:
            config.getOptionalNumber(
              'gamification.webhooks.scheduleScanIntervalMs',
            ) ?? 60_000,
        });
        const reminderRules = readReminderEvaluationRules(config, logger);
        const reminderEvaluationWorker = new ReminderEvaluationWorker({
          reminderEvaluationService: new ReminderEvaluationService({
            questsRepo: new QuestsRepository(knex),
            reminderRepo: new ReminderRepository(knex),
            rules: reminderRules,
            logger,
          }),
          logger,
          evaluationIntervalMs:
            config.getOptionalNumber(
              'gamification.reminders.evaluationIntervalMs',
            ) ?? 60 * 60_000,
        });

        httpRouter.use(
          createRouter({
            httpAuth,
            userInfo,
            knex,
            config,
            auth,
            discovery,
            logger,
          }),
        );

        const webhookRepo = new WebhookRepository(knex);
        const domainEventsRepo = new DomainEventsRepository(knex);
        const requestTimeoutMs =
          config.getOptionalNumber(
            'gamification.webhooks.delivery.requestTimeoutMs',
          ) ?? 10_000;
        const domainEventWorker = new DomainEventWorker({
          db: knex,
          domainEventsRepo,
          webhookService: new WebhookService({
            webhookRepo,
            logger,
            requestTimeoutMs,
            allowedHosts:
              config.getOptionalStringArray(
                'gamification.webhooks.delivery.allowedHosts',
              ) ?? [],
            allowHttp:
              config.getOptionalBoolean(
                'gamification.webhooks.delivery.allowHttp',
              ) ?? false,
            allowPrivateTargets:
              config.getOptionalBoolean(
                'gamification.webhooks.delivery.allowPrivateTargets',
              ) ?? false,
          }),
          logger,
          pollIntervalMs:
            config.getOptionalNumber(
              'gamification.webhooks.delivery.pollIntervalMs',
            ) ?? 10 * 60_000,
          batchSize:
            config.getOptionalNumber(
              'gamification.webhooks.delivery.batchSize',
            ) ?? 25,
          maxAttempts:
            config.getOptionalNumber(
              'gamification.webhooks.delivery.maxAttempts',
            ) ?? 10,
          claimTtlMs:
            config.getOptionalNumber(
              'gamification.webhooks.delivery.claimTtlMs',
            ) ?? 60_000,
        });

        const deliveryWorkerEnabled =
          config.getOptionalBoolean('gamification.webhooks.delivery.enabled') ??
          true;
        const schedulingWorkerEnabled =
          config.getOptionalBoolean(
            'gamification.webhooks.scheduling.enabled',
          ) ?? true;
        const reminderWorkerEnabled =
          config.getOptionalBoolean('gamification.reminders.enabled') ?? true;

        if (deliveryWorkerEnabled) {
          domainEventWorker.start();
          logger.info('gamification domain event worker started');
        } else {
          logger.info(
            'gamification domain event worker disabled by config (gamification.webhooks.delivery.enabled=false)',
          );
        }

        if (schedulingWorkerEnabled) {
          scheduledWebhooksWorker.start();
          logger.info('gamification scheduled webhook worker started');
        } else {
          logger.info(
            'gamification scheduled webhook worker disabled by config (gamification.webhooks.scheduling.enabled=false)',
          );
        }

        if (!reminderWorkerEnabled) {
          logger.info(
            'gamification reminder evaluation worker disabled by config (gamification.reminders.enabled=false)',
          );
        } else if (reminderRules.length === 0) {
          logger.info(
            'gamification reminder evaluation worker not started because no reminder rules are configured',
          );
        } else {
          reminderEvaluationWorker.start();
          logger.info('gamification reminder evaluation worker started');
        }
      },
    });
  },
});
