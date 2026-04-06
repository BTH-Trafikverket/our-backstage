import type { Knex } from 'knex';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('BadgesRepository integration', () => {
  async function listBadges(
    repository: BadgesRepository,
    params?: Parameters<BadgesRepository['getPaginatedBadges']>[0],
  ) {
    const result = await repository.getPaginatedBadges({
      page: 1,
      limit: 1000,
      ...params,
    });

    return result.data;
  }

  async function listBadgeProgress(
    repository: BadgesRepository,
    subjectRefs: string[],
    params?: Parameters<BadgesRepository['getPaginatedBadgeProgress']>[1],
  ) {
    const result = await repository.getPaginatedBadgeProgress(subjectRefs, {
      page: 1,
      limit: 1000,
      ...params,
    });

    return result.data;
  }

  it('rolls back badge writes when a transaction fails', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);

    await expect(
      repository.withTransaction(async repo => {
        await repo.createBadge({
          title: 'Transactional Badge',
          description: 'Should be rolled back',
          xp_reward: 0,
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
    targetCount = 1,
  ) {
    const questsRepo = new QuestsRepository(knex);
    return questsRepo.createQuest({
      title,
      description: `${title} description`,
      target_count: targetCount,
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
      xp_reward: 0,
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
      xp_reward: 0,
      subject_type: 'user',
    });
    const badgeB = await repository.createBadge({
      title: 'Badge B',
      description: 'Second badge',
      xp_reward: 0,
      subject_type: 'user',
    });

    await repository.insertBadgeCriteria(badgeA.id, [
      { quest_id: questA.id, target_count: 1 },
    ]);
    await repository.insertBadgeCriteria(badgeB.id, [
      { quest_id: questB.id, target_count: 2 },
    ]);

    const badges = await listBadges(repository);
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
      xp_reward: 0,
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
      xp_reward: 0,
      subject_type: 'user',
    });
    const archivedBadge = await repository.createBadge({
      title: 'Legacy Reviewer',
      description: 'Archived badge',
      xp_reward: 0,
      subject_type: 'user',
    });

    await repository.updateBadge(activeBadge.id, { subject_type: 'team' });
    await repository.deleteBadge(archivedBadge.id);

    const activeOnly = await listBadges(repository);
    const searched = await listBadges(repository, {
      searchTitle: 'Reviewer',
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
      listBadgeProgress(repository, ['', 'catalog:default/component/example']),
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
      xp_reward: 0,
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
      xp_reward: 0,
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

    const badgeProgress = await listBadgeProgress(
      repository,
      ['group:default/platform'],
      { status: 'all' },
    );

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
      xp_reward: 40,
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
    const xpRows = await knex('xp_awards')
      .where({
        subject_ref: 'user:default/alice',
        badge_id: badge.id,
      })
      .select(['badge_id', 'quest_id', 'xp_amount', 'source']);
    const domainEvents = await knex('domain_events')
      .where({
        event_name: 'badge.earned',
        subject_ref: 'user:default/alice',
        badge_id: badge.id,
      })
      .select('*');
    const badgeProgress = await listBadgeProgress(
      repository,
      ['user:default/alice'],
      { status: 'all' },
    );

    expect(criteriaCompletion).toHaveLength(1);
    expect(earnedRows).toHaveLength(1);
    expect(xpRows).toEqual([
      {
        badge_id: badge.id,
        quest_id: null,
        xp_amount: 40,
        source: 'badge_completion_trigger',
      },
    ]);
    expect(domainEvents).toHaveLength(1);
    expect(domainEvents[0].payload).toEqual(
      expect.objectContaining({
        username: 'alice',
        badge_title: 'User Badge',
        badge_xp_reward: 40,
      }),
    );
    expect(badgeProgress).toHaveLength(1);
    expect(badgeProgress[0].is_earned).toBe(true);

    await knex.destroy();
  });

  it('does not award a badge until the quest reaches its own completion threshold', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Quest With Milestone', 'user', 5);

    const badge = await repository.createBadge({
      title: 'Milestone Badge',
      description: 'Awarded after one full quest completion',
      xp_reward: 40,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(badge.id, [
      { quest_id: quest.id, target_count: 1 },
    ]);

    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: quest.id,
      completion_count: 1,
    });

    expect(
      await knex('badge_criteria_completion').where({ badge_id: badge.id }),
    ).toEqual([]);
    expect(await knex('earned_badges').where({ badge_id: badge.id })).toEqual(
      [],
    );

    await knex('quest_progress')
      .where({
        subject_ref: 'user:default/alice',
        quest_id: quest.id,
      })
      .update({ completion_count: 4 });

    expect(
      await knex('badge_criteria_completion').where({ badge_id: badge.id }),
    ).toEqual([]);
    expect(await knex('earned_badges').where({ badge_id: badge.id })).toEqual(
      [],
    );

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
      .select(['subject_ref', 'badge_id', 'quest_id']);
    const earnedRows = await knex('earned_badges')
      .where({
        subject_ref: 'user:default/alice',
        badge_id: badge.id,
      })
      .select(['subject_ref', 'badge_id']);

    expect(criteriaCompletion).toEqual([
      {
        subject_ref: 'user:default/alice',
        badge_id: badge.id,
        quest_id: quest.id,
      },
    ]);
    expect(earnedRows).toEqual([
      {
        subject_ref: 'user:default/alice',
        badge_id: badge.id,
      },
    ]);

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
      xp_reward: 60,
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
    const xpAwardRows = await knex('xp_awards')
      .where({
        subject_ref: 'group:default/platform',
        badge_id: badge.id,
      })
      .select(['badge_id', 'quest_id', 'xp_amount', 'source']);

    expect(criteriaCompletion).toEqual([]);
    expect(earnedBadge).toEqual([]);
    expect(xpAwardRows).toEqual([
      {
        badge_id: badge.id,
        quest_id: null,
        xp_amount: 60,
        source: 'badge_completion_trigger',
      },
    ]);

    await knex.destroy();
  });

  it('aggregates earned badge state across user and team subject refs', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Quest Aggregate Subjects', 'team');

    const badge = await repository.createBadge({
      title: 'Team Earned Badge',
      description: 'Earned by a team membership',
      xp_reward: 0,
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

    const badgeProgress = await listBadgeProgress(
      repository,
      ['user:default/alice', 'group:default/platform'],
      { status: 'all' },
    );

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
      xp_reward: 0,
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

    const groupOnlyProgress = await listBadgeProgress(repository, [
      'group:default/platform',
    ]);
    const userOnlyProgress = await listBadgeProgress(repository, [
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

  it('supports search and deterministic sorting for badge progress', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Quest Progress Search', 'user');

    const highXpBadge = await repository.createBadge({
      title: 'Reviewer Elite',
      description: 'High XP reviewer badge',
      xp_reward: 200,
      subject_type: 'user',
    });
    const lowXpBadge = await repository.createBadge({
      title: 'Reviewer Starter',
      description: 'Low XP reviewer badge',
      xp_reward: 50,
      subject_type: 'user',
    });
    const unmatchedBadge = await repository.createBadge({
      title: 'Mentor Path',
      description: 'Should not match search',
      xp_reward: 100,
      subject_type: 'user',
    });

    await repository.insertBadgeCriteria(highXpBadge.id, [
      { quest_id: quest.id, target_count: 2 },
    ]);
    await repository.insertBadgeCriteria(lowXpBadge.id, [
      { quest_id: quest.id, target_count: 3 },
    ]);
    await repository.insertBadgeCriteria(unmatchedBadge.id, [
      { quest_id: quest.id, target_count: 4 },
    ]);

    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: quest.id,
      completion_count: 1,
    });

    await knex('badges')
      .where({ id: highXpBadge.id })
      .update({
        created_at: new Date('2026-01-03T00:00:00Z'),
        updated_at: new Date('2026-01-03T00:00:00Z'),
      });
    await knex('badges')
      .where({ id: lowXpBadge.id })
      .update({
        created_at: new Date('2026-01-02T00:00:00Z'),
        updated_at: new Date('2026-01-02T00:00:00Z'),
      });
    await knex('badges')
      .where({ id: unmatchedBadge.id })
      .update({
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      });

    const badgeProgress = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        searchTitle: 'reviewer',
        sortBy: 'xp_reward',
        order: 'asc',
        page: 1,
        limit: 10,
      },
    );

    expect(badgeProgress.data.map(badge => badge.title)).toEqual([
      'Reviewer Starter',
      'Reviewer Elite',
    ]);
    expect(badgeProgress.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });

    const titleAsc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'title',
        order: 'asc',
        page: 1,
        limit: 10,
      },
    );
    const titleDesc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'title',
        order: 'desc',
        page: 1,
        limit: 10,
      },
    );
    const createdAsc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'created_at',
        order: 'asc',
        page: 1,
        limit: 10,
      },
    );
    const createdDesc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'created_at',
        order: 'desc',
        page: 1,
        limit: 10,
      },
    );
    const progressAsc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'asc',
        page: 1,
        limit: 10,
      },
    );
    const progressDesc = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'desc',
        page: 1,
        limit: 10,
      },
    );

    expect(titleAsc.data.map(badge => badge.title)).toEqual([
      'Mentor Path',
      'Reviewer Elite',
      'Reviewer Starter',
    ]);
    expect(titleDesc.data.map(badge => badge.title)).toEqual([
      'Reviewer Starter',
      'Reviewer Elite',
      'Mentor Path',
    ]);
    expect(createdAsc.data.map(badge => badge.title)).toEqual([
      'Mentor Path',
      'Reviewer Starter',
      'Reviewer Elite',
    ]);
    expect(createdDesc.data.map(badge => badge.title)).toEqual([
      'Reviewer Elite',
      'Reviewer Starter',
      'Mentor Path',
    ]);
    expect(progressAsc.data.map(badge => badge.title)).toEqual([
      'Mentor Path',
      'Reviewer Starter',
      'Reviewer Elite',
    ]);
    expect(progressDesc.data.map(badge => badge.title)).toEqual([
      'Reviewer Elite',
      'Reviewer Starter',
      'Mentor Path',
    ]);

    await knex.destroy();
  });

  it('sorts earned badge progress consistently in both directions', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const earnedQuest = await createQuest(knex, 'Quest Earned Sort', 'user');
    const inProgressQuest = await createQuest(
      knex,
      'Quest In Progress Sort',
      'user',
    );

    const earnedBadge = await repository.createBadge({
      title: 'Earned Badge Sort',
      description: 'Already earned',
      xp_reward: 100,
      subject_type: 'user',
    });
    const inProgressBadge = await repository.createBadge({
      title: 'In Progress Badge Sort',
      description: 'Not earned yet',
      xp_reward: 100,
      subject_type: 'user',
    });

    await repository.insertBadgeCriteria(earnedBadge.id, [
      { quest_id: earnedQuest.id, target_count: 1 },
    ]);
    await repository.insertBadgeCriteria(inProgressBadge.id, [
      { quest_id: inProgressQuest.id, target_count: 2 },
    ]);

    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: earnedQuest.id,
      completion_count: 1,
    });
    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: inProgressQuest.id,
      completion_count: 1,
    });

    const ascending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'earned_at',
        order: 'asc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );
    const descending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'earned_at',
        order: 'desc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );

    expect(ascending.data.map(badge => badge.title)).toEqual([
      'In Progress Badge Sort',
      'Earned Badge Sort',
    ]);
    expect(descending.data.map(badge => badge.title)).toEqual([
      'Earned Badge Sort',
      'In Progress Badge Sort',
    ]);

    await knex.destroy();
  });

  it('sorts badge progress by completed criteria before partial criteria progress', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const earnedQuest = await createQuest(
      knex,
      'Quest Progress Earned',
      'user',
    );
    const mixedQuestA = await createQuest(
      knex,
      'Quest Progress Mixed A',
      'user',
    );
    const mixedQuestB = await createQuest(
      knex,
      'Quest Progress Mixed B',
      'user',
    );
    const partialQuestA = await createQuest(
      knex,
      'Quest Progress Partial A',
      'user',
    );
    const partialQuestB = await createQuest(
      knex,
      'Quest Progress Partial B',
      'user',
    );

    const earnedBadge = await repository.createBadge({
      title: 'Badge Earned First',
      description: 'Should sort first when earned',
      xp_reward: 10,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(earnedBadge.id, [
      { quest_id: earnedQuest.id, target_count: 1 },
    ]);

    const mixedBadge = await repository.createBadge({
      title: 'Badge Mixed Second',
      description: 'One completed criterion and one partial criterion',
      xp_reward: 20,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(mixedBadge.id, [
      { quest_id: mixedQuestA.id, target_count: 1 },
      { quest_id: mixedQuestB.id, target_count: 2 },
    ]);

    const partialBadge = await repository.createBadge({
      title: 'Badge Partial Third',
      description: 'No completed criteria but some raw progress',
      xp_reward: 30,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(partialBadge.id, [
      { quest_id: partialQuestA.id, target_count: 3 },
      { quest_id: partialQuestB.id, target_count: 5 },
    ]);

    await knex('quest_progress').insert([
      {
        subject_ref: 'user:default/alice',
        quest_id: earnedQuest.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: mixedQuestA.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: mixedQuestB.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: partialQuestA.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: partialQuestB.id,
        completion_count: 1,
      },
    ]);

    const descending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'desc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );
    const ascending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'asc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );

    expect(
      descending.data.map(badge => ({
        title: badge.title,
        progress: badge.progress_percent,
        completedRequirements: badge.completed_requirements,
      })),
    ).toEqual([
      {
        title: 'Badge Earned First',
        progress: 100,
        completedRequirements: 1,
      },
      {
        title: 'Badge Mixed Second',
        progress: 50,
        completedRequirements: 1,
      },
      {
        title: 'Badge Partial Third',
        progress: 0,
        completedRequirements: 0,
      },
    ]);
    expect(ascending.data.map(badge => badge.title)).toEqual([
      'Badge Partial Third',
      'Badge Mixed Second',
      'Badge Earned First',
    ]);

    await knex.destroy();
  });

  it('sorts badge progress by completed criteria count and then average criteria progress', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const sharedQuestA = await createQuest(
      knex,
      'Quest Shared Release A',
      'user',
    );
    const sharedQuestB = await createQuest(
      knex,
      'Quest Shared Release B',
      'user',
    );
    const maintenanceQuestA = await createQuest(
      knex,
      'Quest Maintenance A',
      'user',
    );
    const maintenanceQuestB = await createQuest(
      knex,
      'Quest Maintenance B',
      'user',
    );
    const contributorQuestA = await createQuest(
      knex,
      'Quest Contributor A',
      'user',
    );
    const contributorQuestB = await createQuest(
      knex,
      'Quest Contributor B',
      'user',
    );
    const contributorQuestC = await createQuest(
      knex,
      'Quest Contributor C',
      'user',
    );
    const reviewChampionQuest = await createQuest(
      knex,
      'Quest Review Champion',
      'user',
    );

    const sharedBadge = await repository.createBadge({
      title: 'Shared Release Readiness',
      description: 'Two partially progressed criteria',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(sharedBadge.id, [
      { quest_id: sharedQuestA.id, target_count: 3 },
      { quest_id: sharedQuestB.id, target_count: 5 },
    ]);

    const maintenanceBadge = await repository.createBadge({
      title: 'Maintenance Crew',
      description: 'Higher average partial progress',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(maintenanceBadge.id, [
      { quest_id: maintenanceQuestA.id, target_count: 2 },
      { quest_id: maintenanceQuestB.id, target_count: 2 },
    ]);

    const contributorBadge = await repository.createBadge({
      title: 'All-round Contributor',
      description: 'One fully completed criterion',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(contributorBadge.id, [
      { quest_id: contributorQuestA.id, target_count: 2 },
      { quest_id: contributorQuestB.id, target_count: 1 },
      { quest_id: contributorQuestC.id, target_count: 3 },
    ]);

    const reviewBadge = await repository.createBadge({
      title: 'Review Champion',
      description: 'No progress',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(reviewBadge.id, [
      { quest_id: reviewChampionQuest.id, target_count: 3 },
    ]);

    await knex('quest_progress').insert([
      {
        subject_ref: 'user:default/alice',
        quest_id: sharedQuestA.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: sharedQuestB.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: maintenanceQuestA.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: maintenanceQuestB.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: contributorQuestA.id,
        completion_count: 0,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: contributorQuestB.id,
        completion_count: 1,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: contributorQuestC.id,
        completion_count: 0,
      },
    ]);

    const descending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'desc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );

    expect(
      descending.data.map(badge => ({
        title: badge.title,
        completedRequirements: badge.completed_requirements,
        criteriaProgress: badge.criteria_progress_percent,
        ratio: badge.progress_percent,
      })),
    ).toEqual([
      {
        title: 'All-round Contributor',
        completedRequirements: 1,
        criteriaProgress: 33,
        ratio: 33,
      },
      {
        title: 'Maintenance Crew',
        completedRequirements: 0,
        criteriaProgress: 50,
        ratio: 0,
      },
      {
        title: 'Shared Release Readiness',
        completedRequirements: 0,
        criteriaProgress: 27,
        ratio: 0,
      },
      {
        title: 'Review Champion',
        completedRequirements: 0,
        criteriaProgress: 0,
        ratio: 0,
      },
    ]);

    await knex.destroy();
  });

  it('sorts badge progress using completed quest milestones instead of raw quest increments', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const largeQuest = await createQuest(
      knex,
      'Quest Large Milestone',
      'user',
      5,
    );
    const smallQuest = await createQuest(knex, 'Quest Small Milestone', 'user');

    const rawIncrementBadge = await repository.createBadge({
      title: 'Raw Increment Badge',
      description: 'Has raw quest progress but no completed quest milestones',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(rawIncrementBadge.id, [
      { quest_id: largeQuest.id, target_count: 1 },
    ]);

    const milestoneBadge = await repository.createBadge({
      title: 'Milestone Badge',
      description: 'Has one completed quest milestone',
      xp_reward: 5,
      subject_type: 'user',
    });
    await repository.insertBadgeCriteria(milestoneBadge.id, [
      { quest_id: smallQuest.id, target_count: 1 },
    ]);

    await knex('quest_progress').insert([
      {
        subject_ref: 'user:default/alice',
        quest_id: largeQuest.id,
        completion_count: 4,
      },
      {
        subject_ref: 'user:default/alice',
        quest_id: smallQuest.id,
        completion_count: 1,
      },
    ]);

    const descending = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        sortBy: 'progress_percent',
        order: 'desc',
        status: 'all',
        page: 1,
        limit: 10,
      },
    );

    expect(
      descending.data.map(badge => ({
        title: badge.title,
        completedRequirements: badge.completed_requirements,
        criteriaProgress: badge.criteria_progress_percent,
      })),
    ).toEqual([
      {
        title: 'Milestone Badge',
        completedRequirements: 1,
        criteriaProgress: 100,
      },
      {
        title: 'Raw Increment Badge',
        completedRequirements: 0,
        criteriaProgress: 0,
      },
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
      xp_reward: 0,
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
    const listedBadges = await listBadges(repository);
    const storedBadge = await knex('badges').where({ id: badge.id }).first();
    const earnedRows = await knex('earned_badges')
      .where({ badge_id: badge.id })
      .select('*');
    const badgeProgress = await listBadgeProgress(
      repository,
      ['group:default/platform'],
      { status: 'all' },
    );

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

  it('keeps pagination totals when a filtered badge progress page is out of range', async () => {
    const knex = await initDb();
    const repository = new BadgesRepository(knex);
    const quest = await createQuest(knex, 'Earned Filter Quest', 'user');

    const badge = await repository.createBadge({
      title: 'Earned Filter Badge',
      description: 'Used for pagination totals',
      xp_reward: 10,
      subject_type: 'user',
    });

    await repository.insertBadgeCriteria(badge.id, [
      { quest_id: quest.id, target_count: 1 },
    ]);

    await knex('quest_progress').insert({
      subject_ref: 'user:default/alice',
      quest_id: quest.id,
      completion_count: 1,
    });

    const result = await repository.getPaginatedBadgeProgress(
      ['user:default/alice'],
      {
        status: 'earned',
        page: 2,
        limit: 1,
      },
    );

    expect(result).toEqual({
      data: [],
      pagination: {
        page: 2,
        limit: 1,
        total: 1,
        totalPages: 1,
      },
    });

    await knex.destroy();
  });
});
