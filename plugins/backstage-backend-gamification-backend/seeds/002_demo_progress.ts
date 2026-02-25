import type { Seed } from '../src/seeds/types';

type DemoEvent = {
  event_id: string;
  event_key: string;
  user_ref: string;
  caller_subject: string;
};

export const seed002DemoEvents: Seed = {
  id: '002_demo_events',
  description:
    'Seed demo progress by replaying events (uses triggers + receipts)',
  async run({ knex }) {
    const alice = 'user:local/alice';
    const bob = 'user:local/bob';

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

    const demoEvents: DemoEvent[] = [
      {
        event_id: 'seed:alice:merge:1',
        event_key: 'github.pull_request.merged',
        user_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:merge:2',
        event_key: 'github.pull_request.merged',
        user_ref: alice,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:alice:review:1',
        event_key: 'github.pull_request.reviewed',
        user_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:review:2',
        event_key: 'github.pull_request.reviewed',
        user_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:review:3',
        event_key: 'github.pull_request.reviewed',
        user_ref: alice,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:alice:ci:1',
        event_key: 'github.ci.fixed',
        user_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:ci:2',
        event_key: 'github.ci.fixed',
        user_ref: alice,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:bob:merge:1',
        event_key: 'github.pull_request.merged',
        user_ref: bob,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:bob:review:1',
        event_key: 'github.pull_request.reviewed',
        user_ref: bob,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:bob:ci:1',
        event_key: 'github.ci.fixed',
        user_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:2',
        event_key: 'github.ci.fixed',
        user_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:3',
        event_key: 'github.ci.fixed',
        user_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:4',
        event_key: 'github.ci.fixed',
        user_ref: bob,
        caller_subject: 'seed',
      },
    ];

    for (const ev of demoEvents) {
      const trigger = await knex('quest_event_triggers')
        .select(['quest_id', 'increment_by'])
        .where({ event_key: ev.event_key, enabled: true })
        .first();

      if (!trigger) {
        throw new Error(`No trigger found for event_key '${ev.event_key}'`);
      }

      // Insert receipt; if conflict, RETURNING is empty => skip increment.
      const inserted = await knex('quest_event_receipts')
        .insert({
          event_id: ev.event_id,
          event_key: ev.event_key,
          user_ref: ev.user_ref,
          caller_subject: ev.caller_subject,
        })
        .onConflict('event_id')
        .ignore()
        .returning(['event_id']);

      if (!inserted || inserted.length === 0) {
        continue;
      }

      await knex('quest_progress')
        .insert({
          user_ref: ev.user_ref,
          quest_id: trigger.quest_id,
          completion_count: trigger.increment_by,
        })
        .onConflict(['user_ref', 'quest_id'])
        .merge({
          completion_count: knex.raw('quest_progress.completion_count + ?', [
            trigger.increment_by,
          ]),
        });
    }

    // xp_ledger rows are created by your DB trigger automatically.
  },
};
