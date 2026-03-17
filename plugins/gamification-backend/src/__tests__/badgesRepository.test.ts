import type { Knex } from 'knex';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('BadgesRepository integration', () => {
  it('rolls back badge writes when a transaction fails', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);

    await expect(
      repository.withTransaction(async repo => {
        await repo.createBadge({
          title: 'Transactional Badge',
          description: 'Should be rolled back',
          subject_type: 'user',
        });

        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await expect(
      knex('badges').where({ title: 'Transactional Badge' }),
    ).resolves.toEqual([]);

    await knex.destroy();
  });

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

  it('creates a badge and its criteria', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Create Badge Quest');

    const badge = await repository.createBadge({
      title: 'Contributor',
      description: 'Awarded for completing core work',
      subject_type: 'user',
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
  });

  it('lists badges with criteria for multiple badge ids', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const questA = await createQuest(knex, 'Quest A');
    const questB = await createQuest(knex, 'Quest B');

    const badgeA = await repository.createBadge({
      title: 'Badge A',
      description: 'First badge',
      subject_type: 'user',
    });
    const badgeB = await repository.createBadge({
      title: 'Badge B',
      description: 'Second badge',
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
  });

  it('updates badge data and replaces criteria', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const questA = await createQuest(knex, 'Quest Replace A');
    const questB = await createQuest(knex, 'Quest Replace B');

    const badge = await repository.createBadge({
      title: 'Original Badge',
      description: 'Original description',
      subject_type: 'user',
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
  });

  it('filters archived badges by default, supports title search, and updates subject type', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);

    const activeBadge = await repository.createBadge({
      title: 'Platform Reviewer',
      description: 'Active badge',
      subject_type: 'user',
    });
    const archivedBadge = await repository.createBadge({
      title: 'Legacy Reviewer',
      description: 'Archived badge',
      subject_type: 'user',
    });

    await repository.updateBadge(activeBadge.id, { subject_type: 'team' });
    await repository.deleteBadge(archivedBadge.id);

    const activeOnly = await repository.getBadges();
    const searched = await repository.getBadges('Reviewer', {
      includeArchived: true,
    });
    const archivedDefaultLookup = await repository.getBadgeById(
      archivedBadge.id,
    );
    const archivedIncludedLookup = await repository.getBadgeById(
      archivedBadge.id,
      {
        includeArchived: true,
      },
    );

    expect(activeOnly.map(badge => badge.id)).toEqual([activeBadge.id]);
    expect(searched.map(badge => badge.id).sort()).toEqual(
      [activeBadge.id, archivedBadge.id].sort(),
    );
    expect((await repository.getBadgeById(activeBadge.id))?.subject_type).toBe(
      'team',
    );
    expect(archivedDefaultLookup).toBeUndefined();
    expect(archivedIncludedLookup?.id).toBe(archivedBadge.id);
  });

  it('treats empty criteria operations as no-ops', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);

    await expect(repository.insertBadgeCriteria('badge-1', [])).resolves.toBe(
      undefined,
    );
    await expect(repository.getCriteriaForBadges([])).resolves.toEqual([]);
    await expect(
      repository.getBadgeProgress(['', 'catalog:default/component/example']),
    ).resolves.toEqual([]);

    await knex.destroy();
  });

  it('rejects criteria whose quest type does not match the badge type', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const teamQuest = await createQuest(knex, 'Quest Team Only', 'team');

    const badge = await repository.createBadge({
      title: 'User Badge Only',
      description: 'Should not allow team quests',
      subject_type: 'user',
    });

    await expect(
      repository.insertBadgeCriteria(badge.id, [
        { quest_id: teamQuest.id, target_count: 1 },
      ]),
    ).rejects.toThrow(/subject_type/i);
  });

  it('returns all active badges with persisted earned state for a group subject', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const questA = await createQuest(knex, 'Quest Earned A', 'team');
    const questB = await createQuest(knex, 'Quest Earned B', 'team');

    const earnedBadge = await repository.createBadge({
      title: 'Earned Badge',
      description: 'Completed criteria',
      subject_type: 'team',
    });
    await repository.insertBadgeCriteria(earnedBadge.id, [
      { quest_id: questA.id, target_count: 2 },
      { quest_id: questB.id, target_count: 1 },
    ]);

    const unearnedBadge = await repository.createBadge({
      title: 'Unearned Badge',
      description: 'Missing progress',
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
    const badgeProgress = await repository.getBadgeProgress([
      'user:default/alice',
    ]);

    expect(criteriaCompletion).toHaveLength(1);
    expect(earnedRows).toHaveLength(1);
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

    expect(criteriaCompletion).toEqual([]);
    expect(earnedBadge).toEqual([]);

    await knex.destroy();
  });

  it('aggregates earned badge state across user and team subject refs', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Quest Aggregate Subjects', 'team');

    const badge = await repository.createBadge({
      title: 'Team Earned Badge',
      description: 'Earned by a team membership',
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

  it('returns criterion progress rows for each requested subject ref', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Quest Criteria Progress');

    const badge = await repository.createBadge({
      title: 'Progress Badge',
      description: 'Badge with per-subject progress rows',
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(badge.id, [
      { quest_id: quest.id, target_count: 3 },
    ]);

    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: quest.id,
      completion_count: 2,
    });

    const rows = await repository.getCriteriaProgressForBadges(
      [badge.id],
      ['user:default/alice', 'user:default/bob'],
    );

    expect(rows).toEqual([
      {
        badge_id: badge.id,
        quest_id: quest.id,
        target_count: 3,
        quest_title: 'Quest Criteria Progress',
        quest_target_count: 1,
        completion_policy: 'REPEATABLE',
        subject_ref: 'user:default/alice',
        completion_count: 2,
      },
      {
        badge_id: badge.id,
        quest_id: quest.id,
        target_count: 3,
        quest_title: 'Quest Criteria Progress',
        quest_target_count: 1,
        completion_policy: 'REPEATABLE',
        subject_ref: 'user:default/bob',
        completion_count: 0,
      },
    ]);

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
      subject_type: 'user',
    });
    const teamBadge = await repository.createBadge({
      title: 'Team Badge Visible',
      description: 'Visible for team refs only',
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
  });
});
