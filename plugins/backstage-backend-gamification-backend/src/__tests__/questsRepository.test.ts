import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { QuestsRepository } from '../repositories/questsRepository';

jest.setTimeout(60000);

describe('QuestsRepository Integration Tests', () => {
  // Auto-derive the TestDatabases Postgres connection string from your existing DB_* env vars.
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

  if (!databases.supports('POSTGRES_18')) {
    it('skipped: set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD to run Postgres integration tests', () => {
      // noop
    });
    return;
  }

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

      const questId = randomUUID();
      const questData = {
        id: questId,
        title: 'Complete Integration Test',
        description: 'Write comprehensive integration tests',
        interval: 5,
        xp_reward: 100,
      };

      const createdQuest = await repository.createQuest(questData);

      expect(createdQuest).toBeDefined();
      expect(createdQuest.id).toBe(questId);
      expect(createdQuest.title).toBe(questData.title);
      expect(createdQuest.description).toBe(questData.description);
      expect(createdQuest.interval).toBe(questData.interval);
      expect(createdQuest.xp_reward).toBe(questData.xp_reward);
      expect(createdQuest.created_at).toBeInstanceOf(Date);
      expect(createdQuest.updated_at).toBeInstanceOf(Date);

      // Verify it's actually in the database
      const dbQuest = await knex('quests').where({ id: questId }).first();
      expect(dbQuest).toBeDefined();
      expect(dbQuest.title).toBe(questData.title);

      await knex.destroy();
    });

    it('should create multiple quests with different data', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest1 = {
        id: randomUUID(),
        title: 'Daily Quest',
        description: 'Complete daily tasks',
        interval: 1,
        xp_reward: 10,
      };

      const quest2 = {
        id: randomUUID(),
        title: 'Weekly Challenge',
        description: 'Complete weekly objectives',
        interval: 7,
        xp_reward: 500,
      };

      const created1 = await repository.createQuest(quest1);
      const created2 = await repository.createQuest(quest2);

      expect(created1.id).toBe(quest1.id);
      expect(created2.id).toBe(quest2.id);

      // Verify both are in the database
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
        id: randomUUID(),
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
        id: randomUUID(),
        title: 'Invalid Quest',
        description: 'This should fail',
        interval: 1,
        xp_reward: 0, // Invalid: must be > 0
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();

      await knex.destroy();
    });

    it('should enforce database constraints (positive interval)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const invalidQuest = {
        id: randomUUID(),
        title: 'Invalid Interval Quest',
        description: 'This should fail',
        interval: 0, // Invalid: must be >= 1
        xp_reward: 100,
      };

      await expect(repository.createQuest(invalidQuest)).rejects.toThrow();

      await knex.destroy();
    });
  });

  describe('getQuestById', () => {
    it('should retrieve an existing quest by id', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questId = randomUUID();
      const questData = {
        id: questId,
        title: 'Retrieve Me',
        description: 'This quest should be retrievable',
        interval: 3,
        xp_reward: 75,
      };

      await repository.createQuest(questData);

      const retrievedQuest = await repository.getQuestById(questId);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.id).toBe(questId);
      expect(retrievedQuest!.title).toBe(questData.title);
      expect(retrievedQuest!.description).toBe(questData.description);
      expect(retrievedQuest!.interval).toBe(questData.interval);
      expect(retrievedQuest!.xp_reward).toBe(questData.xp_reward);

      await knex.destroy();
    });

    it('should return undefined for non-existent quest id', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const nonExistentId = randomUUID();
      const retrievedQuest = await repository.getQuestById(nonExistentId);

      expect(retrievedQuest).toBeUndefined();

      await knex.destroy();
    });

    it('should retrieve the correct quest when multiple exist', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const quest1Id = randomUUID();
      const quest2Id = randomUUID();
      const quest3Id = randomUUID();

      await repository.createQuest({
        id: quest1Id,
        title: 'Quest 1',
        description: 'First quest',
        interval: 1,
        xp_reward: 10,
      });

      await repository.createQuest({
        id: quest2Id,
        title: 'Quest 2',
        description: 'Second quest',
        interval: 2,
        xp_reward: 20,
      });

      await repository.createQuest({
        id: quest3Id,
        title: 'Quest 3',
        description: 'Third quest',
        interval: 3,
        xp_reward: 30,
      });

      const retrievedQuest = await repository.getQuestById(quest2Id);

      expect(retrievedQuest).toBeDefined();
      expect(retrievedQuest!.id).toBe(quest2Id);
      expect(retrievedQuest!.title).toBe('Quest 2');
      expect(retrievedQuest!.xp_reward).toBe(20);

      await knex.destroy();
    });

    it('should return quest with all timestamp fields populated', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questId = randomUUID();
      await repository.createQuest({
        id: questId,
        title: 'Timestamp Check',
        description: 'Checking timestamps on retrieval',
        interval: 1,
        xp_reward: 25,
      });

      const retrievedQuest = await repository.getQuestById(questId);

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

      // CREATE
      const questId = randomUUID();
      const createdQuest = await repository.createQuest({
        id: questId,
        title: 'Full CRUD Test',
        description: 'Testing complete CRUD operations',
        interval: 10,
        xp_reward: 1000,
      });

      expect(createdQuest.id).toBe(questId);

      // READ
      const readQuest = await repository.getQuestById(questId);
      expect(readQuest).toBeDefined();
      expect(readQuest!.title).toBe('Full CRUD Test');

      // Verify data persists across separate queries
      const directDbRead = await knex('quests').where({ id: questId }).first();
      expect(directDbRead).toBeDefined();
      expect(directDbRead.title).toBe('Full CRUD Test');

      await knex.destroy();
    });

    it('should handle concurrent quest creation', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questPromises = Array.from({ length: 5 }, (_, i) =>
        repository.createQuest({
          id: randomUUID(),
          title: `Concurrent Quest ${i + 1}`,
          description: `Quest created concurrently ${i + 1}`,
          interval: i + 1,
          xp_reward: (i + 1) * 10,
        }),
      );

      const createdQuests = await Promise.all(questPromises);

      expect(createdQuests).toHaveLength(5);

      // Verify all are in the database
      const allQuests = await knex('quests').select('*');
      expect(allQuests).toHaveLength(5);

      await knex.destroy();
    });

    it('should maintain data integrity after database operations', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questId = randomUUID();

      // Create via repository
      await repository.createQuest({
        id: questId,
        title: 'Original Title',
        description: 'Original description',
        interval: 5,
        xp_reward: 50,
      });

      // Update directly via knex (simulating external modification)
      await knex('quests')
        .where({ id: questId })
        .update({ title: 'Modified Title' });

      // Read via repository - should reflect the update
      const quest = await repository.getQuestById(questId);
      expect(quest).toBeDefined();
      expect(quest!.title).toBe('Modified Title');
      expect(quest!.description).toBe('Original description');

      await knex.destroy();
    });

    it('should handle deletion correctly (via raw knex)', async () => {
      const knex = await initDb();
      const repository = new QuestsRepository(knex);

      const questId = randomUUID();

      // Create quest
      await repository.createQuest({
        id: questId,
        title: 'To Be Deleted',
        description: 'This quest will be deleted',
        interval: 1,
        xp_reward: 10,
      });

      // Verify it exists
      let quest = await repository.getQuestById(questId);
      expect(quest).toBeDefined();

      // Delete it (simulating a delete operation)
      await knex('quests').where({ id: questId }).del();

      // Verify it's gone
      quest = await repository.getQuestById(questId);
      expect(quest).toBeUndefined();

      await knex.destroy();
    });
  });
});
