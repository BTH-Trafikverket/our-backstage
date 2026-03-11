import type { Seed } from '../src/seeds/types';

export const seed002EventTriggers: Seed = {
  id: '002_event_triggers',
  description: 'Seed quest event triggers (eventKey -> quest)',
  async run({ knex }) {
    const hasQuestEventTriggersTable = await knex.schema.hasTable(
      'quest_event_triggers',
    );
    if (!hasQuestEventTriggersTable) {
      return;
    }

    const quests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', ['Merge a PR', 'Review PRs', 'Fix a failing build']);

    const byTitle = new Map(quests.map((q: any) => [q.title, q.id]));

    const triggers = [
      {
        event_key: 'github.pull_request.merged',
        quest_id: byTitle.get('Merge a PR')!,
        increment_by: 1,
        enabled: true,
      },
      {
        event_key: 'github.pull_request.reviewed',
        quest_id: byTitle.get('Review PRs')!,
        increment_by: 1,
        enabled: true,
      },
      {
        event_key: 'github.ci.fixed',
        quest_id: byTitle.get('Fix a failing build')!,
        increment_by: 1,
        enabled: true,
      },
    ];

    await knex('quest_event_triggers')
      .insert(triggers)
      .onConflict(['event_key', 'quest_id'])
      .ignore();
  },
};
