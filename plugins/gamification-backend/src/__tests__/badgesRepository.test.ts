import path from 'node:path';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';

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

  async function createQuest(
    knex: Knex,
    title: string,
    subjectType: QuestSubjectType = 'user',
  ) {
    const questsRepo = new QuestsRepository(knex);
    return questsRepo.createQuest({
      title,
      description: `${title} description`,
      target_count: 1,
      xp_reward: 100,
      subject_type: subjectType,
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
        xp_reward: 125,
        subject_type: 'user',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 3 },
      ]);

      const storedBadge = await repository.getBadgeById(badge.id);
      const criteria = await repository.getBadgeCriteria(badge.id);

      expect(storedBadge).toBeDefined();
      expect(storedBadge?.title).toBe('Contributor');
      expect(storedBadge?.xp_reward).toBe(125);
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
        xp_reward: 10,
        subject_type: 'user',
      });
      const badgeB = await repository.createBadge({
        title: 'Badge B',
        description: 'Second badge',
        xp_reward: 20,
        subject_type: 'user',
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
        xp_reward: 30,
        subject_type: 'user',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: questA.id, target_count: 1 },
      ]);

      const updated = await repository.updateBadge(badge.id, {
        title: 'Updated Badge',
        description: 'Updated description',
        xp_reward: 45,
      });
      await repository.replaceBadgeCriteria(badge.id, [
        { quest_id: questB.id, target_count: 4 },
      ]);
      await repository.touchBadge(badge.id);

      const criteria = await repository.getBadgeCriteria(badge.id);

      expect(updated?.title).toBe('Updated Badge');
      expect(updated?.xp_reward).toBe(45);
      expect(criteria).toEqual([
        { badge_id: badge.id, quest_id: questB.id, target_count: 4 },
      ]);

      await knex.destroy();
    });

    it('rejects criteria whose quest type does not match the badge type', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const teamQuest = await createQuest(knex, 'Quest Team Only', 'team');

      const badge = await repository.createBadge({
        title: 'User Badge Only',
        description: 'Should not allow team quests',
        xp_reward: 0,
        subject_type: 'user',
      });

      await expect(
        repository.insertBadgeCriteria(badge.id, [
          { quest_id: teamQuest.id, target_count: 1 },
        ]),
      ).rejects.toThrow(/subject_type/i);

      await knex.destroy();
    });

    it('returns all active badges with persisted earned state for a group subject', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const questA = await createQuest(knex, 'Quest Earned A', 'team');
      const questB = await createQuest(knex, 'Quest Earned B', 'team');

      const earnedBadge = await repository.createBadge({
        title: 'Earned Badge',
        description: 'Completed criteria',
        xp_reward: 80,
        subject_type: 'team',
      });
      await repository.insertBadgeCriteria(earnedBadge.id, [
        { quest_id: questA.id, target_count: 2 },
        { quest_id: questB.id, target_count: 1 },
      ]);

      const unearnedBadge = await repository.createBadge({
        title: 'Unearned Badge',
        description: 'Missing progress',
        xp_reward: 0,
        subject_type: 'team',
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
      const xpRows = await knex('xp_ledger')
        .select(['subject_ref', 'badge_id', 'quest_id', 'xp_amount', 'source'])
        .orderBy([{ column: 'subject_ref', order: 'asc' }]);

      const sortCriteriaCompletion = (
        rows: Array<{
          subject_ref: string;
          badge_id: string;
          quest_id: string;
        }>,
      ) =>
        [...rows].sort((a, b) => {
          const bySubject = a.subject_ref.localeCompare(b.subject_ref);
          if (bySubject !== 0) {
            return bySubject;
          }

          const byBadge = a.badge_id.localeCompare(b.badge_id);
          if (byBadge !== 0) {
            return byBadge;
          }

          return a.quest_id.localeCompare(b.quest_id);
        });

      expect(sortCriteriaCompletion(criteriaCompletion)).toEqual(
        sortCriteriaCompletion([
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
        ]),
      );
      expect(earnedRows).toEqual([
        {
          subject_ref: 'group:default/platform',
          badge_id: earnedBadge.id,
        },
      ]);
      expect(xpRows).toEqual([
        {
          subject_ref: 'group:default/platform',
          badge_id: earnedBadge.id,
          quest_id: null,
          xp_amount: 80,
          source: 'badge_completion_trigger',
        },
      ]);

      const badgeProgress = await repository.getBadgeProgress([
        'group:default/platform',
      ]);

      expect(
        badgeProgress.map(badge => ({
          title: badge.title,
          isEarned: badge.is_earned,
        })),
      ).toEqual([
        { title: 'Earned Badge', isEarned: true },
        { title: 'Unearned Badge', isEarned: false },
      ]);

      await knex.destroy();
    });

    it('awards each badge only once for a user subject even when progress keeps increasing', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Quest Idempotent');

      const badge = await repository.createBadge({
        title: 'User Badge',
        description: 'Awarded once',
        xp_reward: 60,
        subject_type: 'user',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 2 },
      ]);

      await knex('quest_progress').insert({
        subject_ref: 'user:default/alice',
        quest_id: quest.id,
        completion_count: 2,
      });
      await knex('quest_progress')
        .where({
          subject_ref: 'user:default/alice',
          quest_id: quest.id,
        })
        .update({ completion_count: 5 });

      const criteriaCompletion = await knex('badge_criteria_completion')
        .where({
          subject_ref: 'user:default/alice',
          badge_id: badge.id,
          quest_id: quest.id,
        })
        .select('*');
      const earnedRows = await knex('earned_badges')
        .where({
          subject_ref: 'user:default/alice',
          badge_id: badge.id,
        })
        .select('*');
      const xpRows = await knex('xp_ledger')
        .where({
          subject_ref: 'user:default/alice',
          badge_id: badge.id,
        })
        .select('*');
      const badgeProgress = await repository.getBadgeProgress([
        'user:default/alice',
      ]);

      expect(criteriaCompletion).toHaveLength(1);
      expect(earnedRows).toHaveLength(1);
      expect(xpRows).toHaveLength(1);
      expect(badgeProgress).toHaveLength(1);
      expect(badgeProgress[0].is_earned).toBe(true);

      await knex.destroy();
    });

    it('clears persisted runtime state when criteria are replaced', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const questA = await createQuest(knex, 'Quest Replace Runtime A', 'team');
      const questB = await createQuest(knex, 'Quest Replace Runtime B', 'team');

      const badge = await repository.createBadge({
        title: 'Replace Runtime Badge',
        description: 'Runtime should be cleared on criteria replace',
        xp_reward: 40,
        subject_type: 'team',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: questA.id, target_count: 1 },
      ]);

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: questA.id,
        completion_count: 1,
      });

      await repository.replaceBadgeCriteria(badge.id, [
        { quest_id: questB.id, target_count: 2 },
      ]);

      const criteriaCompletion = await knex('badge_criteria_completion')
        .where({ badge_id: badge.id })
        .select('*');
      const earnedBadge = await knex('earned_badges')
        .where({ badge_id: badge.id })
        .select('*');
      const xpLedger = await knex('xp_ledger')
        .where({ badge_id: badge.id })
        .select('*');

      expect(criteriaCompletion).toEqual([]);
      expect(earnedBadge).toEqual([]);
      expect(xpLedger).toEqual([]);

      await knex.destroy();
    });

    it('aggregates earned badge state across user and team subject refs', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Quest Aggregate Subjects', 'team');

      const badge = await repository.createBadge({
        title: 'Team Earned Badge',
        description: 'Earned by a team membership',
        xp_reward: 25,
        subject_type: 'team',
      });
      await repository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 1 },
      ]);

      await knex('quest_progress').insert({
        subject_ref: 'group:default/platform',
        quest_id: quest.id,
        completion_count: 1,
      });

      const badgeProgress = await repository.getBadgeProgress([
        'user:default/alice',
        'group:default/platform',
      ]);

      expect(badgeProgress).toHaveLength(1);
      expect(badgeProgress[0].title).toBe('Team Earned Badge');
      expect(badgeProgress[0].is_earned).toBe(true);
      expect(badgeProgress[0].earned_at).toBeTruthy();

      await knex.destroy();
    });

    it('limits active badge visibility to the subject types in the requested refs', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const userQuest = await createQuest(knex, 'Quest User Visible', 'user');
      const teamQuest = await createQuest(knex, 'Quest Team Visible', 'team');

      const userBadge = await repository.createBadge({
        title: 'User Badge Visible',
        description: 'Visible for user refs only',
        xp_reward: 0,
        subject_type: 'user',
      });
      const teamBadge = await repository.createBadge({
        title: 'Team Badge Visible',
        description: 'Visible for team refs only',
        xp_reward: 0,
        subject_type: 'team',
      });

      await repository.insertBadgeCriteria(userBadge.id, [
        { quest_id: userQuest.id, target_count: 1 },
      ]);
      await repository.insertBadgeCriteria(teamBadge.id, [
        { quest_id: teamQuest.id, target_count: 1 },
      ]);

      const groupOnlyProgress = await repository.getBadgeProgress([
        'group:default/platform',
      ]);
      const userOnlyProgress = await repository.getBadgeProgress([
        'user:default/alice',
      ]);

      expect(groupOnlyProgress.map(badge => badge.title)).toEqual([
        'Team Badge Visible',
      ]);
      expect(userOnlyProgress.map(badge => badge.title)).toEqual([
        'User Badge Visible',
      ]);

      await knex.destroy();
    });

    it('archives a badge instead of deleting it', async () => {
      const knex = await initDb();
      const repository = new BadgesRepository(knex);
      const quest = await createQuest(knex, 'Quest Delete', 'team');

      const badge = await repository.createBadge({
        title: 'Delete Badge',
        description: 'To be removed',
        xp_reward: 35,
        subject_type: 'team',
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
      const badgeProgress = await repository.getBadgeProgress([
        'group:default/platform',
      ]);

      expect(deleted).toBe(true);
      expect(activeBadge).toBeUndefined();
      expect(listedBadges).toEqual([]);
      expect(storedBadge?.archived_at).toBeTruthy();
      expect(earnedRows).toHaveLength(1);
      expect(badgeProgress).toHaveLength(1);
      expect(badgeProgress[0].title).toBe('Delete Badge');
      expect(badgeProgress[0].archived_at).toBeTruthy();
      expect(badgeProgress[0].is_earned).toBe(true);

      await knex.destroy();
    });
  });
});
