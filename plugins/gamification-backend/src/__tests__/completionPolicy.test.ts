/**
 * Integration tests for completion policy enforcement.
 *
 * Tests prove that:
 *  - ONE_TIME quests cannot be completed more than once per user
 *  - REPEATABLE quests with cooldown_days block re-completion within the window
 *  - REPEATABLE quests with cooldown_days allow re-completion after the window
 */
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { QuestsRepository } from '../repositories/questsRepository';
import { QuestsService } from '../services/questsService';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('Completion policy integration', () => {
  function makeService(knex: Knex): QuestsService {
    const repo = new QuestsRepository(knex);
    return new QuestsService({
      questsRepo: repo,
      // These are not used in the tests below
      catalogClient: {} as any,
      auth: {} as any,
    });
  }

  describe('ONE_TIME policy', () => {
    it('stores completion_policy = ONE_TIME in DB with the given target_count', async () => {
      const knex = await initDb();
      const repo = new QuestsRepository(knex);

      const quest = await repo.createQuest({
        title: 'First PR',
        description: 'Merge your first PR ever',
        target_count: 1,
        xp_reward: 200,
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
      });

      expect(quest.completion_policy).toBe('ONE_TIME');
      expect(quest.target_count).toBe(1);
      expect(quest.cooldown_days).toBeNull();

      // Verify DB round-trip
      const fromDb = await repo.getQuestById(quest.id);
      expect(fromDb?.completion_policy).toBe('ONE_TIME');
    });

    it('allows first completion of a ONE_TIME quest', async () => {
      const knex = await initDb();
      const service = makeService(knex);

      const repo = new QuestsRepository(knex);
      const quest = await repo.createQuest({
        title: 'First Commit',
        description: '',
        target_count: 1,
        xp_reward: 50,
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
      });

      const progress = await service.completeQuest(
        quest.id,
        'user:default/alice',
      );
      expect(progress.completion_count).toBe(1);
    });

    it('blocks second completion of a ONE_TIME quest for the same user', async () => {
      const knex = await initDb();
      const service = makeService(knex);

      const repo = new QuestsRepository(knex);
      const quest = await repo.createQuest({
        title: 'Onboarding Badge',
        description: '',
        target_count: 1,
        xp_reward: 100,
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
      });

      // First completion – should succeed
      await service.completeQuest(quest.id, 'user:default/bob');

      // Second completion – should be blocked
      await expect(
        service.completeQuest(quest.id, 'user:default/bob'),
      ).rejects.toThrow(/can only be completed once/);

      // Verify completion_count did not increment
      const progress = await repo.getProgressForSubjectQuest(
        'user:default/bob',
        quest.id,
      );
      expect(progress?.completion_count).toBe(1);
    });

    it('allows a different user to complete the same ONE_TIME quest', async () => {
      const knex = await initDb();
      const service = makeService(knex);

      const repo = new QuestsRepository(knex);
      const quest = await repo.createQuest({
        title: 'First Review',
        description: '',
        target_count: 1,
        xp_reward: 75,
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
      });

      await service.completeQuest(quest.id, 'user:default/alice');

      // alice is blocked for a second attempt
      await expect(
        service.completeQuest(quest.id, 'user:default/alice'),
      ).rejects.toThrow();

      // but bob can still complete it for the first time
      const bobProgress = await service.completeQuest(
        quest.id,
        'user:default/bob',
      );
      expect(bobProgress.completion_count).toBe(1);
    });
  });

  describe('REPEATABLE with cooldown_days', () => {
    it('stores cooldown_days correctly in DB', async () => {
      const knex = await initDb();
      const repo = new QuestsRepository(knex);

      const quest = await repo.createQuest({
        title: 'Weekly Review',
        description: '',
        target_count: 1,
        xp_reward: 50,
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
      });

      expect(quest.completion_policy).toBe('REPEATABLE');
      expect(quest.cooldown_days).toBe(7);

      const fromDb = await repo.getQuestById(quest.id);
      expect(fromDb?.cooldown_days).toBe(7);
    });

    it('getLastAwardedAt returns null when no xp_awards rows exist', async () => {
      const knex = await initDb();
      const repo = new QuestsRepository(knex);

      const last = await repo.getLastAwardedAt(
        'user:default/alice',
        randomUUID(),
      );
      expect(last).toBeNull();
    });

    it('getLastAwardedAt returns the most recent award timestamp', async () => {
      const knex = await initDb();
      const repo = new QuestsRepository(knex);

      const questId = randomUUID();
      const userRef = 'user:default/charlie';

      // Seed the quests table so the foreign key is satisfied
      await knex('quests').insert({
        id: questId,
        title: 'CD Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        completion_policy: 'REPEATABLE',
      });

      const olderDate = new Date('2025-01-01T00:00:00Z');
      const newerDate = new Date('2025-06-01T00:00:00Z');

      await knex('xp_awards').insert([
        {
          id: randomUUID(),
          subject_ref: userRef,
          quest_id: questId,
          awarded_on_completion_count: 1,
          xp_amount: 10,
          source: 'test',
          created_at: olderDate,
        },
        {
          id: randomUUID(),
          subject_ref: userRef,
          quest_id: questId,
          awarded_on_completion_count: 2,
          xp_amount: 10,
          source: 'test',
          created_at: newerDate,
        },
      ]);

      const last = await repo.getLastAwardedAt(userRef, questId);
      expect(last).not.toBeNull();
      expect(last!.getTime()).toBe(newerDate.getTime());
    });

    it('blocks re-completion when user is within cooldown window', async () => {
      const knex = await initDb();
      const service = makeService(knex);
      const repo = new QuestsRepository(knex);

      const quest = await repo.createQuest({
        title: 'Bi-weekly Deploy',
        description: '',
        target_count: 1,
        xp_reward: 30,
        completion_policy: 'REPEATABLE',
        cooldown_days: 14,
      });

      // Simulate a previous XP award 3 days ago (within 14-day cooldown)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await knex('xp_awards').insert({
        id: randomUUID(),
        subject_ref: 'user:default/dave',
        quest_id: quest.id,
        awarded_on_completion_count: 1,
        xp_amount: 30,
        source: 'test',
        created_at: threeDaysAgo,
      });

      await expect(
        service.completeQuest(quest.id, 'user:default/dave'),
      ).rejects.toThrow(/on cooldown/);
    });

    it('allows re-completion after cooldown has expired', async () => {
      const knex = await initDb();
      const service = makeService(knex);
      const repo = new QuestsRepository(knex);

      const quest = await repo.createQuest({
        title: 'Monthly Challenge',
        description: '',
        target_count: 1,
        xp_reward: 100,
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
      });

      // Simulate a previous XP award 10 days ago (past 7-day cooldown)
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await knex('xp_awards').insert({
        id: randomUUID(),
        subject_ref: 'user:default/eve',
        quest_id: quest.id,
        awarded_on_completion_count: 1,
        xp_amount: 100,
        source: 'test',
        created_at: tenDaysAgo,
      });

      // Also seed the existing progress row
      await knex('quest_progress').insert({
        subject_ref: 'user:default/eve',
        quest_id: quest.id,
        completion_count: 1,
      });

      // Should succeed – cooldown has expired
      const progress = await service.completeQuest(
        quest.id,
        'user:default/eve',
      );
      expect(progress.completion_count).toBe(2);
    });

    it('REPEATABLE quests without cooldown_days allow unlimited completions', async () => {
      const knex = await initDb();
      const service = makeService(knex);
      const repo = new QuestsRepository(knex);

      const quest = await repo.createQuest({
        title: 'Daily Commit',
        description: '',
        target_count: 1,
        xp_reward: 5,
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
      });

      // Complete 5 times – none should be blocked
      for (let i = 1; i <= 5; i++) {
        const progress = await service.completeQuest(
          quest.id,
          'user:default/frank',
        );
        expect(progress.completion_count).toBe(i);
      }
    });
  });
});
