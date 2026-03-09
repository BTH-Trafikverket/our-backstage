import { createDevApp } from '@backstage/dev-utils';
import { gamificationPlugin, GamificationPage } from '../src/plugin';

createDevApp()
  .registerPlugin(gamificationPlugin)
  .addPage({
    element: <GamificationPage />,
    title: 'Root Page',
    path: '/gamification',
  })
  .render();
