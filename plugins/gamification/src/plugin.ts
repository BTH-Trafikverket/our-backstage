import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, xpRouteRef } from './routes';

export const backstagePluginGamificationPlugin = createPlugin({
  id: 'gamification',
  routes: {
    root: rootRouteRef,
    xp: xpRouteRef,
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

export const GamificationXpDebugPage =
  backstagePluginGamificationPlugin.provide(
    createRoutableExtension({
      name: 'GamificationEntityXpCard',
      component: () =>
        import('./components/EntityXpCard/EntityXpCard').then(
          m => m.EntityXpCard,
        ),
      mountPoint: xpRouteRef,
    }),
  );
