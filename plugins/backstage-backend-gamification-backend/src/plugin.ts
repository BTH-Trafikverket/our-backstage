import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { initGameDb } from './database';

/**
 * backstageBackendGamificationPlugin backend plugin
 *
 * @public
 */
export const backstageBackendGamificationPlugin = createBackendPlugin({
  pluginId: 'backstage-backend-gamification',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        logger: coreServices.logger,        
      },
      async init({ database, logger }) {
        await initGameDb({
          database,
          migrationPackageName: "@internal/backstage-plugin-backstage-backend-gamification-backend",
        });

        logger.info('gameifications migrations applied');
          },
        });
},
});


