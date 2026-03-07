import path from 'node:path';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { QuestsRepository } from '../repositories/questsRepository';

jest.setTimeout(60000);

describe('QuestsRepository Integration Tests', () => {
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

  const migrationsDir = path.resolve(__dirname, '../../migrations');

  async function initDb(): Promise<Knex> {
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

  describe('createQuest', () => {
    it('should create a quest in the database and return it', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questData = {
        title: 'Complete Integration Test',
        description: 'Write comprehensive integration tests',
        interval: 5,
        xp_reward: 100,
      };

      const createdQuest = await repository.createQuest(questData);

      expect(createdQuest).toBeDefined();
      expect(createdQuest.title).toBe(questData.title);
      expect(createdQuest.description).toBe(questData.description);
      expect(createdQuest.interval).toBe(questData.interval);
      expect(createdQuest.xp_reward).toBe(questData.xp_reward);
      expect(createdQuest.created_at).toBeInstanceOf(Date);
      expect(createdQuest.updated_at).toBeInstanceOf(Date);

      const dbQuest = await knex('quests')
        .where({
          title: questData.title,
          description: questData.description,
          interval: questData.interval,
          xp_reward: questData.xp_reward,
        })
        .first();

      expect(dbQuest).toBeDefined();
      expect(dbQuest.title).toBe(questData.title);

      await knex.destroy();
    });

    it('should create multiple quests with different data', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest1 = {
        title: 'Daily Quest',
        description: 'Complete daily tasks',
        interval: 1,
        xp_reward: 10,
      };

      const quest2 = {
        title: 'Weekly Challenge',
        description: 'Complete weekly objectives',
        interval: 7,
        xp_reward: 500,
      };

      const created1 = await repository.createQuest(quest1);
      const created2 = await repository.createQuest(quest2);

      expect(created1.title).toBe(quest1.title);
      expect(created2.title).toBe(quest2.title);

      const allQuests = await knex('quests').select('*');
      expect(allQuests).toHaveLength(2);

      await knex.destroy();
    });

    it('should set created_at and updated_at timestamps automatically', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const beforeCreation = new Date();
      await new Promise(resolve => setTimeout(resolve, 10));

      const quest = await repository.createQuest({
        title: 'Timestamp Test',
        description: 'Testing timestamp generation',
        interval: 1,
        xp_reward: 50,
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      const afterCreation = new Date();

      expect(quest.created_at.getTime()).toBeGreaterThan(
        beforeCreation.getTime(),
      );
      expect(quest.created_at.getTime()).toBeLessThan(afterCreation.getTime());
      expect(quest.updated_at.getTime()).toBeGreaterThan(
        beforeCreation.getTime(),
      );
      expect(quest.updated_at.getTime()).toBeLessThan(afterCreation.getTime());

      await knex.destroy();
    });

    it('should enforce database constraints (positive xp_reward)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const invalidQuest = {
        title: 'Invalid Quest',
        description: 'This should fail',
        interval: 1,
        xp_reward: 0,
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();

      await knex.destroy();
    });

    it('should enforce database constraints (positive interval)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const invalidQuest = {
        title: 'Invalid Interval Quest',
        description: 'This should fail',
        interval: 0,
        xp_reward: 100,
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();

      await knex.destroy();
    });
  });

  describe('getQuestById', () => {
    it('should retrieve an existing quest by selecting it from the DB', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questData = {
        title: 'Retrieve Me',
        description: 'This quest should be retrievable',
        interval: 3,
        xp_reward: 75,
      };

      await repository.createQuest(questData);

      const row = await knex('quests')
        .where({
          title: questData.title,
          description: questData.description,
          interval: questData.interval,
          xp_reward: questData.xp_reward,
        })
        .first();

      expect(row).toBeDefined();

      const retrievedQuest = await repository.getQuestById(row.id);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.title).toBe(questData.title);
      expect(retrievedQuest!.description).toBe(questData.description);
      expect(retrievedQuest!.interval).toBe(questData.interval);
      expect(retrievedQuest!.xp_reward).toBe(questData.xp_reward);

      await knex.destroy();
    });

    it('should return undefined for non-existent quest id', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const retrievedQuest = await repository.getQuestById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(retrievedQuest).toBeUndefined();

      await knex.destroy();
    });

    it('should retrieve the correct quest when multiple exist', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Quest 1',
        description: 'First quest',
        interval: 1,
        xp_reward: 10,
      });

      await repository.createQuest({
        title: 'Quest 2',
        description: 'Second quest',
        interval: 2,
        xp_reward: 20,
      });

      await repository.createQuest({
        title: 'Quest 3',
        description: 'Third quest',
        interval: 3,
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

      await knex.destroy();
    });

    it('should return quest with all timestamp fields populated', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Timestamp Check',
        description: 'Checking timestamps on retrieval',
        interval: 1,
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

      await knex.destroy();
    });
  });

  describe('CRUD operations with real database interactions', () => {
    it('should perform a complete create-read cycle', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Full CRUD Test',
        description: 'Testing complete CRUD operations',
        interval: 10,
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

      await knex.destroy();
    });

    it('should handle concurrent quest creation', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questPromises = Array.from({ length: 5 }, (_, i) =>
        repository.createQuest({
          title: `Concurrent Quest ${i + 1}`,
          description: `Quest created concurrently ${i + 1}`,
          interval: i + 1,
          xp_reward: (i + 1) * 10,
        }),
      );

      const createdQuests = await Promise.all(questPromises);

      expect(createdQuests).toHaveLength(5);

      const allQuests = await knex('quests').select('*');
      expect(allQuests).toHaveLength(5);

      await knex.destroy();
    });

    it('should maintain data integrity after database operations', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'Original Title',
        description: 'Original description',
        interval: 5,
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

      await knex.destroy();
    });

    it('should handle deletion correctly (via raw knex)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      await repository.createQuest({
        title: 'To Be Deleted',
        description: 'This quest will be deleted',
        interval: 1,
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

      await knex.destroy();
    });
  });
});
