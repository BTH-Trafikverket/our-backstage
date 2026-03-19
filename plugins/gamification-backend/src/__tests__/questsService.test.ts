import { QuestsService } from '../services/questsService';
import { QuestsRepository } from '../repositories/questsRepository';
import { QuestCreationInput } from '../schemas/quests/questCreationSchema';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';

jest.mock('../repositories/questsRepository');

describe('QuestsService', () => {
  let service: QuestsService;
  let mockRepo: jest.Mocked<QuestsRepository>;
  let mockCatalogClient: { getEntities: jest.Mock };
  let mockAuthService: { getPluginRequestToken: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      createQuest: jest.fn(),
      getQuests: jest.fn(),
      getQuestById: jest.fn(),
      getBadgeCriteriaUsage: jest.fn(),
      editQuest: jest.fn(),
      deleteQuest: jest.fn(),
      withTransaction: jest.fn(async fn => fn(mockRepo)),
      lockSubjectQuest: jest.fn(),
      getProgressForSubjectQuest: jest.fn(),
      getLastAwardedAt: jest.fn(),
      incrementQuestProgress: jest.fn(),
      getQuestsWithProgress: jest.fn(),
      tryInsertReceipt: jest.fn(),
    } as any;

    mockCatalogClient = {
      getEntities: jest.fn(),
    };
    mockAuthService = {
      getPluginRequestToken: jest.fn(async () => ({ token: 'catalog-token' })),
    };

    service = new QuestsService({
      questsRepo: mockRepo,
      catalogClient: mockCatalogClient as any,
      auth: mockAuthService as any,
    });
  });

  describe('createQuest', () => {
    it('should create a quest with valid data', async () => {
      const questInput: QuestCreationInput = {
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
      };

      const expectedQuest = {
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        target_count: 1,
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
      expect(callArgs.target_count).toBe(1);
      expect(callArgs.xp_reward).toBe(100);
    });

    it('should create quest with different target_count values', async () => {
      const questInput: QuestCreationInput = {
        title: 'Review PRs',
        description: 'Review 5 pull requests',
        target_count: 5,
        xp_reward: 50,
        subject_type: 'user',
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

      expect(result.target_count).toBe(5);
      expect(result.xp_reward).toBe(50);
    });

    it('should create quest with empty description', async () => {
      const questInput: QuestCreationInput = {
        title: 'Quick Task',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
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
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
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

    it('should clear cooldown_days for ONE_TIME quests', async () => {
      const questInput: QuestCreationInput = {
        title: 'First PR Merge',
        description: 'Merge your very first PR',
        target_count: 5, // NOT overridden – ONE_TIME supports any target_count
        xp_reward: 200,
        subject_type: 'user',
        completion_policy: 'ONE_TIME',
        cooldown_days: 7, // should be cleared to null
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
      expect(callArgs.target_count).toBe(5);
      expect(callArgs.cooldown_days).toBeNull();
    });

    it('should preserve target_count and cooldown_days for REPEATABLE quests', async () => {
      const questInput: QuestCreationInput = {
        title: 'Weekly PR Review',
        description: 'Review PRs every week',
        target_count: 5,
        xp_reward: 50,
        subject_type: 'user',
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
      expect(callArgs.target_count).toBe(5);
      expect(callArgs.cooldown_days).toBe(7);
    });

    it('should create global team quests', async () => {
      const questInput: QuestCreationInput = {
        title: 'Platform Team Review',
        description: 'Review PRs as a team',
        target_count: 3,
        xp_reward: 75,
        subject_type: 'team',
        completion_policy: 'REPEATABLE',
      };

      mockRepo.createQuest.mockResolvedValue({
        ...questInput,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await service.createQuest(questInput, { credentials: {} as any });

      const callArgs = mockRepo.createQuest.mock.calls[0][0];
      expect(callArgs.subject_type).toBe('team');
      expect(callArgs).not.toHaveProperty('subject_ref');
    });
  });

  describe('ONE_TIME policy enforcement', () => {
    const oneTimeQuest = {
      id: 'quest-ot',
      title: 'First Deploy',
      description: '',
      target_count: 1,
      xp_reward: 100,
      subject_type: 'user' as const,
      completion_policy: 'ONE_TIME' as const,
      cooldown_days: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should block completion when ONE_TIME quest already completed', async () => {
      mockRepo.getQuestById.mockResolvedValue(oneTimeQuest);
      mockRepo.getProgressForSubjectQuest.mockResolvedValue({
        subject_ref: 'user:default/alice',
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
      mockRepo.getProgressForSubjectQuest.mockResolvedValue(undefined);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        subject_ref: 'user:default/alice',
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
      mockRepo.getProgressForSubjectQuest.mockResolvedValue({
        subject_ref: 'user:default/alice',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        service.completeQuest('quest-ot', 'user:default/alice'),
      ).rejects.toThrow();

      // bob has not completed it – should be allowed
      mockRepo.getProgressForSubjectQuest.mockResolvedValue(undefined);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        subject_ref: 'user:default/bob',
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
      target_count: 1,
      xp_reward: 50,
      subject_type: 'user' as const,
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
        subject_ref: 'user:default/bob',
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
        subject_ref: 'user:default/carol',
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
        subject_ref: 'user:default/dave',
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

  describe('getQuestsWithProgress', () => {
    it('passes the current user and owned teams to the repository', async () => {
      mockRepo.getQuestsWithProgress = jest.fn(async () => []) as any;

      await service.getQuestsWithProgress(
        'user:default/alice',
        [
          'user:default/alice',
          'group:default/platform',
          'group:default/engineering',
        ],
        { credentials: {} as any },
        {
          searchTitle: 'platform',
        },
      );

      expect(mockRepo.getQuestsWithProgress).toHaveBeenCalledWith({
        user_ref: 'user:default/alice',
        ownership_refs: [
          'user:default/alice',
          'group:default/platform',
          'group:default/engineering',
        ],
        searchTitle: 'platform',
        audience: undefined,
        status: undefined,
        team_ref: undefined,
      });
    });
  });

  describe('getQuests', () => {
    it('passes admin list filters to the repository', async () => {
      mockRepo.getQuests.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      } as any);

      await service.getQuests(
        {
          searchTitle: 'team',
          audience: 'team',
          sortBy: 'xp_reward',
          order: 'desc',
          page: 2,
          limit: 5,
        },
        { credentials: {} as any },
      );

      expect(mockRepo.getQuests).toHaveBeenCalledWith({
        searchTitle: 'team',
        audience: 'team',
        sortBy: 'xp_reward',
        order: 'desc',
        includeArchived: undefined,
        page: 2,
        limit: 5,
      });
    });
  });

  describe('getQuestById', () => {
    it('delegates directly to the repository', async () => {
      const quest = {
        id: 'quest-1',
        title: 'Review PRs',
      };

      mockRepo.getQuestById.mockResolvedValue(quest as any);

      await expect(
        service.getQuestById('quest-1', { credentials: {} as any }),
      ).resolves.toBe(quest);
    });
  });

  describe('editQuest', () => {
    it('returns undefined when the quest does not exist', async () => {
      mockRepo.getQuestById.mockResolvedValue(undefined);

      await expect(
        service.editQuest(
          'missing-quest',
          { title: 'Updated' },
          {
            credentials: {} as any,
          },
        ),
      ).resolves.toBeUndefined();

      expect(mockRepo.editQuest).not.toHaveBeenCalled();
    });

    it('clears cooldown_days when editing a quest to ONE_TIME', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-1',
        title: 'Weekly Review',
        description: '',
        target_count: 2,
        xp_reward: 50,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      mockRepo.editQuest.mockResolvedValue({
        id: 'quest-1',
        title: 'Weekly Review',
        description: '',
        target_count: 2,
        xp_reward: 50,
        subject_type: 'user',
        completion_policy: 'ONE_TIME',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await service.editQuest(
        'quest-1',
        { completion_policy: 'ONE_TIME' },
        { credentials: {} as any },
      );

      expect(mockRepo.editQuest).toHaveBeenCalledWith(
        'quest-1',
        expect.objectContaining({
          subject_type: 'user',
          completion_policy: 'ONE_TIME',
          cooldown_days: null,
        }),
      );
    });

    it('updates repeatable cooldown_days when one is provided', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-1',
        title: 'Weekly Review',
        description: '',
        target_count: 2,
        xp_reward: 50,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      mockRepo.editQuest.mockResolvedValue({
        id: 'quest-1',
        title: 'Weekly Review',
        description: '',
        target_count: 2,
        xp_reward: 50,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: 14,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await service.editQuest(
        'quest-1',
        { cooldown_days: 14 },
        { credentials: {} as any },
      );

      expect(mockRepo.editQuest).toHaveBeenCalledWith(
        'quest-1',
        expect.objectContaining({
          completion_policy: 'REPEATABLE',
          cooldown_days: 14,
        }),
      );
    });
  });

  describe('deleteQuest', () => {
    it('delegates quest deletion to the repository', async () => {
      mockRepo.getBadgeCriteriaUsage.mockResolvedValue([]);
      mockRepo.deleteQuest.mockResolvedValue(true);

      await expect(
        service.deleteQuest('quest-1', { credentials: {} as any }),
      ).resolves.toBe(true);

      expect(mockRepo.deleteQuest).toHaveBeenCalledWith('quest-1');
    });

    it('blocks deletion when the quest is referenced by badge criteria', async () => {
      mockRepo.getBadgeCriteriaUsage.mockResolvedValue([
        { badge_id: 'badge-1', badge_title: 'Review Champion' },
      ]);

      await expect(
        service.deleteQuest('quest-1', { credentials: {} as any }),
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.deleteQuest).not.toHaveBeenCalled();
    });
  });

  describe('resolveActorToUserRef', () => {
    it('returns actor.entityRef directly when it is already provided', async () => {
      await expect(
        service.resolveActorToUserRef({
          actor: { entityRef: 'user:default/alice' },
          credentials: {} as any,
        }),
      ).resolves.toBe('user:default/alice');

      expect(mockAuthService.getPluginRequestToken).not.toHaveBeenCalled();
      expect(mockCatalogClient.getEntities).not.toHaveBeenCalled();
    });

    it('resolves github logins through the catalog', async () => {
      mockCatalogClient.getEntities.mockResolvedValue({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'User',
            metadata: { name: 'alice', namespace: 'default' },
          },
        ],
      });

      await expect(
        service.resolveActorToUserRef({
          actor: { provider: 'github', login: 'alice' },
          credentials: {} as any,
        }),
      ).resolves.toBe('user:default/alice');

      expect(mockAuthService.getPluginRequestToken).toHaveBeenCalled();
      expect(mockCatalogClient.getEntities).toHaveBeenCalledWith(
        {
          filter: [
            {
              kind: 'User',
              'metadata.annotations.github.com/user-login': 'alice',
            },
          ],
        },
        { token: 'catalog-token' },
      );
    });

    it('resolves github ids through the catalog', async () => {
      mockCatalogClient.getEntities.mockResolvedValue({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'User',
            metadata: { name: 'alice', namespace: 'default' },
          },
        ],
      });

      await expect(
        service.resolveActorToUserRef({
          actor: { provider: 'github', id: '12345' },
          credentials: {} as any,
        }),
      ).resolves.toBe('user:default/alice');

      expect(mockCatalogClient.getEntities).toHaveBeenCalledWith(
        {
          filter: [
            {
              kind: 'User',
              'metadata.annotations.github.com/user-id': '12345',
            },
          ],
        },
        { token: 'catalog-token' },
      );
    });

    it('requires actor.provider when actor.entityRef is missing', async () => {
      await expect(
        service.resolveActorToUserRef({
          actor: { id: '12345' },
          credentials: {} as any,
        }),
      ).rejects.toThrow(InputError);
    });

    it('throws when the catalog cannot map the actor', async () => {
      mockCatalogClient.getEntities.mockResolvedValue({ items: [] });

      await expect(
        service.resolveActorToUserRef({
          actor: { provider: 'github', login: 'missing-user' },
          credentials: {} as any,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws when the provider is unsupported', async () => {
      await expect(
        service.resolveActorToUserRef({
          actor: { provider: 'gitlab', login: 'alice' } as any,
          credentials: {} as any,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('handleQuestEvent policy enforcement', () => {
    beforeEach(() => {
      mockRepo.tryInsertReceipt.mockResolvedValue(true);
    });

    it('returns blocked=true when ONE_TIME quest already completed (no ConflictError thrown)', async () => {
      const oneTimeQuest = {
        id: 'quest-ot',
        title: 'First Deploy',
        description: '',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'user' as const,
        completion_policy: 'ONE_TIME' as const,
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.getQuestById.mockResolvedValue(oneTimeQuest);
      // alice already completed it
      mockRepo.getProgressForSubjectQuest.mockResolvedValue({
        subject_ref: 'user:default/alice',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.handleQuestEvent({
        eventId: 'evt-one-time',
        questId: 'quest-ot',
        subjectRef: 'user:default/alice',
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result.blocked).toBe(true);
      expect((result as any).reason).toMatch(/can only be completed once/);
      expect(mockRepo.incrementQuestProgress).not.toHaveBeenCalled();
    });

    it('returns blocked=true when REPEATABLE quest is within cooldown window', async () => {
      const cooldownQuest = {
        id: 'quest-ot',
        title: 'Weekly Review',
        description: '',
        target_count: 1,
        xp_reward: 50,
        subject_type: 'user' as const,
        completion_policy: 'REPEATABLE' as const,
        cooldown_days: 7,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.getQuestById.mockResolvedValue(cooldownQuest);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      mockRepo.getLastAwardedAt.mockResolvedValue(twoDaysAgo);

      const result = await service.handleQuestEvent({
        eventId: 'evt-cooldown',
        questId: 'quest-ot',
        subjectRef: 'user:default/bob',
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result.blocked).toBe(true);
      expect((result as any).reason).toMatch(/on cooldown/);
      expect(mockRepo.incrementQuestProgress).not.toHaveBeenCalled();
    });

    it('returns blocked=false and completionCount on successful first event completion', async () => {
      const repeatableQuest = {
        id: 'quest-ot',
        title: 'Daily Commit',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user' as const,
        completion_policy: 'REPEATABLE' as const,
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.getQuestById.mockResolvedValue(repeatableQuest);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        subject_ref: 'user:default/carol',
        quest_id: 'quest-ot',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.handleQuestEvent({
        eventId: 'evt-success',
        questId: 'quest-ot',
        subjectRef: 'user:default/carol',
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result.duplicate).toBe(false);
      expect(result.blocked).toBe(false);
      expect((result as any).completionCount).toBe(1);
    });

    it('returns duplicate=true when the event receipt already exists', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-ot',
        title: 'Daily Commit',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      mockRepo.tryInsertReceipt.mockResolvedValue(false);

      const result = await service.handleQuestEvent({
        eventId: 'evt-duplicate',
        questId: 'quest-ot',
        subjectRef: 'user:default/dave',
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result).toEqual({
        duplicate: true,
        blocked: false,
        subjectRef: 'user:default/dave',
        questId: 'quest-ot',
      });
      expect(mockRepo.incrementQuestProgress).not.toHaveBeenCalled();
    });

    it('uses the group entity ref as the subject for team quest events', async () => {
      const teamQuest = {
        id: 'quest-team',
        title: 'Dependency Health',
        description: '',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'team' as const,
        completion_policy: 'REPEATABLE' as const,
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.getQuestById.mockResolvedValue(teamQuest);
      mockRepo.incrementQuestProgress.mockResolvedValue({
        subject_ref: 'group:default/platform',
        quest_id: 'quest-team',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.handleQuestEvent({
        eventId: 'evt-team',
        questId: 'quest-team',
        subjectRef: 'group:default/platform',
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result.subjectRef).toBe('group:default/platform');
    });

    it('throws when completing a missing quest by id', async () => {
      mockRepo.getQuestById.mockResolvedValue(undefined);

      await expect(
        service.completeQuest('missing-quest', 'user:default/alice'),
      ).rejects.toThrow(NotFoundError);
    });

    it('requires either subjectRef or actor', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-user',
        title: 'Daily Commit',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-missing-subject',
          questId: 'quest-user',
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow(InputError);
    });

    it('rejects subject refs that do not match the quest subject type', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-team',
        title: 'Team Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-bad-team-subject',
          questId: 'quest-team',
          subjectRef: 'user:default/alice',
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow(InputError);
    });

    it('rejects user quests when given a group subject ref', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-user',
        title: 'User Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-bad-user-subject',
          questId: 'quest-user',
          subjectRef: 'group:default/platform',
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow(InputError);
    });

    it('requires actor.entityRef for team quest actors', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-team',
        title: 'Team Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-team-actor-missing-entity',
          questId: 'quest-team',
          actor: { provider: 'github', login: 'alice' },
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow(InputError);
    });

    it('requires team quest actors to use a group entity ref', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-team',
        title: 'Team Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'team',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-team-actor-bad-ref',
          questId: 'quest-team',
          actor: { entityRef: 'user:default/alice' },
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow(InputError);
    });

    it('resolves user actors when subjectRef is omitted', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-user',
        title: 'User Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      mockCatalogClient.getEntities.mockResolvedValue({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'User',
            metadata: { name: 'alice', namespace: 'default' },
          },
        ],
      });
      mockRepo.incrementQuestProgress.mockResolvedValue({
        subject_ref: 'user:default/alice',
        quest_id: 'quest-user',
        completion_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.handleQuestEvent({
        eventId: 'evt-actor-resolution',
        questId: 'quest-user',
        actor: { provider: 'github', login: 'alice' },
        callerSubject: 'external:test-service',
        opts: { credentials: {} as any },
      });

      expect(result.subjectRef).toBe('user:default/alice');
    });

    it('rethrows non-conflict errors from policy enforcement', async () => {
      mockRepo.getQuestById.mockResolvedValue({
        id: 'quest-user',
        title: 'User Quest',
        description: '',
        target_count: 1,
        xp_reward: 10,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: 7,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      mockRepo.getLastAwardedAt.mockRejectedValue(new Error('db down'));

      await expect(
        service.handleQuestEvent({
          eventId: 'evt-rethrow',
          questId: 'quest-user',
          subjectRef: 'user:default/alice',
          callerSubject: 'external:test-service',
          opts: { credentials: {} as any },
        }),
      ).rejects.toThrow('db down');
    });
  });
});
