import type { Seed } from '../src/seeds/types';

type DemoEvent = {
  event_id: string;
  event_key: string;
  subject_ref: string;
  caller_subject: string;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type HistoricalAwardSeed = {
  subject_ref: string;
  questTitle: string;
  awarded_on_completion_count: number;
  xp_amount: number;
  created_at: Date;
  source: string;
};

const LEADERBOARD_TIME_ZONE = 'Europe/Stockholm';

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);

  return { year, month, day };
}

function getLocalWeekday(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = weekdayMap[weekday];
  if (dayOfWeek === undefined) {
    throw new Error(`Unsupported weekday '${weekday}' for ${timeZone}`);
  }

  return dayOfWeek;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;

  if (!timeZoneName) {
    throw new Error(`Unable to read timezone offset for ${timeZone}`);
  }

  if (timeZoneName === 'GMT') {
    return 0;
  }

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);
  if (!match) {
    throw new Error(
      `Unsupported timezone offset '${timeZoneName}' for ${timeZone}`,
    );
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function getUtcDateForLocalHour(
  parts: LocalDateParts,
  timeZone: string,
  hour: number,
): Date {
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0, 0);

  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs =
      Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0, 0) -
      offsetMs;
  }

  return new Date(utcMs);
}

function shiftLocalDate(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getStartOfWeek(parts: LocalDateParts, dayOfWeek: number) {
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return shiftLocalDate(parts, -daysSinceMonday);
}

function getPreviousMonth(parts: Pick<LocalDateParts, 'year' | 'month'>) {
  if (parts.month === 1) {
    return { year: parts.year - 1, month: 12 };
  }

  return { year: parts.year, month: parts.month - 1 };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildHistoricalPeriodInstants(now: Date) {
  const localToday = getLocalDateParts(now, LEADERBOARD_TIME_ZONE);
  const dayOfWeek = getLocalWeekday(now, LEADERBOARD_TIME_ZONE);
  const currentWeekStart = getStartOfWeek(localToday, dayOfWeek);
  const previousMonth = getPreviousMonth(localToday);
  const twoMonthsAgo = getPreviousMonth(previousMonth);

  return {
    lastWeek: getUtcDateForLocalHour(
      shiftLocalDate(currentWeekStart, -5),
      LEADERBOARD_TIME_ZONE,
      12,
    ),
    lastMonth: getUtcDateForLocalHour(
      {
        year: previousMonth.year,
        month: previousMonth.month,
        day: Math.min(
          15,
          getDaysInMonth(previousMonth.year, previousMonth.month),
        ),
      },
      LEADERBOARD_TIME_ZONE,
      12,
    ),
    twoMonthsAgo: getUtcDateForLocalHour(
      {
        year: twoMonthsAgo.year,
        month: twoMonthsAgo.month,
        day: Math.min(
          15,
          getDaysInMonth(twoMonthsAgo.year, twoMonthsAgo.month),
        ),
      },
      LEADERBOARD_TIME_ZONE,
      12,
    ),
  };
}

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

    const historicalQuestTitles = [
      'Merge a PR',
      'Review PRs',
      'Fix a failing build',
      'Shared Release Readiness',
      'Accessibility Audit',
      'Dependency Hygiene Sprint',
    ];
    const historicalQuests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', historicalQuestTitles);
    const historicalQuestIdByTitle = new Map(
      historicalQuests.map((quest: any) => [
        quest.title as string,
        quest.id as string,
      ]),
    );

    for (const questTitle of historicalQuestTitles) {
      if (!historicalQuestIdByTitle.has(questTitle)) {
        throw new Error(
          `Missing quest '${questTitle}' required for historical leaderboard seed data`,
        );
      }
    }

    const periodInstants = buildHistoricalPeriodInstants(new Date());
    const historicalAwards: HistoricalAwardSeed[] = [
      {
        subject_ref: linus,
        questTitle: 'Merge a PR',
        awarded_on_completion_count: 101,
        xp_amount: 20,
        created_at: periodInstants.lastWeek,
        source: 'seed_historical:last_week',
      },
      {
        subject_ref: zoe,
        questTitle: 'Review PRs',
        awarded_on_completion_count: 101,
        xp_amount: 30,
        created_at: periodInstants.lastWeek,
        source: 'seed_historical:last_week',
      },
      {
        subject_ref: adminGroup,
        questTitle: 'Shared Release Readiness',
        awarded_on_completion_count: 101,
        xp_amount: 90,
        created_at: periodInstants.lastWeek,
        source: 'seed_historical:last_week',
      },
      {
        subject_ref: skz,
        questTitle: 'Fix a failing build',
        awarded_on_completion_count: 201,
        xp_amount: 60,
        created_at: periodInstants.lastMonth,
        source: 'seed_historical:last_month',
      },
      {
        subject_ref: mara,
        questTitle: 'Merge a PR',
        awarded_on_completion_count: 201,
        xp_amount: 20,
        created_at: periodInstants.lastMonth,
        source: 'seed_historical:last_month',
      },
      {
        subject_ref: adminGroup,
        questTitle: 'Accessibility Audit',
        awarded_on_completion_count: 201,
        xp_amount: 50,
        created_at: periodInstants.lastMonth,
        source: 'seed_historical:last_month',
      },
      {
        subject_ref: hahh,
        questTitle: 'Review PRs',
        awarded_on_completion_count: 301,
        xp_amount: 45,
        created_at: periodInstants.twoMonthsAgo,
        source: 'seed_historical:two_months_ago',
      },
      {
        subject_ref: bob,
        questTitle: 'Fix a failing build',
        awarded_on_completion_count: 301,
        xp_amount: 30,
        created_at: periodInstants.twoMonthsAgo,
        source: 'seed_historical:two_months_ago',
      },
      {
        subject_ref: adminGroup,
        questTitle: 'Dependency Hygiene Sprint',
        awarded_on_completion_count: 301,
        xp_amount: 60,
        created_at: periodInstants.twoMonthsAgo,
        source: 'seed_historical:two_months_ago',
      },
    ];

    await knex('xp_awards').where('source', 'like', 'seed_historical:%').del();

    await knex('xp_awards').insert(
      historicalAwards.map(award => ({
        subject_ref: award.subject_ref,
        quest_id: historicalQuestIdByTitle.get(award.questTitle)!,
        awarded_on_completion_count: award.awarded_on_completion_count,
        xp_amount: award.xp_amount,
        source: award.source,
        created_at: award.created_at,
      })),
    );
  },
};
