import { QuestsService } from './questsService';
import { QuestsRepository } from '../repositories/questsRepository';
import { QuestCreationInput } from '../schemas/schemaBarrel';

// Mock the repository
jest.mock('../repositories/questsRepository');

describe('QuestsService', () => {
  let service: QuestsService;
  let mockRepo: jest.Mocked<QuestsRepository>;

  beforeEach(() => {
    // Create a mock repository
    mockRepo = {
      createQuest: jest.fn(),
      getQuestById: jest.fn(),
    } as any;

    // Create the service with the mock repository
    service = new QuestsService({ questsRepo: mockRepo });
  });

  describe('createQuest', () => {
    it('should create a quest with valid data', async () => {
      // Arrange: Prepare test data
      const questInput: QuestCreationInput = {
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        interval: 1,
        xp_reward: 100,
      };

      const expectedQuest = {
        id: expect.any(String), // UUID will be generated
        title: 'Ship a Feature',
        description: 'Deploy a new feature to production',
        interval: 1,
        xp_reward: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock the repository to return the created quest
      mockRepo.createQuest.mockResolvedValue(expectedQuest);

      // Act: Call the service method
      const result = await service.createQuest(questInput, { credentials: {} });

      // Assert: Verify results
      expect(result).toEqual(expectedQuest);
      expect(mockRepo.createQuest).toHaveBeenCalledTimes(1);

      // Check that createQuest was called with the right data
      const callArgs = mockRepo.createQuest.mock.calls[0][0];
      expect(callArgs.title).toBe('Ship a Feature');
      expect(callArgs.description).toBe('Deploy a new feature to production');
      expect(callArgs.interval).toBe(1);
      expect(callArgs.xp_reward).toBe(100);
      expect(callArgs.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ); // UUID format
    });

    it('should create quest with different interval values', async () => {
      // Arrange
      const questInput: QuestCreationInput = {
        title: 'Review PRs',
        description: 'Review 5 pull requests',
        interval: 5,
        xp_reward: 50,
      };

      const mockQuest = {
        id: 'test-id',
        ...questInput,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.createQuest.mockResolvedValue(mockQuest);

      // Act
      const result = await service.createQuest(questInput, { credentials: {} });

      // Assert
      expect(result.interval).toBe(5);
      expect(result.xp_reward).toBe(50);
    });

    it('should create quest with empty description', async () => {
      // Arrange
      const questInput: QuestCreationInput = {
        title: 'Quick Task',
        description: '',
        interval: 1,
        xp_reward: 10,
      };

      const mockQuest = {
        id: 'test-id',
        ...questInput,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepo.createQuest.mockResolvedValue(mockQuest);

      // Act
      const result = await service.createQuest(questInput, { credentials: {} });

      // Assert
      expect(result.description).toBe('');
    });

    it('should generate unique IDs for different quests', async () => {
      // Arrange
      const questInput: QuestCreationInput = {
        title: 'Test Quest',
        description: 'Test',
        interval: 1,
        xp_reward: 10,
      };

      const ids: string[] = [];
      mockRepo.createQuest.mockImplementation(async data => {
        ids.push(data.id);
        return {
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        };
      });

      // Act: Create multiple quests
      await service.createQuest(questInput, { credentials: {} });
      await service.createQuest(questInput, { credentials: {} });
      await service.createQuest(questInput, { credentials: {} });

      // Assert: All IDs should be unique
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3); // All unique
    });
  });
});
