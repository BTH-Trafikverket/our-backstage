import path from 'node:path';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';

jest.setTimeout(60000);

describe('BadgesRepository Integration Tests', () => {
  if (!process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

    const isLocal =
      DB_HOST === 'localhost' ||
      DB_HOST === '127.0.0.1' ||
      DB_HOST === 'postgres';

    if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && isLocal) {
      process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
    }
  }

  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });
  const supportsPostgres18 = databases.supports('POSTGRES_18');
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  async function initDb(): Promise<Knex> {
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

  async function createQuest(knex: Knex, title: string) {
    const questsRepo = new QuestsRepository(knex);
    return questsRepo.createQuest({
      title,
      description: `${title} description`,
      target_count: 1,
      xp_reward: 100,
    });
  }

  const describeWithDatabase = supportsPostgres18 ? describe : describe.skip;

  describeWithDatabase('with POSTGRES_18 available', () => {
    it('creates a badge and its criteria', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Create Badge Quest');

      const badge = await repository.createBadge({
        title: 'Contributor',
        description: 'Awarded for completing core work',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 3 },
      ]);

      const storedBadge = await repository.getBadgeById(badge.id);
      const criteria = await repository.getBadgeCriteria(badge.id);

      expect(storedBadge).toBeDefined();
      expect(storedBadge?.title).toBe('Contributor');
      expect(criteria).toEqual([
        { badge_id: badge.id, quest_id: quest.id, target_count: 3 },
      ]);

      await knex.destroy();
    });

    it('lists badges with criteria for multiple badge ids', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const questA = await createQuest(knex, 'Quest A');
      const questB = await createQuest(knex, 'Quest B');

      const badgeA = await repository.createBadge({
        title: 'Badge A',
        description: 'First badge',
      });
      const badgeB = await repository.createBadge({
        title: 'Badge B',
        description: 'Second badge',
      });

      await repository.insertBadgeCriteria(badgeA.id, [
        { quest_id: questA.id, target_count: 1 },
      ]);
      await repository.insertBadgeCriteria(badgeB.id, [
        { quest_id: questB.id, target_count: 2 },
      ]);

      const badges = await repository.getBadges();
      const criteria = await repository.getCriteriaForBadges(
        badges.map(badge => badge.id),
      );

      expect(badges).toHaveLength(2);
      expect(criteria).toHaveLength(2);

      await knex.destroy();
    });

    it('updates badge data and replaces criteria', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const questA = await createQuest(knex, 'Quest Replace A');
      const questB = await createQuest(knex, 'Quest Replace B');

      const badge = await repository.createBadge({
        title: 'Original Badge',
        description: 'Original description',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: questA.id, target_count: 1 },
      ]);

      const updated = await repository.updateBadge(badge.id, {
        title: 'Updated Badge',
        description: 'Updated description',
      });
      await repository.replaceBadgeCriteria(badge.id, [
        { quest_id: questB.id, target_count: 4 },
      ]);
      await repository.touchBadge(badge.id);

      const criteria = await repository.getBadgeCriteria(badge.id);

      expect(updated?.title).toBe('Updated Badge');
      expect(criteria).toEqual([
        { badge_id: badge.id, quest_id: questB.id, target_count: 4 },
      ]);

      await knex.destroy();
    });

    it('returns only badges whose criteria are fully completed for a subject', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const questA = await createQuest(knex, 'Quest Earned A');
      const questB = await createQuest(knex, 'Quest Earned B');

      const earnedBadge = await repository.createBadge({
        title: 'Earned Badge',
        description: 'Completed criteria',
      });
      await repository.insertBadgeCriteria(earnedBadge.id, [
        { quest_id: questA.id, target_count: 2 },
        { quest_id: questB.id, target_count: 1 },
      ]);

      const unearnedBadge = await repository.createBadge({
        title: 'Unearned Badge',
        description: 'Missing progress',
      });
      await repository.insertBadgeCriteria(unearnedBadge.id, [
        { quest_id: questA.id, target_count: 3 },
      ]);

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: questA.id,
        completion_count: 1,
      });

      expect(await knex('badge_criteria_completion').select('*')).toEqual([]);
      expect(await knex('earned_badges').select('*')).toEqual([]);

      await knex('quest_progress')
        .where({
          subject_ref: 'group:default/platform',
          quest_id: questA.id,
        })
        .update({ completion_count: 2 });

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: questB.id,
        completion_count: 1,
      });

      await knex('quest_progress')
        .where({
          subject_ref: 'group:default/platform',
          quest_id: questB.id,
        })
        .update({ completion_count: 2 });

      const criteriaCompletion = await knex('badge_criteria_completion')
        .select(['subject_ref', 'badge_id', 'quest_id'])
        .orderBy([
          { column: 'badge_id', order: 'asc' },
          { column: 'quest_id', order: 'asc' },
        ]);
      const earnedRows = await knex('earned_badges')
        .select(['subject_ref', 'badge_id'])
        .orderBy([
          { column: 'subject_ref', order: 'asc' },
          { column: 'badge_id', order: 'asc' },
        ]);

      expect(criteriaCompletion).toEqual([
        {
          subject_ref: 'group:default/platform',
          badge_id: earnedBadge.id,
          quest_id: questA.id,
        },
        {
          subject_ref: 'group:default/platform',
          badge_id: earnedBadge.id,
          quest_id: questB.id,
        },
      ]);
      expect(earnedRows).toEqual([
        {
          subject_ref: 'group:default/platform',
          badge_id: earnedBadge.id,
        },
      ]);

      const earnedBadges = await repository.getEarnedBadges(
        'group:default/platform',
      );

      expect(earnedBadges.map(badge => badge.title)).toEqual(['Earned Badge']);

      await knex.destroy();
    });

    it('backfills earned badge state when criteria are added after progress exists', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Quest Seed Order');

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: quest.id,
        completion_count: 3,
      });

      const badge = await repository.createBadge({
        title: 'Backfilled Badge',
        description: 'Backfilled from existing progress',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 3 },
      ]);

      const criteriaCompletion = await knex('badge_criteria_completion')
        .where({
          subject_ref: 'group:default/platform',
          badge_id: badge.id,
          quest_id: quest.id,
        })
        .first();
      const earnedBadge = await knex('earned_badges')
        .where({
          subject_ref: 'group:default/platform',
          badge_id: badge.id,
        })
        .first();

      expect(criteriaCompletion).toBeDefined();
      expect(earnedBadge).toBeDefined();

      await knex.destroy();
    });

    it('archives a badge instead of deleting it', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Quest Delete');

      const badge = await repository.createBadge({
        title: 'Delete Badge',
        description: 'To be removed',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 1 },
      ]);

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: quest.id,
        completion_count: 1,
      });

      const deleted = await repository.deleteBadge(badge.id);
      const activeBadge = await repository.getBadgeById(badge.id);
      const listedBadges = await repository.getBadges();
      const storedBadge = await knex('badges').where({ id: badge.id }).first();
      const earnedRows = await knex('earned_badges')
        .where({ badge_id: badge.id })
        .select('*');

      expect(deleted).toBe(true);
      expect(activeBadge).toBeUndefined();
      expect(listedBadges).toEqual([]);
      expect(storedBadge?.archived_at).toBeTruthy();
      expect(earnedRows).toEqual([]);

      await knex.destroy();
    });
  });
});
