import type { Seed } from '../src/seeds/types';

export const seed001Core: Seed = {
  id: '001_core',
  description: 'Seed base quests',
  async run({ knex }) {
    const questSeeds = [
      {
        title: 'Merge a PR',
        description: 'Get a pull request merged into main',
        interval: 1,
        xp_reward: 20,
      },
      {
        title: 'Review PRs',
        description: 'Leave meaningful reviews (XP every 3)',
        interval: 3,
        xp_reward: 15,
      },
      {
        title: 'Fix a failing build',
        description: 'Make CI green again (XP every 2)',
        interval: 2,
        xp_reward: 30,
      },
    ];

    await knex('quests').insert(questSeeds).onConflict('title').ignore();
  },
};
