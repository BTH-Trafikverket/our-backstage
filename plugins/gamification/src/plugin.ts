import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, xpRouteRef } from './routes';

export const gamificationPlugin = createPlugin({
  id: 'gamification',
  routes: {
    root: rootRouteRef,
    xp: xpRouteRef,
  },
});

export const GamificationPage = gamificationPlugin.provide(
  createRoutableExtension({
    name: 'GamificationPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);

export const GamificationXpDebugPage = gamificationPlugin.provide(
  createRoutableExtension({
    name: 'GamificationEntityXpCard',
    component: () =>
      import('./components/EntityXpCard/EntityXpCard').then(
        m => m.EntityXpCard,
      ),
    mountPoint: xpRouteRef,
  }),
);
