import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { initGameDb } from './database';
import { runSeeds } from './seed';

export const backstageBackendGamificationPlugin = createBackendPlugin({
  pluginId: 'backstage-backend-gamification',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        logger: coreServices.logger,
        config: coreServices.rootConfig, // <-- add
      },
      async init({ database, logger, config }) {
        const knex = await initGameDb({
          database,
          migrationPackageName:
            '@internal/backstage-plugin-backstage-backend-gamification-backend',
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
      },
    });
  },
});
