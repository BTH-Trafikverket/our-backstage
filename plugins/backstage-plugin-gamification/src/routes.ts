import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'backstage-plugin-gamification',
});

export const xpRouteRef = createRouteRef({
  id: 'gamification-xp',
});
