import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { initGameDb } from './database';
import { runSeeds } from './seed';
import { createRouter } from './router';

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

        if (seedEnabled) {
          await runSeeds(knex, { reset: seedReset });
          logger.info(`gamification seeds applied (reset=${seedReset})`);
        }

        httpRouter.use(
          createRouter({ httpAuth, userInfo, knex, config, auth, discovery }),
        );
      },
    });
  },
});
