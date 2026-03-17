import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const gamificationPlugin = createPlugin({
  id: 'gamification',
  routes: {
    root: rootRouteRef,
  },
});

export const GamificationPage = gamificationPlugin.provide(
  createRoutableExtension({
    name: 'GamificationPage',
    component: () =>
      import('./components/GamificationPage').then(m => m.GamificationPage),
    mountPoint: rootRouteRef,
  }),
);
