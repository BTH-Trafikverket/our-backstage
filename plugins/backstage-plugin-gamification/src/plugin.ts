import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const backstagePluginGamificationPlugin = createPlugin({
  id: 'backstage-plugin-gamification',
  routes: {
    root: rootRouteRef,
  },
});

export const BackstagePluginGamificationPage =
  backstagePluginGamificationPlugin.provide(
    createRoutableExtension({
      name: 'BackstagePluginGamificationPage',
      component: () =>
        import('./components/ExampleComponent').then(m => m.ExampleComponent),
      mountPoint: rootRouteRef,
    }),
  );
