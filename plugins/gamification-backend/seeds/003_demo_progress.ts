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
    'Seed demo quest progress by replaying events (receipts + quest_progress)',
  async run({ knex }) {
    const adminGroup = 'group:default/admin';
    const alice = 'user:local/alice';
    const bob = 'user:local/bob';

    const linus = 'user:default/linusandersson02';
    const zoe = 'user:default/zoebalowi';
    const mara = 'user:default/Maram277';
    const skz = 'user:default/skz911';
    const hahh = 'user:default/hahh24';

    const questTitleByEventKey = {
      'github.pull_request.merged': 'Merge a PR',
      'github.pull_request.reviewed': 'Review PRs',
      'github.ci.fixed': 'Fix a failing build',
    } as const;

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
        event_id: 'seed:skz:merge:2',
        event_key: 'github.pull_request.merged',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:merge:3',
        event_key: 'github.pull_request.merged',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:merge:4',
        event_key: 'github.pull_request.merged',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:merge:5',
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
        event_id: 'seed:skz:review:5',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:6',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:7',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:8',
        event_key: 'github.pull_request.reviewed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:review:9',
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
        event_id: 'seed:skz:ci:3',
        event_key: 'github.ci.fixed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:ci:4',
        event_key: 'github.ci.fixed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:ci:5',
        event_key: 'github.ci.fixed',
        subject_ref: skz,
        caller_subject: 'seed',
      },
      {
        event_id: 'seed:skz:ci:6',
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

    const eventQuestTitles = Object.values(questTitleByEventKey);
    const eventQuests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', eventQuestTitles);
    const questIdByTitle = new Map(
      eventQuests.map((quest: any) => [
        quest.title as string,
        quest.id as string,
      ]),
    );

    for (const questTitle of eventQuestTitles) {
      if (!questIdByTitle.has(questTitle)) {
        throw new Error(
          `Missing quest '${questTitle}' required for demo progress seed`,
        );
      }
    }

    const hasQuestEventReceiptsTable = await knex.schema.hasTable(
      'quest_event_receipts',
    );

    for (const ev of demoEvents) {
      const questTitle =
        questTitleByEventKey[ev.event_key as keyof typeof questTitleByEventKey];
      const questId = questIdByTitle.get(questTitle);

      if (!questId) {
        throw new Error(`No quest found for event_key '${ev.event_key}'`);
      }

      if (hasQuestEventReceiptsTable) {
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

        if (!inserted || inserted.length === 0) {
          continue;
        }
      }

      await knex('quest_progress')
        .insert({
          subject_ref: ev.subject_ref,
          quest_id: questId,
          completion_count: 1,
        })
        .onConflict(['subject_ref', 'quest_id'])
        .merge({
          completion_count: knex.raw('quest_progress.completion_count + 1'),
        });
    }

    const skzOneTimeQuestTitles = [
      'Ship Your First Feature Flag',
      'Lead a Production Rollout',
      'Run a Knowledge Share',
    ];
    const skzOneTimeQuests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', skzOneTimeQuestTitles);
    const skzOneTimeQuestIdByTitle = new Map(
      skzOneTimeQuests.map((quest: any) => [
        quest.title as string,
        quest.id as string,
      ]),
    );

    for (const questTitle of skzOneTimeQuestTitles) {
      if (!skzOneTimeQuestIdByTitle.has(questTitle)) {
        throw new Error(
          `Missing one-time quest '${questTitle}' required for skz demo seed`,
        );
      }
    }

    await knex('quest_progress')
      .insert(
        skzOneTimeQuestTitles.map(questTitle => ({
          subject_ref: skz,
          quest_id: skzOneTimeQuestIdByTitle.get(questTitle)!,
          completion_count: 1,
        })),
      )
      .onConflict(['subject_ref', 'quest_id'])
      .merge({
        completion_count: knex.raw(
          'GREATEST(quest_progress.completion_count, 1)',
        ),
      });

    const adminGroupQuests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', [
        'Dependency Hygiene Sprint',
        'Security Patch Sweep',
        'Shared Release Readiness',
        'Documentation Drive',
        'Accessibility Audit',
      ]);

    const adminQuestByTitle = new Map(
      adminGroupQuests.map((quest: any) => [quest.title, quest]),
    );

    const dependencyHygieneQuest = adminQuestByTitle.get(
      'Dependency Hygiene Sprint',
    );
    const securityPatchQuest = adminQuestByTitle.get('Security Patch Sweep');
    const releaseReadinessQuest = adminQuestByTitle.get(
      'Shared Release Readiness',
    );
    const documentationDriveQuest = adminQuestByTitle.get(
      'Documentation Drive',
    );
    const accessibilityAuditQuest = adminQuestByTitle.get(
      'Accessibility Audit',
    );

    if (
      !dependencyHygieneQuest ||
      !securityPatchQuest ||
      !releaseReadinessQuest ||
      !documentationDriveQuest ||
      !accessibilityAuditQuest
    ) {
      throw new Error('Missing team quests required for admin group demo seed');
    }

    await knex('quest_progress')
      .insert([
        {
          subject_ref: adminGroup,
          quest_id: dependencyHygieneQuest.id,
          completion_count: 2,
        },
        {
          subject_ref: adminGroup,
          quest_id: securityPatchQuest.id,
          completion_count: 1,
        },
        {
          subject_ref: adminGroup,
          quest_id: releaseReadinessQuest.id,
          completion_count: 3,
        },
        {
          subject_ref: adminGroup,
          quest_id: documentationDriveQuest.id,
          completion_count: 5,
        },
        {
          subject_ref: adminGroup,
          quest_id: accessibilityAuditQuest.id,
          completion_count: 2,
        },
      ])
      .onConflict(['subject_ref', 'quest_id'])
      .merge({
        completion_count: knex.raw('EXCLUDED.completion_count'),
      });
  },
};
