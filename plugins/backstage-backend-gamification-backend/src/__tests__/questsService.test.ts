import { QuestsService } from '../services/questsService';
import { QuestsRepository } from '../repositories/questsRepository';
import { QuestCreationInput } from '../schemas/quests/questCreationSchema';

jest.mock('../repositories/questsRepository');

describe('QuestsService', () => {
  let service: QuestsService;
  let mockRepo: jest.Mocked<QuestsRepository>;

  beforeEach(() => {
    mockRepo = {
      createQuest: jest.fn(),
      getQuestById: jest.fn(),
      getProgressForUserQuest: jest.fn(),
      getLastAwardedAt: jest.fn(),
      incrementQuestProgress: jest.fn(),
    } as any;

    const mockCatalogClient = {} as any;
    const mockAuthService = {} as any;

    service = new QuestsService({
      questsRepo: mockRepo,
      catalogClient: mockCatalogClient,
      auth: mockAuthService,
    });
  });

  describe('createQuest', () => {
    it('should create a quest with valid data', async () => {
      const questInput: QuestCreationInput = {
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        interval: 1,
        xp_reward: 100,
        completion_policy: 'REPEATABLE',
      };

      const expectedQuest = {
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        interval: 1,
        xp_reward: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.createQuest.mockResolvedValue(expectedQuest as any);

      const result = await service.createQuest(questInput, {
        credentials: {} as any,
      });

      expect(result).toEqual(expectedQuest);
      expect(mockRepo.createQuest).toHaveBeenCalledTimes(1);

      const callArgs = mockRepo.createQuest.mock.calls[0][0];
      expect(callArgs.title).toBe('Ship a Feature');
      expect(callArgs.description).toBe('Deploy a new feature to production');
      expect(callArgs.interval).toBe(1);
      expect(callArgs.xp_reward).toBe(100);
    });

    it('should create quest with different interval values', async () => {
      const questInput: QuestCreationInput = {
        title: 'Review PRs',
        description: 'Review 5 pull requests',
        interval: 5,
        xp_reward: 50,
        completion_policy: 'REPEATABLE',
      };

      const mockQuest = {
        ...questInput,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.createQuest.mockResolvedValue(mockQuest as any);

      const result = await service.createQuest(questInput, {
        credentials: {} as any,
      });

      expect(result.interval).toBe(5);
      expect(result.xp_reward).toBe(50);
    });

    it('should create quest with empty description', async () => {
      const questInput: QuestCreationInput = {
        title: 'Quick Task',
        description: '',
        interval: 1,
        xp_reward: 10,
        completion_policy: 'REPEATABLE',
      };

      const mockQuest = {
        ...questInput,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.createQuest.mockResolvedValue(mockQuest as any);

      const result = await service.createQuest(questInput, {
        credentials: {} as any,
      });

      expect(result.description).toBe('');
    });

    it('should call repository createQuest for each creation', async () => {
      const questInput: QuestCreationInput = {
        title: 'Test Quest',
        description: 'Test',
        interval: 1,
        xp_reward: 10,
        completion_policy: 'REPEATABLE',
      };

      mockRepo.createQuest.mockImplementation(async data => {
        return {
          ...data,
          completion_policy: data.completion_policy ?? 'REPEATABLE',
          cooldown_days: data.cooldown_days ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        } as any;
      });

      await service.createQuest(questInput, { credentials: {} as any });
      await service.createQuest(questInput, { credentials: {} as any });
      await service.createQuest(questInput, { credentials: {} as any });

      expect(mockRepo.createQuest).toHaveBeenCalledTimes(3);
    });

    it('should force interval=1 and cooldown_days=null for ONE_TIME quests', async () => {
      const questInput: QuestCreationInput = {
        title: 'First PR Merge',
        description: 'Merge your very first PR',
        interval: 5, // should be overridden to 1
        xp_reward: 200,
        completion_policy: 'ONE_TIME',
        cooldown_days: 7, // should be overridden to null
      };

      mockRepo.createQuest.mockImplementation(
        async data =>
          ({
            ...data,
            id: 'quest-ot-1',
            completion_policy: data.completion_policy ?? 'REPEATABLE',
            cooldown_days: data.cooldown_days ?? null,
            created_at: new Date(),
            updated_at: new Date(),
          } as any),
      );

      await service.createQuest(questInput, { credentials: {} as any });

      const callArgs = mockRepo.createQuest.mock.calls[0][0];
      expect(callArgs.completion_policy).toBe('ONE_TIME');
      expect(callArgs.interval).toBe(1);
      expect(callArgs.cooldown_days).toBeNull();
    });

    it('should preserve interval and cooldown_days for REPEATABLE quests', async () => {
      const questInput: QuestCreationInput = {
        title: 'Weekly PR Review',
        description: 'Review PRs every week',
        interval: 5,
        xp_reward: 50,
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
      };

      mockRepo.createQuest.mockImplementation(
        async data =>
          ({
            ...data,
            id: 'quest-rep-1',
            completion_policy: data.completion_policy ?? 'REPEATABLE',
            cooldown_days: data.cooldown_days ?? null,
            created_at: new Date(),
            updated_at: new Date(),
          } as any),
      );

      await service.createQuest(questInput, { credentials: {} as any });

      const callArgs = mockRepo.createQuest.mock.calls[0][0];
      expect(callArgs.completion_policy).toBe('REPEATABLE');
      expect(callArgs.interval).toBe(5);
      expect(callArgs.cooldown_days).toBe(7);
    });
  });

  describe('ONE_TIME policy enforcement', () => {
    const oneTimeQuest = {
      id: 'quest-ot',
      title: 'First Deploy',
      description: '',
      interval: 1,
      xp_reward: 100,
      completion_policy: 'ONE_TIME' as const,
      cooldown_days: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should block completion when ONE_TIME quest already completed', async () => {
      mockRepo.getQuestById.mockResolvedValue(oneTimeQuest);
      mockRepo.getProgressForUserQuest.mockResolvedValue({
        user_ref: 'user:default/alice',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        service.completeQuest('quest-ot', 'user:default/alice'),
      ).rejects.toThrow(/can only be completed once/);

      expect(mockRepo.incrementQuestProgress).not.toHaveBeenCalled();
    });

    it('should allow first completion of a ONE_TIME quest', async () => {
      mockRepo.getQuestById.mockResolvedValue(oneTimeQuest);
      mockRepo.getProgressForUserQuest.mockResolvedValue(undefined);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        user_ref: 'user:default/alice',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.completeQuest(
        'quest-ot',
        'user:default/alice',
      );
      expect(result.completion_count).toBe(1);
      expect(mockRepo.incrementQuestProgress).toHaveBeenCalledTimes(1);
    });

    it('should block a second user who already completed a ONE_TIME quest', async () => {
      mockRepo.getQuestById.mockResolvedValue(oneTimeQuest);
      // alice already completed it
      mockRepo.getProgressForUserQuest.mockResolvedValue({
        user_ref: 'user:default/alice',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        service.completeQuest('quest-ot', 'user:default/alice'),
      ).rejects.toThrow();

      // bob has not completed it – should be allowed
      mockRepo.getProgressForUserQuest.mockResolvedValue(undefined);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        user_ref: 'user:default/bob',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.completeQuest(
        'quest-ot',
        'user:default/bob',
      );
      expect(result.completion_count).toBe(1);
    });
  });

  describe('REPEATABLE cooldown enforcement', () => {
    const cooldownQuest = {
      id: 'quest-cd',
      title: 'Weekly PR Review',
      description: '',
      interval: 1,
      xp_reward: 50,
      completion_policy: 'REPEATABLE' as const,
      cooldown_days: 7,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should block completion when within cooldown window', async () => {
      mockRepo.getQuestById.mockResolvedValue(cooldownQuest);
      // Last award was 2 days ago – still within 7-day cooldown
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      mockRepo.getLastAwardedAt.mockResolvedValue(twoDaysAgo);

      await expect(
        service.completeQuest('quest-cd', 'user:default/bob'),
      ).rejects.toThrow(/on cooldown/);

      expect(mockRepo.incrementQuestProgress).not.toHaveBeenCalled();
    });

    it('should allow completion once cooldown has expired', async () => {
      mockRepo.getQuestById.mockResolvedValue(cooldownQuest);
      // Last award was 10 days ago – past 7-day cooldown
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockRepo.getLastAwardedAt.mockResolvedValue(tenDaysAgo);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        user_ref: 'user:default/bob',
        quest_id: 'quest-cd',
        completion_count: 2,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.completeQuest(
        'quest-cd',
        'user:default/bob',
      );
      expect(result.completion_count).toBe(2);
      expect(mockRepo.incrementQuestProgress).toHaveBeenCalledTimes(1);
    });

    it('should allow completion when no prior award exists (cooldown not started)', async () => {
      mockRepo.getQuestById.mockResolvedValue(cooldownQuest);
      mockRepo.getLastAwardedAt.mockResolvedValue(null);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        user_ref: 'user:default/carol',
        quest_id: 'quest-cd',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.completeQuest(
        'quest-cd',
        'user:default/carol',
      );
      expect(result.completion_count).toBe(1);
    });

    it('should not apply cooldown to REPEATABLE quests without cooldown_days', async () => {
      const questNoCooldown = { ...cooldownQuest, cooldown_days: null };
      mockRepo.getQuestById.mockResolvedValue(questNoCooldown);
      // getLastAwardedAt should not even be called
      mockRepo.incrementQuestProgress.mockResolvedValue({
        user_ref: 'user:default/dave',
        quest_id: 'quest-cd',
        completion_count: 5,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.completeQuest(
        'quest-cd',
        'user:default/dave',
      );
      expect(result.completion_count).toBe(5);
      expect(mockRepo.getLastAwardedAt).not.toHaveBeenCalled();
    });
  });
});
