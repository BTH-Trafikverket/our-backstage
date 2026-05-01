import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('QuestsRepository integration', () => {
  describe('withTransaction', () => {
    it('rolls back quest event receipts when the transaction fails', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await expect(
        repository.withTransaction(async repo => {
          await repo.tryInsertReceipt({
            event_id: 'evt-rollback',
            event_key: 'github.pr_merged',
            subject_ref: 'group:default/platform',
            caller_subject: 'plugin:test-listener',
          });

          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');

      const receipt = await knex('quest_event_receipts')
        .where({ event_id: 'evt-rollback' })
        .first();

      expect(receipt).toBeUndefined();
    });
  });

  describe('quest activity helpers', () => {
    it('lists distinct user subjects with quest activity receipts', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);
      const quest = await repository.createQuest({
        title: 'Reminder Activity Quest',
        description: 'Tracks reminder activity',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });

      await knex('quest_event_receipts').insert([
        {
          event_id: 'evt-user-1',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/alice',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-01T10:00:00.000Z'),
        },
        {
          event_id: 'evt-user-2',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/alice',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-05T10:00:00.000Z'),
        },
        {
          event_id: 'evt-user-3',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/bob',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-06T10:00:00.000Z'),
        },
        {
          event_id: 'evt-team-1',
          event_key: `quest:${quest.id}`,
          subject_ref: 'group:default/platform',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-07T10:00:00.000Z'),
        },
        {
          event_id: 'evt-other-quest',
          event_key: 'quest:00000000-0000-0000-0000-000000000000',
          subject_ref: 'user:default/charlie',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-08T10:00:00.000Z'),
        },
      ]);

      await expect(
        repository.listSubjectsWithQuestActivity(quest.id, 'user'),
      ).resolves.toEqual(['user:default/alice', 'user:default/bob']);
    });

    it('returns the latest quest activity timestamp for a subject', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);
      const quest = await repository.createQuest({
        title: 'Latest Activity Quest',
        description: 'Tracks the latest accepted activity',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });

      await knex('quest_event_receipts').insert([
        {
          event_id: 'evt-latest-1',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/alice',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-01T10:00:00.000Z'),
        },
        {
          event_id: 'evt-latest-2',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/alice',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-15T12:30:00.000Z'),
        },
        {
          event_id: 'evt-latest-3',
          event_key: `quest:${quest.id}`,
          subject_ref: 'user:default/bob',
          caller_subject: 'external:default/github',
          received_at: new Date('2026-03-20T09:00:00.000Z'),
        },
      ]);

      await expect(
        repository.getLatestQuestActivityAt(quest.id, 'user:default/alice'),
      ).resolves.toEqual(new Date('2026-03-15T12:30:00.000Z'));
      await expect(
        repository.getLatestQuestActivityAt(quest.id, 'user:default/charlie'),
      ).resolves.toBeNull();
    });
  });

  describe('createQuest', () => {
    it('should create a quest in the database and return it', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questData = {
        title: 'Complete Integration Test',
        description: 'Write comprehensive integration tests',
        target_count: 5,
        xp_reward: 100,
      };

      const createdQuest = await repository.createQuest(questData);

      expect(createdQuest).toBeDefined();
      expect(createdQuest.title).toBe(questData.title);
      expect(createdQuest.description).toBe(questData.description);
      expect(createdQuest.target_count).toBe(questData.target_count);
      expect(createdQuest.xp_reward).toBe(questData.xp_reward);
      expect(createdQuest.created_at).toBeInstanceOf(Date);
      expect(createdQuest.updated_at).toBeInstanceOf(Date);

      const dbQuest = await knex('quests')
        .where({
          title: questData.title,
          description: questData.description,
          target_count: questData.target_count,
          xp_reward: questData.xp_reward,
        })
        .first();

      expect(dbQuest).toBeDefined();
      expect(dbQuest.title).toBe(questData.title);
    });

    it('should create multiple quests with different data', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest1 = {
        title: 'Daily Quest',
        description: 'Complete daily tasks',
        target_count: 1,
        xp_reward: 10,
      };

      const quest2 = {
        title: 'Weekly Challenge',
        description: 'Complete weekly objectives',
        target_count: 7,
        xp_reward: 500,
      };

      const created1 = await repository.createQuest(quest1);
      const created2 = await repository.createQuest(quest2);

      expect(created1.title).toBe(quest1.title);
      expect(created2.title).toBe(quest2.title);

      const allQuests = await knex('quests').select('*');
      expect(allQuests).toHaveLength(2);
    });

    it('should create global team quests without a quest-level subject_ref column', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest = await repository.createQuest({
        title: 'Team Quest',
        description: 'Shared by every team',
        target_count: 3,
        xp_reward: 50,
        subject_type: 'team',
      });

      expect(quest.subject_type).toBe('team');
      expect(await knex.schema.hasColumn('quests', 'subject_ref')).toBe(false);

      const dbQuest = await knex('quests').where({ id: quest.id }).first();
      expect(dbQuest).toBeDefined();
      expect(dbQuest.subject_type).toBe('team');
      expect(dbQuest).not.toHaveProperty('subject_ref');
    });

    it('should set created_at and updated_at timestamps automatically', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest = await repository.createQuest({
        title: 'Timestamp Test',
        description: 'Testing timestamp generation',
        target_count: 1,
        xp_reward: 50,
      });

      expect(quest.created_at).toBeInstanceOf(Date);
      expect(quest.updated_at).toBeInstanceOf(Date);
      expect(quest.updated_at.getTime()).toBeGreaterThanOrEqual(
        quest.created_at.getTime(),
      );
    });

    it('should allow zero xp_reward', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const zeroRewardQuest = {
        title: 'Zero Reward Quest',
        description: 'This should succeed',
        target_count: 1,
        xp_reward: 0,
      };

      const createdQuest = await repository.createQuest(zeroRewardQuest);

      expect(createdQuest.xp_reward).toBe(0);
    });

    it('should enforce database constraints (nonnegative xp_reward)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const invalidQuest = {
        title: 'Invalid Quest',
        description: 'This should fail',
        target_count: 1,
        xp_reward: -1,
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();
    });

    it('should enforce database constraints (positive target_count)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const invalidQuest = {
        title: 'Invalid Target Count Quest',
        description: 'This should fail',
        target_count: 0,
        xp_reward: 100,
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();
    });
  });

  describe('getQuestById', () => {
    it('should retrieve an existing quest by selecting it from the DB', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questData = {
        title: 'Retrieve Me',
        description: 'This quest should be retrievable',
        target_count: 3,
        xp_reward: 75,
      };

      await repository.createQuest(questData);

      const row = await knex('quests')
        .where({
          title: questData.title,
          description: questData.description,
          target_count: questData.target_count,
          xp_reward: questData.xp_reward,
        })
        .first();

      expect(row).toBeDefined();

      const retrievedQuest = await repository.getQuestById(row.id);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.title).toBe(questData.title);
      expect(retrievedQuest!.description).toBe(questData.description);
      expect(retrievedQuest!.target_count).toBe(questData.target_count);
      expect(retrievedQuest!.xp_reward).toBe(questData.xp_reward);
    });

    it('should return undefined for non-existent quest id', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const retrievedQuest = await repository.getQuestById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(retrievedQuest).toBeUndefined();
    });

    it('should retrieve the correct quest when multiple exist', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Quest 1',
        description: 'First quest',
        target_count: 1,
        xp_reward: 10,
      });

      await repository.createQuest({
        title: 'Quest 2',
        description: 'Second quest',
        target_count: 2,
        xp_reward: 20,
      });

      await repository.createQuest({
        title: 'Quest 3',
        description: 'Third quest',
        target_count: 3,
        xp_reward: 30,
      });

      const quest2Row = await knex('quests')
        .where({ title: 'Quest 2' })
        .first();
      expect(quest2Row).toBeDefined();

      const retrievedQuest = await repository.getQuestById(quest2Row.id);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.title).toBe('Quest 2');
      expect(retrievedQuest!.xp_reward).toBe(20);
    });

    it('should return quest with all timestamp fields populated', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Timestamp Check',
        description: 'Checking timestamps on retrieval',
        target_count: 1,
        xp_reward: 25,
      });

      const row = await knex('quests')
        .where({ title: 'Timestamp Check' })
        .orderBy('created_at', 'desc')
        .first();

      expect(row).toBeDefined();

      const retrievedQuest = await repository.getQuestById(row.id);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.created_at).toBeInstanceOf(Date);
      expect(retrievedQuest!.updated_at).toBeInstanceOf(Date);
      expect(retrievedQuest!.created_at.getTime()).toBeLessThanOrEqual(
        retrievedQuest!.updated_at.getTime(),
      );
    });
  });

  describe('getQuests', () => {
    it('filters, sorts, and paginates quest definitions in SQL', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Alpha Team Quest',
        description: 'Team alpha',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
      });
      await repository.createQuest({
        title: 'Bravo User Quest',
        description: 'User bravo',
        target_count: 1,
        xp_reward: 70,
        subject_type: 'user',
      });
      await repository.createQuest({
        title: 'Charlie Team Quest',
        description: 'Team charlie',
        target_count: 1,
        xp_reward: 40,
        subject_type: 'team',
      });

      const pageOne = await repository.getQuests({
        searchTitle: 'Quest',
        audience: 'team',
        sortBy: 'xp_reward',
        order: 'desc',
        page: 1,
        limit: 1,
      });
      const pageTwo = await repository.getQuests({
        searchTitle: 'Quest',
        audience: 'team',
        sortBy: 'xp_reward',
        order: 'desc',
        page: 2,
        limit: 1,
      });

      expect(pageOne.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(pageOne.data.map(quest => quest.title)).toEqual([
        'Charlie Team Quest',
      ]);

      expect(pageTwo.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(pageTwo.data.map(quest => quest.title)).toEqual([
        'Alpha Team Quest',
      ]);
    });

    it('filters individual quests and preserves pagination totals for out-of-range pages', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Alpha User Quest',
        description: 'User quest',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });
      await repository.createQuest({
        title: 'Bravo User Quest',
        description: 'User quest',
        target_count: 1,
        xp_reward: 20,
        subject_type: 'user',
      });
      await repository.createQuest({
        title: 'Team Only Quest',
        description: 'Team quest',
        target_count: 1,
        xp_reward: 30,
        subject_type: 'team',
      });

      const result = await repository.getQuests({
        audience: 'individual',
        sortBy: 'title',
        order: 'asc',
        page: 3,
        limit: 1,
      });

      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({
        page: 3,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('respects order for every exposed quest sort field', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const alpha = await repository.createQuest({
        title: 'Alpha Quest',
        description: 'Alpha',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'user',
      });
      const bravo = await repository.createQuest({
        title: 'Bravo Quest',
        description: 'Bravo',
        target_count: 1,
        xp_reward: 50,
        subject_type: 'user',
      });
      const charlie = await repository.createQuest({
        title: 'Charlie Quest',
        description: 'Charlie',
        target_count: 1,
        xp_reward: 200,
        subject_type: 'user',
      });

      await knex('quests')
        .where({ id: alpha.id })
        .update({
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        });
      await knex('quests')
        .where({ id: bravo.id })
        .update({
          created_at: new Date('2026-01-02T00:00:00Z'),
          updated_at: new Date('2026-01-02T00:00:00Z'),
        });
      await knex('quests')
        .where({ id: charlie.id })
        .update({
          created_at: new Date('2026-01-03T00:00:00Z'),
          updated_at: new Date('2026-01-03T00:00:00Z'),
        });

      const titleAsc = await repository.getQuests({
        sortBy: 'title',
        order: 'asc',
      });
      const titleDesc = await repository.getQuests({
        sortBy: 'title',
        order: 'desc',
      });
      const xpAsc = await repository.getQuests({
        sortBy: 'xp_reward',
        order: 'asc',
      });
      const xpDesc = await repository.getQuests({
        sortBy: 'xp_reward',
        order: 'desc',
      });
      const createdAsc = await repository.getQuests({
        sortBy: 'created_at',
        order: 'asc',
      });
      const createdDesc = await repository.getQuests({
        sortBy: 'created_at',
        order: 'desc',
      });

      expect(titleAsc.data.map(quest => quest.title)).toEqual([
        'Alpha Quest',
        'Bravo Quest',
        'Charlie Quest',
      ]);
      expect(titleDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Quest',
        'Bravo Quest',
        'Alpha Quest',
      ]);
      expect(xpAsc.data.map(quest => quest.title)).toEqual([
        'Bravo Quest',
        'Alpha Quest',
        'Charlie Quest',
      ]);
      expect(xpDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Quest',
        'Alpha Quest',
        'Bravo Quest',
      ]);
      expect(createdAsc.data.map(quest => quest.title)).toEqual([
        'Alpha Quest',
        'Bravo Quest',
        'Charlie Quest',
      ]);
      expect(createdDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Quest',
        'Bravo Quest',
        'Alpha Quest',
      ]);
    });
  });

  describe('getQuestsWithProgress', () => {
    it('returns user quests plus one team quest row per owned team', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const userQuest = await repository.createQuest({
        title: 'Personal Quest',
        description: 'For the user',
        target_count: 2,
        xp_reward: 20,
        subject_type: 'user',
      });

      const teamQuest = await repository.createQuest({
        title: 'Team Quest',
        description: 'For every team',
        target_count: 3,
        xp_reward: 30,
        subject_type: 'team',
      });

      await repository.incrementQuestProgress({
        quest_id: userQuest.id,
        subject_ref: 'user:default/alice',
        by: 1,
      });

      await repository.incrementQuestProgress({
        quest_id: teamQuest.id,
        subject_ref: 'group:default/platform',
        by: 2,
      });

      const result = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: [
          'user:default/alice',
          'group:default/platform',
          'group:default/engineering',
        ],
      });

      const quests = result.data;
      expect(quests).toHaveLength(3);

      const personalQuest = quests.find(
        quest =>
          quest.id === userQuest.id &&
          quest.subject_ref === 'user:default/alice',
      );
      expect(personalQuest).toBeDefined();
      expect(personalQuest!.completion_count).toBe(1);
      expect(personalQuest!.progress_toward_target).toBe(1);

      const platformTeamQuest = quests.find(
        quest =>
          quest.id === teamQuest.id &&
          quest.subject_ref === 'group:default/platform',
      );
      expect(platformTeamQuest).toBeDefined();
      expect(platformTeamQuest!.completion_count).toBe(2);
      expect(platformTeamQuest!.progress_toward_target).toBe(2);

      const engineeringTeamQuest = quests.find(
        quest =>
          quest.id === teamQuest.id &&
          quest.subject_ref === 'group:default/engineering',
      );
      expect(engineeringTeamQuest).toBeDefined();
      expect(engineeringTeamQuest!.completion_count).toBe(0);
      expect(engineeringTeamQuest!.progress_toward_target).toBe(0);
    });

    it('does not return team quests when the user is not in any teams', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Personal Quest',
        description: 'For the user',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });

      await repository.createQuest({
        title: 'Team Quest',
        description: 'For teams only',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
      });

      const result = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: ['user:default/alice'],
      });

      const quests = result.data;
      expect(quests).toHaveLength(1);
      expect(quests[0].subject_type).toBe('user');
      expect(quests[0].subject_ref).toBe('user:default/alice');
    });

    it('returns empty pagination when only team quests are requested without owned teams', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Team Quest',
        description: 'For teams only',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
      });

      const result = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: ['user:default/alice'],
        audience: 'team',
      });

      expect(result).toEqual({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it('filters completed team quests by team ref case-insensitively', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const teamQuest = await repository.createQuest({
        title: 'Platform Completed Quest',
        description: 'Completed by one team',
        target_count: 2,
        xp_reward: 30,
        subject_type: 'team',
        completion_policy: 'ONE_TIME',
      });

      await repository.incrementQuestProgress({
        quest_id: teamQuest.id,
        subject_ref: 'group:default/platform',
        by: 2,
      });

      const result = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: [
          'user:default/alice',
          'group:default/platform',
          'group:default/engineering',
        ],
        audience: 'team',
        status: 'completed',
        team_ref: 'GROUP:DEFAULT/PLATFORM',
      });

      expect(result.pagination.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].subject_ref).toBe('group:default/platform');
      expect(result.data[0].completion_count).toBe(2);
    });

    it('keeps pagination totals when a progress query page is out of range', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Only Quest',
        description: 'Single visible quest',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });

      const result = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: ['user:default/alice'],
        page: 2,
        limit: 1,
      });

      expect(result).toEqual({
        data: [],
        pagination: {
          page: 2,
          limit: 1,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('respects order for every exposed progress sort field', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const alpha = await repository.createQuest({
        title: 'Alpha Progress Quest',
        description: 'Alpha',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'user',
      });
      const bravo = await repository.createQuest({
        title: 'Bravo Progress Quest',
        description: 'Bravo',
        target_count: 1,
        xp_reward: 50,
        subject_type: 'user',
      });
      const charlie = await repository.createQuest({
        title: 'Charlie Progress Quest',
        description: 'Charlie',
        target_count: 1,
        xp_reward: 200,
        subject_type: 'user',
      });

      await knex('quests')
        .where({ id: alpha.id })
        .update({
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        });
      await knex('quests')
        .where({ id: bravo.id })
        .update({
          created_at: new Date('2026-01-02T00:00:00Z'),
          updated_at: new Date('2026-01-02T00:00:00Z'),
        });
      await knex('quests')
        .where({ id: charlie.id })
        .update({
          created_at: new Date('2026-01-03T00:00:00Z'),
          updated_at: new Date('2026-01-03T00:00:00Z'),
        });

      const baseParams = {
        user_ref: 'user:default/alice',
        ownership_refs: ['user:default/alice'],
      };

      const titleAsc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'title',
        order: 'asc',
      });
      const titleDesc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'title',
        order: 'desc',
      });
      const xpAsc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'xp_reward',
        order: 'asc',
      });
      const xpDesc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'xp_reward',
        order: 'desc',
      });
      const createdAsc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'created_at',
        order: 'asc',
      });
      const createdDesc = await repository.getQuestsWithProgress({
        ...baseParams,
        sortBy: 'created_at',
        order: 'desc',
      });

      expect(titleAsc.data.map(quest => quest.title)).toEqual([
        'Alpha Progress Quest',
        'Bravo Progress Quest',
        'Charlie Progress Quest',
      ]);
      expect(titleDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Progress Quest',
        'Bravo Progress Quest',
        'Alpha Progress Quest',
      ]);
      expect(xpAsc.data.map(quest => quest.title)).toEqual([
        'Bravo Progress Quest',
        'Alpha Progress Quest',
        'Charlie Progress Quest',
      ]);
      expect(xpDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Progress Quest',
        'Alpha Progress Quest',
        'Bravo Progress Quest',
      ]);
      expect(createdAsc.data.map(quest => quest.title)).toEqual([
        'Alpha Progress Quest',
        'Bravo Progress Quest',
        'Charlie Progress Quest',
      ]);
      expect(createdDesc.data.map(quest => quest.title)).toEqual([
        'Charlie Progress Quest',
        'Bravo Progress Quest',
        'Alpha Progress Quest',
      ]);
    });
  });

  describe('CRUD operations with real database interactions', () => {
    it('should perform a complete create-read cycle', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Full CRUD Test',
        description: 'Testing complete CRUD operations',
        target_count: 10,
        xp_reward: 1000,
      });

      const row = await knex('quests')
        .where({ title: 'Full CRUD Test' })
        .first();
      expect(row).toBeDefined();

      const readQuest = await repository.getQuestById(row.id);
      expect(readQuest).toBeDefined();
      expect(readQuest!.title).toBe('Full CRUD Test');

      const directDbRead = await knex('quests').where({ id: row.id }).first();
      expect(directDbRead).toBeDefined();
      expect(directDbRead.title).toBe('Full CRUD Test');
    });

    it('should handle concurrent quest creation', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questPromises = Array.from({ length: 5 }, (_, i) =>
        repository.createQuest({
          title: `Concurrent Quest ${i + 1}`,
          description: `Quest created concurrently ${i + 1}`,
          target_count: i + 1,
          xp_reward: (i + 1) * 10,
        }),
      );

      const createdQuests = await Promise.all(questPromises);

      expect(createdQuests).toHaveLength(5);

      const allQuests = await knex('quests').select('*');
      expect(allQuests).toHaveLength(5);
    });

    it('should maintain data integrity after database operations', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Original Title',
        description: 'Original description',
        target_count: 5,
        xp_reward: 50,
      });

      const row = await knex('quests')
        .where({ title: 'Original Title' })
        .first();
      expect(row).toBeDefined();

      await knex('quests')
        .where({ id: row.id })
        .update({ title: 'Modified Title' });

      const quest = await repository.getQuestById(row.id);
      expect(quest).toBeDefined();
      expect(quest!.title).toBe('Modified Title');
      expect(quest!.description).toBe('Original description');
    });

    it('should handle deletion correctly (via raw knex)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'To Be Deleted',
        description: 'This quest will be deleted',
        target_count: 1,
        xp_reward: 10,
      });

      const row = await knex('quests')
        .where({ title: 'To Be Deleted' })
        .first();
      expect(row).toBeDefined();

      let quest = await repository.getQuestById(row.id);
      expect(quest).toBeDefined();

      await knex('quests').where({ id: row.id }).del();

      quest = await repository.getQuestById(row.id);
      expect(quest).toBeUndefined();
    });

    it('edits and deletes quests through repository methods', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const created = await repository.createQuest({
        title: 'Repository Edit Quest',
        description: 'Before edit',
        target_count: 1,
        xp_reward: 10,
      });

      const updated = await repository.editQuest(created.id, {
        title: 'Repository Edit Quest Updated',
        description: 'After edit',
        target_count: 3,
        xp_reward: 25,
        subject_type: 'team',
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
      });
      const deleted = await repository.deleteQuest(created.id);
      const missing = await repository.deleteQuest(created.id);
      const archivedRow = await knex('quests')
        .where({ id: created.id })
        .first();
      const hiddenQuest = await repository.getQuestById(created.id);

      expect(updated).toEqual(
        expect.objectContaining({
          id: created.id,
          title: 'Repository Edit Quest Updated',
          description: 'After edit',
          target_count: 3,
          xp_reward: 25,
          subject_type: 'team',
          completion_policy: 'ONE_TIME',
          cooldown_days: null,
        }),
      );
      expect(deleted).toBe(true);
      expect(missing).toBe(false);
      expect(archivedRow.archived_at).toBeTruthy();
      expect(hiddenQuest).toBeUndefined();
    });

    it('includes archived quests in admin reads but excludes them from user reads', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const activeQuest = await repository.createQuest({
        title: 'Active Quest',
        description: 'Visible quest',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });
      const archivedQuest = await repository.createQuest({
        title: 'Archived Quest',
        description: 'Hidden quest',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
      });

      await repository.deleteQuest(archivedQuest.id);
      await repository.incrementQuestProgress({
        subject_ref: 'user:default/alice',
        quest_id: activeQuest.id,
        by: 1,
      });
      await knex('quest_progress').insert({
        subject_ref: 'user:default/alice',
        quest_id: archivedQuest.id,
        completion_count: 1,
      });

      const adminResult = await repository.getQuests({
        includeArchived: true,
      });
      const progressResult = await repository.getQuestsWithProgress({
        user_ref: 'user:default/alice',
        ownership_refs: ['user:default/alice'],
      });

      expect(adminResult.data.map(quest => quest.title).sort()).toEqual([
        'Active Quest',
        'Archived Quest',
      ]);
      expect(
        adminResult.data.find(quest => quest.title === 'Archived Quest')
          ?.archived_at,
      ).toBeTruthy();
      expect(progressResult.data.map(quest => quest.title)).toEqual([
        'Active Quest',
      ]);
    });

    it('lists badge usage for quests referenced by badge criteria', async () => {
      const knex = await initDb();
      const questsRepository = new QuestsRepository(knex);
      const badgesRepository = new BadgesRepository(knex);

      const quest = await questsRepository.createQuest({
        title: 'Quest Used By Badge',
        description: 'Referenced by a badge',
        target_count: 1,
        xp_reward: 10,
      });
      const badge = await badgesRepository.createBadge({
        title: 'Quest Dependency Badge',
        description: 'Depends on the quest',
        xp_reward: 25,
        subject_type: 'user',
      });

      await badgesRepository.insertBadgeCriteria(badge.id, [
        { quest_id: quest.id, target_count: 1 },
      ]);

      await expect(
        questsRepository.getBadgeCriteriaUsage(quest.id),
      ).resolves.toEqual([
        { badge_id: badge.id, badge_title: 'Quest Dependency Badge' },
      ]);

      await badgesRepository.deleteBadge(badge.id);
      await expect(
        questsRepository.getBadgeCriteriaUsage(quest.id),
      ).resolves.toEqual([]);
    });

    it('de-duplicates exact replay of the same logical quest completion', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);
      const firstInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'pull_request.merged',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      });
      const duplicateInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'pull_request.merged',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      });

      expect(firstInsert).toBe(true);
      expect(duplicateInsert).toBe(false);
    });

    it('allows the same event id to be applied to two different quests for the same subject', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const firstInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'quest:quest-a',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      });
      const secondInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'quest:quest-b',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      });

      expect(firstInsert).toBe(true);
      expect(secondInsert).toBe(true);
    });

    it('allows the same event id to be applied to the same quest for two subjects', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const firstInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'quest:quest-a',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      });
      const secondInsert = await repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'quest:quest-a',
        subject_ref: 'user:default/bob',
        caller_subject: 'external:test-service',
      });

      expect(firstInsert).toBe(true);
      expect(secondInsert).toBe(true);
    });
  });
});
