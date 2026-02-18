import { createDevApp } from '@backstage/dev-utils';
import {
  backstagePluginGamificationPlugin,
  BackstagePluginGamificationPage,
} from '../src/plugin';

createDevApp()
  .registerPlugin(backstagePluginGamificationPlugin)
  .addPage({
    element: <BackstagePluginGamificationPage />,
    title: 'Root Page',
    path: '/backstage-plugin-gamification',
  })
  .render();
