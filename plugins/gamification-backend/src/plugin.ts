import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { initGameDb } from './database';
import { EventsRanRepository } from './repositories/eventsRanRepository';
import { WebhookRepository } from './repositories/webhookRepository';
import { runSeeds } from './seed';
import { createRouter } from './router';
import { ScheduledWebhooksService } from './services/scheduledWebhooksService';
import { DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE } from './services/scheduledWebhookPeriod';
import { WebhookDeliveryService } from './services/webhookDeliveryService';

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
        const webhookStartupScanEnabled =
          config.getOptionalBoolean(
            'gamification.webhooks.startupScan.enabled',
          ) ?? true;
        const scheduledWebhooksService = new ScheduledWebhooksService({
          webhookRepo: new WebhookRepository(knex),
          eventsRanRepo: new EventsRanRepository(knex),
          deliveryService: new WebhookDeliveryService({
            timeoutMs:
              config.getOptionalNumber(
                'gamification.webhooks.delivery.timeoutMs',
              ) ?? 10_000,
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
          timeZone: webhookTimeZone,
        });

        httpRouter.use(
          createRouter({ httpAuth, userInfo, knex, config, auth, discovery }),
        );

        if (webhookStartupScanEnabled) {
          void scheduledWebhooksService
            .scanAndRunScheduledWebhooks()
            .then(startupScan => {
              logger.info(
                `gamification scheduled webhook startup scan completed (executed=${startupScan.executedCount}, skipped=${startupScan.skippedCount}, failed=${startupScan.failedCount})`,
              );
            })
            .catch(error => {
              const message =
                error instanceof Error ? error.message : String(error);
              logger.error(
                `gamification scheduled webhook startup scan failed: ${message}`,
              );
            });
        } else {
          logger.info('gamification scheduled webhook startup scan disabled');
        }
      },
    });
  },
});
