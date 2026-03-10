import type { Seed } from '../src/seeds/types';

type DemoEvent = {
  event_id: string;
  event_key: string;
  subject_ref: string;
  caller_subject: string;
};

export const seed003DemoEvents: Seed = {
  id: '003_demo_events',
  description:
    'Seed demo quest progress by replaying events (triggers + receipts)',
  async run({ knex }) {
    const adminGroup = 'group:default/admin';
    const alice = 'user:local/alice';
    const bob = 'user:local/bob';

    const linus = 'user:default/linusandersson02';
    const zoe = 'user:default/zoebalowi';

    const mara = 'user:default/Maram277';
    const skz = 'user:default/skz911';
    const hahh = 'user:default/hahh24';

    const demoEvents: DemoEvent[] = [
      {
        event_id: 'seed:alice:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:merge:2',
        event_key: 'github.pull_request.merged',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:review:2',
        event_key: 'github.pull_request.reviewed',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:review:3',
        event_key: 'github.pull_request.reviewed',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:alice:ci:2',
        event_key: 'github.ci.fixed',
        subject_ref: alice,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:2',
        event_key: 'github.ci.fixed',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:3',
        event_key: 'github.ci.fixed',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:bob:ci:4',
        event_key: 'github.ci.fixed',
        subject_ref: bob,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:2',
        event_key: 'github.pull_request.merged',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:3',
        event_key: 'github.pull_request.merged',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:4',
        event_key: 'github.pull_request.merged',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:merge:5',
        event_key: 'github.pull_request.merged',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:review:2',
        event_key: 'github.pull_request.reviewed',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:linus:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: linus,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:zoe:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: zoe,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:zoe:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: zoe,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:zoe:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: zoe,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:zoe:ci:2',
        event_key: 'github.ci.fixed',
        subject_ref: zoe,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:merge:2',
        event_key: 'github.pull_request.merged',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:merge:3',
        event_key: 'github.pull_request.merged',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:review:2',
        event_key: 'github.pull_request.reviewed',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:mara:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: mara,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:2',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:3',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:4',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:ci:2',
        event_key: 'github.ci.fixed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:merge:1',
        event_key: 'github.pull_request.merged',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:merge:2',
        event_key: 'github.pull_request.merged',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:review:1',
        event_key: 'github.pull_request.reviewed',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:ci:1',
        event_key: 'github.ci.fixed',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:ci:2',
        event_key: 'github.ci.fixed',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:ci:3',
        event_key: 'github.ci.fixed',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:ci:4',
        event_key: 'github.ci.fixed',
        subject_ref: hahh,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:hahh:ci:5',
        event_key: 'github.ci.fixed',
        subject_ref: hahh,
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
          subject_ref: ev.subject_ref,
          caller_subject: ev.caller_subject,
        })
        .onConflict('event_id')
        .ignore()
        .returning(['event_id']);

      if (!inserted || inserted.length === 0) continue;

      await knex('quest_progress')
        .insert({
          subject_ref: ev.subject_ref,
          quest_id: trigger.quest_id,
          completion_count: trigger.increment_by,
        })
        .onConflict(['subject_ref', 'quest_id'])
        .merge({
          completion_count: knex.raw('quest_progress.completion_count + ?', [
            trigger.increment_by,
          ]),
        });
    }

    // Seed direct XP for the admin group so group entity pages show level
    // progress even when no team quest events have been replayed yet.
    const adminGroupQuests = await knex('quests')
      .select(['id', 'title', 'xp_reward'])
      .whereIn('title', ['Merge a PR', 'Review PRs', 'Fix a failing build']);

    const adminQuestByTitle = new Map(
      adminGroupQuests.map((quest: any) => [quest.title, quest]),
    );

    const mergeQuest = adminQuestByTitle.get('Merge a PR');
    const reviewQuest = adminQuestByTitle.get('Review PRs');
    const fixBuildQuest = adminQuestByTitle.get('Fix a failing build');

    if (!mergeQuest || !reviewQuest || !fixBuildQuest) {
      throw new Error('Missing base quests required for admin group XP seed');
    }

    await knex('xp_ledger')
      .insert([
        {
          subject_ref: adminGroup,
          quest_id: mergeQuest.id,
          awarded_on_completion_count: 1,
          xp_amount: mergeQuest.xp_reward,
          source: 'seed_admin_group',
        },
        {
          subject_ref: adminGroup,
          quest_id: reviewQuest.id,
          awarded_on_completion_count: 3,
          xp_amount: reviewQuest.xp_reward,
          source: 'seed_admin_group',
        },
        {
          subject_ref: adminGroup,
          quest_id: fixBuildQuest.id,
          awarded_on_completion_count: 2,
          xp_amount: fixBuildQuest.xp_reward,
          source: 'seed_admin_group',
        },
      ])
      .onConflict(['subject_ref', 'quest_id', 'awarded_on_completion_count'])
      .ignore();
  },
};
