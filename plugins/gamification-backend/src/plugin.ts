import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { initGameDb } from './database';
import { runSeeds } from './seed';
import { createRouter } from './router';
import { DomainEventsRepository } from './repositories/domainEventsRepository';
import { WebhookRepository } from './repositories/webhookRepository';
import { DomainEventWorker } from './services/domainEventWorker';
import { WebhookService } from './services/webhookService';

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

        domainEventWorker.start();
        logger.info('gamification domain event worker started');
      },
    });
  },
});
