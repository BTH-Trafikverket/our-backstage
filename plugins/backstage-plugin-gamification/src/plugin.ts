import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, xpRouteRef } from './routes';

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

export const GamificationXpDebugPage =
  backstagePluginGamificationPlugin.provide(
    createRoutableExtension({
      name: 'GamificationXpDebugPage',
      component: () =>
        import('./components/XpDebugPage/XpDebugPage').then(m => m.XpDebugPage),
      mountPoint: xpRouteRef,
    }),
  );
