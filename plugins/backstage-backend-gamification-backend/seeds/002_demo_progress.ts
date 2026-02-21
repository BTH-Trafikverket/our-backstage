import type { Seed } from '../src/seeds/types';

export const seed002DemoProgress: Seed = {
  id: '002_demo_progress',
  description: 'Seed demo quest progress for local users',
  async run({ knex }) {
    const alice = 'user:local/alice';
    const bob = 'user:local/bob';

    const quests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', ['Merge a PR', 'Review PRs', 'Fix a failing build']);

    const byTitle = new Map(quests.map(q => [q.title, q.id]));

    const progressSeeds = [
      {
        user_ref: alice,
        quest_id: byTitle.get('Merge a PR')!,
        completion_count: 2,
      },
      {
        user_ref: alice,
        quest_id: byTitle.get('Review PRs')!,
        completion_count: 3,
      },
      {
        user_ref: alice,
        quest_id: byTitle.get('Fix a failing build')!,
        completion_count: 2,
      },

      {
        user_ref: bob,
        quest_id: byTitle.get('Merge a PR')!,
        completion_count: 1,
      },
      {
        user_ref: bob,
        quest_id: byTitle.get('Review PRs')!,
        completion_count: 1,
      },
      {
        user_ref: bob,
        quest_id: byTitle.get('Fix a failing build')!,
        completion_count: 4,
      },
    ];

    await knex('quest_progress')
      .insert(progressSeeds)
      .onConflict(['user_ref', 'quest_id'])
      .merge({
        completion_count: knex.raw(
          'GREATEST(quest_progress.completion_count, EXCLUDED.completion_count)',
        ),
      });

    // xp_ledger rows are created by your trigger automatically.
  },
};
