import { XpService } from '../services/xpService';
import { XpRepository } from '../repositories/xpRepository';

// Mock the repository - we don't want to use a real database in unit tests
jest.mock('../repositories/xpRepository');

describe('XpService', () => {
  let service: XpService;
  let mockRepo: jest.Mocked<XpRepository>;

  beforeEach(() => {
    // Create a mock repository with fake methods
    mockRepo = {
      getTotalXp: jest.fn(),
    } as any;

    // Create the service with default baseXp of 100
    service = new XpService(mockRepo, 100);
  });

  describe('getStatus', () => {
    it('should return level 1 with 0 XP for a new user', async () => {
      // Arrange: Set up the mock to return 0 XP
      mockRepo.getTotalXp.mockResolvedValue(0);

      // Act: Call the service method
      const status = await service.getStatus('user:default/alice');

      // Assert: Check the results
      expect(status).toEqual({
        subjectRef: 'user:default/alice',
        totalXp: 0,
        level: 1,
        currentLevelXp: 0,
        nextLevelXp: 100,
        xpIntoLevel: 0,
        xpToNextLevel: 100,
        progress: 0,
      });

      // Verify the repository was called correctly
      expect(mockRepo.getTotalXp).toHaveBeenCalledWith('user:default/alice');
    });

    it('should return level 1 with 50% progress when user has 50 XP', async () => {
      // Arrange
      mockRepo.getTotalXp.mockResolvedValue(50);

      // Act
      const status = await service.getStatus('user:default/bob');

      // Assert
      expect(status.level).toBe(1);
      expect(status.totalXp).toBe(50);
      expect(status.xpIntoLevel).toBe(50); // 50 XP into level 1
      expect(status.xpToNextLevel).toBe(50); // 50 more XP needed
      expect(status.progress).toBe(0.5); // 50% progress
    });

    it('should return level 2 when user has exactly 100 XP', async () => {
      // Arrange
      mockRepo.getTotalXp.mockResolvedValue(100);

      // Act
      const status = await service.getStatus('user:default/charlie');

      // Assert
      expect(status.level).toBe(2);
      expect(status.currentLevelXp).toBe(100); // Level 2 starts at 100 XP
      expect(status.nextLevelXp).toBe(400); // Level 3 starts at 400 XP
      expect(status.xpIntoLevel).toBe(0); // Just reached level 2
      expect(status.xpToNextLevel).toBe(300); // 300 XP needed for level 3
      expect(status.progress).toBe(0); // 0% through level 2
    });

    it('should return level 2 with progress when user has 250 XP', async () => {
      // Arrange
      mockRepo.getTotalXp.mockResolvedValue(250);

      // Act
      const status = await service.getStatus('user:default/diana');

      // Assert
      expect(status.level).toBe(2);
      expect(status.totalXp).toBe(250);
      expect(status.currentLevelXp).toBe(100); // Level 2 starts at 100
      expect(status.nextLevelXp).toBe(400); // Level 3 starts at 400
      expect(status.xpIntoLevel).toBe(150); // 150 XP into level 2
      expect(status.xpToNextLevel).toBe(150); // 150 more XP needed
      expect(status.progress).toBe(0.5); // 50% through level 2
    });

    it('should return level 3 when user has exactly 400 XP', async () => {
      // Arrange
      mockRepo.getTotalXp.mockResolvedValue(400);

      // Act
      const status = await service.getStatus('user:default/eve');

      // Assert
      expect(status.level).toBe(3);
      expect(status.currentLevelXp).toBe(400);
      expect(status.nextLevelXp).toBe(900); // Level 4 = 100 * (4-1)^2 = 900
      expect(status.xpIntoLevel).toBe(0);
      expect(status.xpToNextLevel).toBe(500);
      expect(status.progress).toBe(0);
    });

    it('should handle users with large amounts of XP', async () => {
      // Arrange: 10,000 XP should be level 11
      mockRepo.getTotalXp.mockResolvedValue(10000);

      // Act
      const status = await service.getStatus('user:default/admin');

      // Assert
      expect(status.level).toBe(11);
      expect(status.totalXp).toBe(10000);
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(1);
    });
  });

  describe('custom baseXp', () => {
    it('should use custom baseXp value when provided', async () => {
      // Arrange: Create service with baseXp of 50
      const customService = new XpService(mockRepo, 50);
      mockRepo.getTotalXp.mockResolvedValue(0);

      // Act
      const status = await customService.getStatus('user:default/test');

      // Assert: Level 2 should start at 50 XP instead of 100
      expect(status.nextLevelXp).toBe(50);
    });
  });
});
