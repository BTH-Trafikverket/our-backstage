import type { Seed } from '../src/seeds/types';

type BadgeSeed = {
  title: string;
  description: string;
  subject_type: 'user' | 'team';
  criterias: Array<{
    questTitle: string;
    target_count: number;
  }>;
};

export const seed004Badges: Seed = {
  id: '004_badges',
  description: 'Seed demo badges and badge criteria',
  async run({ knex }) {
    const badgeSeeds: BadgeSeed[] = [
      {
        title: 'First Merge',
        description: 'Awarded for landing your first pull request',
        subject_type: 'user',
        criterias: [{ questTitle: 'Merge a PR', target_count: 1 }],
      },
      {
        title: 'Review Champion',
        description: 'Awarded for consistent and meaningful code reviews',
        subject_type: 'user',
        criterias: [{ questTitle: 'Review PRs', target_count: 3 }],
      },
      {
        title: 'All-round Contributor',
        description: 'Awarded for merging, reviewing, and fixing CI',
        subject_type: 'user',
        criterias: [
          { questTitle: 'Merge a PR', target_count: 1 },
          { questTitle: 'Review PRs', target_count: 3 },
          { questTitle: 'Fix a failing build', target_count: 2 },
        ],
      },
      {
        title: 'Security Sweep',
        description: 'Awarded to teams that finish a security patch sweep',
        subject_type: 'team',
        criterias: [{ questTitle: 'Security Patch Sweep', target_count: 1 }],
      },
      {
        title: 'Release Ready',
        description: 'Awarded to teams that finish readiness and docs work',
        subject_type: 'team',
        criterias: [
          { questTitle: 'Shared Release Readiness', target_count: 3 },
          { questTitle: 'Documentation Drive', target_count: 5 },
        ],
      },
      {
        title: 'Maintenance Crew',
        description:
          'Awarded to teams that keep dependencies and audits in shape',
        subject_type: 'team',
        criterias: [
          { questTitle: 'Dependency Hygiene Sprint', target_count: 2 },
          { questTitle: 'Accessibility Audit', target_count: 2 },
        ],
      },
    ];

    const requiredQuestTitles = [
      ...new Set(
        badgeSeeds.flatMap(badge =>
          badge.criterias.map(criteria => criteria.questTitle),
        ),
      ),
    ];

    const quests = await knex('quests')
      .select(['id', 'title'])
      .whereIn('title', requiredQuestTitles);

    const questIdByTitle = new Map(
      quests.map((quest: any) => [quest.title as string, quest.id as string]),
    );

    for (const questTitle of requiredQuestTitles) {
      if (!questIdByTitle.has(questTitle)) {
        throw new Error(
          `Missing quest '${questTitle}' required for badge seed data`,
        );
      }
    }

    await knex('badges')
      .insert(
        badgeSeeds.map(badge => ({
          title: badge.title,
          description: badge.description,
          subject_type: badge.subject_type,
        })),
      )
      .onConflict('title')
      .merge({
        description: knex.ref('excluded.description'),
        subject_type: knex.ref('excluded.subject_type'),
        archived_at: null,
      });

    const badges = await knex('badges')
      .select(['id', 'title'])
      .whereIn(
        'title',
        badgeSeeds.map(badge => badge.title),
      );

    const badgeIdByTitle = new Map(
      badges.map((badge: any) => [badge.title as string, badge.id as string]),
    );

    await knex('badge_criteria')
      .insert(
        badgeSeeds.flatMap(badge =>
          badge.criterias.map(criteria => ({
            badge_id: badgeIdByTitle.get(badge.title)!,
            quest_id: questIdByTitle.get(criteria.questTitle)!,
            target_count: criteria.target_count,
          })),
        ),
      )
      .onConflict(['badge_id', 'quest_id'])
      .merge(['target_count']);
  },
};
