import { QuestsService } from './questsService';
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
      };

      mockRepo.createQuest.mockImplementation(async data => {
        return {
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        } as any;
      });

      await service.createQuest(questInput, { credentials: {} as any });
      await service.createQuest(questInput, { credentials: {} as any });
      await service.createQuest(questInput, { credentials: {} as any });

      expect(mockRepo.createQuest).toHaveBeenCalledTimes(3);
    });
  });
});
