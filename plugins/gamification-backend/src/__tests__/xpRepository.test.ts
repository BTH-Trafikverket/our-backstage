import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { XpRepository } from '../repositories/xpRepository';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('XpRepository integration', () => {
  async function createQuest(
    knex: Knex,
    questId: string,
    options: {
      title?: string;
      description?: string;
      target_count?: number;
      xp_reward?: number;
    } = {},
  ): Promise<void> {
    await knex('quests').insert({
      id: questId,
      title: options.title || `Test Quest ${questId.substring(0, 8)}`,
      description: options.description || 'Test description',
      target_count: options.target_count || 1,
      xp_reward: options.xp_reward || 10,
    });
  }

  async function createXpAwardEntry(
    knex: Knex,
    data: {
      userRef: string;
      questId: string;
      xpAmount: number;
      awardedOnCompletionCount?: number;
    },
  ): Promise<void> {
    await knex('xp_awards').insert({
      id: randomUUID(),
      subject_ref: data.userRef,
      quest_id: data.questId,
      xp_amount: data.xpAmount,
      awarded_on_completion_count: data.awardedOnCompletionCount || 1,
      source: 'integration_test',
    });
  }

  describe('getTotalXp', () => {
    it('should return 0 for a user with no XP entries', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/alice';
      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(0);
    });

    it('should return correct XP for a user with a single entry', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/bob';
      const questId = randomUUID();

      // Create quest first (required for foreign key)
      await createQuest(knex, questId);

      // Create XP award entry
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 100,
      });

      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(100);

      // Verify the entry is actually in the database
      const dbEntry = await knex('xp_awards')
        .where({ subject_ref: userRef })
        .first();
      expect(dbEntry).toBeDefined();
      expect(dbEntry.xp_amount).toBe(100);
    });

    it('should correctly sum multiple XP entries for the same user', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/charlie';
      const quest1Id = randomUUID();
      const quest2Id = randomUUID();
      const quest3Id = randomUUID();

      // Create quests
      await createQuest(knex, quest1Id, { title: 'Quest 1' });
      await createQuest(knex, quest2Id, { title: 'Quest 2' });
      await createQuest(knex, quest3Id, { title: 'Quest 3' });

      // Create multiple XP entries
      await createXpAwardEntry(knex, {
        userRef,
        questId: quest1Id,
        xpAmount: 50,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId: quest2Id,
        xpAmount: 75,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId: quest3Id,
        xpAmount: 125,
      });

      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(250); // 50 + 75 + 125
    });

    it('should only return XP for the specified user', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const user1Ref = 'user:default/alice';
      const user2Ref = 'user:default/bob';
      const questId = randomUUID();

      await createQuest(knex, questId);

      // Create XP for user1
      await createXpAwardEntry(knex, {
        userRef: user1Ref,
        questId,
        xpAmount: 100,
      });

      // Create XP for user2
      await createXpAwardEntry(knex, {
        userRef: user2Ref,
        questId,
        xpAmount: 200,
        awardedOnCompletionCount: 2,
      });

      const user1Xp = await repository.getTotalXp(user1Ref);
      const user2Xp = await repository.getTotalXp(user2Ref);

      expect(user1Xp).toBe(100);
      expect(user2Xp).toBe(200);
    });

    it('should handle multiple XP entries from the same quest for the same user', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/david';
      const questId = randomUUID();

      await createQuest(knex, questId, {
        title: 'Repeatable Quest',
        target_count: 5,
        xp_reward: 50,
      });

      // Simulate multiple completions of the same quest
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 5,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 10,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 15,
      });

      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(150); // 50 + 50 + 50
    });

    it('should handle zero XP amounts correctly', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/eve';
      const questId = randomUUID();

      await createQuest(knex, questId);

      // The database has a check constraint xp_amount >= 0, so 0 should be valid
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 0,
      });

      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(0);
    });

    it('should handle large XP values correctly', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/mega-user';
      const questId = randomUUID();

      await createQuest(knex, questId);

      // Create entries with large XP values
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 999999,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 1000000,
        awardedOnCompletionCount: 2,
      });

      const totalXp = await repository.getTotalXp(userRef);

      expect(totalXp).toBe(1999999);
    });

    it('should return correct total after database modifications', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/frank';
      const quest1Id = randomUUID();
      const quest2Id = randomUUID();

      await createQuest(knex, quest1Id);
      await createQuest(knex, quest2Id);

      // Create initial XP
      await createXpAwardEntry(knex, {
        userRef,
        questId: quest1Id,
        xpAmount: 100,
      });

      let totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(100);

      // Add more XP
      await createXpAwardEntry(knex, {
        userRef,
        questId: quest2Id,
        xpAmount: 50,
      });

      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(150);
    });

    it('should handle entity reference formats correctly', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRefs = [
        'user:default/alice',
        'user:default/bob-smith',
        'user:default/charlie.jones',
        'group:default/engineering',
      ];

      const questId = randomUUID();
      await createQuest(knex, questId);

      // Create XP for different entity reference formats
      for (let i = 0; i < userRefs.length; i++) {
        await createXpAwardEntry(knex, {
          userRef: userRefs[i],
          questId,
          xpAmount: (i + 1) * 10,
        });
      }

      // Verify each user has their correct XP
      for (let i = 0; i < userRefs.length; i++) {
        const totalXp = await repository.getTotalXp(userRefs[i]);
        expect(totalXp).toBe((i + 1) * 10);
      }
    });
  });

  describe('Database integrity and constraints', () => {
    it('should verify foreign key constraint between xp_awards and quests', async () => {
      const knex = await initDb();

      const userRef = 'user:default/test';
      const nonExistentQuestId = randomUUID();

      // Attempting to create an XP entry without a valid quest should fail
      await expect(
        knex('xp_awards').insert({
          id: randomUUID(),
          subject_ref: userRef,
          quest_id: nonExistentQuestId,
          xp_amount: 100,
          awarded_on_completion_count: 1,
          source: 'test',
        }),
      ).rejects.toThrow();
    });

    it('should verify unique constraint on subject_ref, quest_id, and awarded_on_completion_count', async () => {
      const knex = await initDb();

      const userRef = 'user:default/duplicate-test';
      const questId = randomUUID();

      await createQuest(knex, questId);

      // Create first entry
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 5,
      });

      // Attempting to create a duplicate entry should fail
      await expect(
        createXpAwardEntry(knex, {
          userRef,
          questId,
          xpAmount: 50,
          awardedOnCompletionCount: 5, // Same completion count
        }),
      ).rejects.toThrow();
    });

    it('should allow same user and quest with different completion counts', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/multi-completion';
      const questId = randomUUID();

      await createQuest(knex, questId);

      // These should all succeed because completion_count differs
      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 1,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 2,
      });

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 50,
        awardedOnCompletionCount: 3,
      });

      const totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(150);
    });

    it('should cascade delete XP entries when quest is deleted', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/cascade-test';
      const questId = randomUUID();

      await createQuest(knex, questId);

      await createXpAwardEntry(knex, {
        userRef,
        questId,
        xpAmount: 100,
      });

      let totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(100);

      // Delete the quest (should cascade to xp_awards)
      await knex('quests').where({ id: questId }).del();

      // XP should now be 0 because the award entry was cascade deleted
      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(0);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle a complete user journey with multiple quests', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const userRef = 'user:default/journey-user';

      // Create multiple quests
      const dailyQuestId = randomUUID();
      const weeklyQuestId = randomUUID();
      const monthlyQuestId = randomUUID();

      await createQuest(knex, dailyQuestId, {
        title: 'Daily Login',
        target_count: 1,
        xp_reward: 10,
      });

      await createQuest(knex, weeklyQuestId, {
        title: 'Weekly Review',
        target_count: 7,
        xp_reward: 100,
      });

      await createQuest(knex, monthlyQuestId, {
        title: 'Monthly Challenge',
        target_count: 30,
        xp_reward: 1000,
      });

      // Start with 0 XP
      let totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(0);

      // User completes daily quest
      await createXpAwardEntry(knex, {
        userRef,
        questId: dailyQuestId,
        xpAmount: 10,
      });

      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(10);

      // User completes weekly quest
      await createXpAwardEntry(knex, {
        userRef,
        questId: weeklyQuestId,
        xpAmount: 100,
      });

      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(110);

      // User completes daily quest again
      await createXpAwardEntry(knex, {
        userRef,
        questId: dailyQuestId,
        xpAmount: 10,
        awardedOnCompletionCount: 2,
      });

      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(120);

      // User completes monthly challenge
      await createXpAwardEntry(knex, {
        userRef,
        questId: monthlyQuestId,
        xpAmount: 1000,
      });

      totalXp = await repository.getTotalXp(userRef);
      expect(totalXp).toBe(1120);
    });

    it('should handle concurrent XP additions for different users', async () => {
      const knex = await initDb();
      const repository = new XpRepository(knex);

      const questId = randomUUID();
      await createQuest(knex, questId);

      const users = [
        'user:default/user1',
        'user:default/user2',
        'user:default/user3',
        'user:default/user4',
        'user:default/user5',
      ];

      // Create XP entries concurrently
      await Promise.all(
        users.map((userRef, index) =>
          createXpAwardEntry(knex, {
            userRef,
            questId,
            xpAmount: (index + 1) * 100,
          }),
        ),
      );

      // Verify each user has correct XP
      const xpResults = await Promise.all(
        users.map(userRef => repository.getTotalXp(userRef)),
      );

      expect(xpResults).toEqual([100, 200, 300, 400, 500]);
    });
  });
});
