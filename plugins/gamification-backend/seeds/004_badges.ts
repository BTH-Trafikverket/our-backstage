import type { Seed } from '../src/seeds/types';

export const seed004Badges: Seed = {
  id: '004_badges',
  description: 'Seeds demo badges, criteria and earned badges',
  async run({ knex }) {
    const now = knex.fn.now();

    const existingBadges = await knex('badges').select('id', 'name');
    const badgeByName = new Map(
      existingBadges.map((row: { id: string; name: string }) => [
        row.name,
        row.id,
      ]),
    );

    const badgeDefs = [
      {
        name: 'First Quest',
        description: 'Awarded when a user completes their first quest',
      },
      {
        name: 'Onboarding Hero',
        description: 'Awarded for completing the onboarding quest',
      },
      {
        name: 'Quest Finisher',
        description: 'Awarded for completing an important quest',
      },
    ];

    for (const badge of badgeDefs) {
      if (!badgeByName.has(badge.name)) {
        const [inserted] = await knex('badges')
          .insert({
            name: badge.name,
            description: badge.description,
            created_at: now,
            updated_at: now,
          })
          .returning(['id', 'name']);

        badgeByName.set(inserted.name, inserted.id);
      }
    }

    const quests = await knex('quests').select('id', 'title');
    const questByTitle = new Map(
      quests.map((row: { id: string; title: string }) => [row.title, row.id]),
    );

    const criteriaDefs = [
      {
        badgeName: 'Onboarding Hero',
        questTitle: 'Onboarding',
        type: 'QUEST_COMPLETION',
        config: { requiredCompletions: 1 },
      },
      {
        badgeName: 'Quest Finisher',
        questTitle: 'Complete Profile',
        type: 'QUEST_COMPLETION',
        config: { requiredCompletions: 1 },
      },
    ];

    for (const criteria of criteriaDefs) {
      const badgeId = badgeByName.get(criteria.badgeName);
      const questId = questByTitle.get(criteria.questTitle);

      if (!badgeId || !questId) {
        continue;
      }

      const exists = await knex('badge_criteria')
        .where({
          badge_id: badgeId,
          quest_id: questId,
          type: criteria.type,
        })
        .first();

      if (!exists) {
        await knex('badge_criteria').insert({
          badge_id: badgeId,
          quest_id: questId,
          type: criteria.type,
          config: JSON.stringify(criteria.config),
          created_at: now,
        });
      }
    }

    const earnedDefs = [
      {
        user_ref: 'user:default/demo',
        badgeName: 'First Quest',
      },
    ];

    for (const earned of earnedDefs) {
      const badgeId = badgeByName.get(earned.badgeName);
      if (!badgeId) {
        continue;
      }

      const exists = await knex('earned_badges')
        .where({
          user_ref: earned.user_ref,
          badge_id: badgeId,
        })
        .first();

      if (!exists) {
        await knex('earned_badges').insert({
          user_ref: earned.user_ref,
          badge_id: badgeId,
          earned_at: now,
        });
      }
    }
  },
};
