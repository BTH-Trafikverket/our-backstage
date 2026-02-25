import type { Seed } from '../src/seeds/types';

type DemoEvent = {
  event_id: string;
  event_key: string;
  user_ref: string;
  caller_subject: string;
};

export const seed003DemoEvents: Seed = {
  id: '003_demo_events',
  description:
    'Seed demo quest progress by replaying events (triggers + receipts)',
  async run({ knex }) {
    const alice = 'user:local/alice';
    const bob = 'user:local/bob';
    const linus = 'user:default/linusandersson02';

    const demoEvents: DemoEvent[] = [
      // Alice: 2 merges, 3 reviews, 2 fixes
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

      // Bob: 1 merge, 1 review, 4 fixes
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

      // Linus (default namespace): pick some nice demo numbers
      // e.g. 5 merges, 2 reviews, 1 fix
      {
        event_id: 'seed:linus:merge:1',
        event_key: 'github.pull_request.merged',
        user_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:2',
        event_key: 'github.pull_request.merged',
        user_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:3',
        event_key: 'github.pull_request.merged',
        user_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:4',
        event_key: 'github.pull_request.merged',
        user_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:5',
        event_key: 'github.pull_request.merged',
        user_ref: linus,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:linus:review:1',
        event_key: 'github.pull_request.reviewed',
        user_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:review:2',
        event_key: 'github.pull_request.reviewed',
        user_ref: linus,
        caller_subject: 'seed',
      },

      {
        event_id: 'seed:linus:ci:1',
        event_key: 'github.ci.fixed',
        user_ref: linus,
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

      // With Postgres, ON CONFLICT DO NOTHING RETURNING returns an empty array if skipped. :contentReference[oaicite:1]{index=1}
      if (!inserted || inserted.length === 0) continue;

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
  },
};
