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
      getSubjectState: jest.fn(),
    } as any;

    service = new XpService(mockRepo);
  });

  describe('getStatus', () => {
    it('should return level 1 with 0 XP for a new user', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/alice',
        total_xp: 0,
        level: 1,
        current_level_xp: 0,
        next_level_xp: 100,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/alice');

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

      expect(mockRepo.getSubjectState).toHaveBeenCalledWith(
        'user:default/alice',
      );
    });

    it('should return level 1 with 50% progress when user has 50 XP', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/bob',
        total_xp: 50,
        level: 1,
        current_level_xp: 0,
        next_level_xp: 100,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/bob');

      expect(status.level).toBe(1);
      expect(status.totalXp).toBe(50);
      expect(status.xpIntoLevel).toBe(50);
      expect(status.xpToNextLevel).toBe(50);
      expect(status.progress).toBe(0.5);
    });

    it('should return level 2 when user has exactly 100 XP', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/charlie',
        total_xp: 100,
        level: 2,
        current_level_xp: 100,
        next_level_xp: 400,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/charlie');

      expect(status.level).toBe(2);
      expect(status.currentLevelXp).toBe(100);
      expect(status.nextLevelXp).toBe(400);
      expect(status.xpIntoLevel).toBe(0);
      expect(status.xpToNextLevel).toBe(300);
      expect(status.progress).toBe(0);
    });

    it('should return level 2 with progress when user has 250 XP', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/diana',
        total_xp: 250,
        level: 2,
        current_level_xp: 100,
        next_level_xp: 400,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/diana');

      expect(status.level).toBe(2);
      expect(status.totalXp).toBe(250);
      expect(status.currentLevelXp).toBe(100);
      expect(status.nextLevelXp).toBe(400);
      expect(status.xpIntoLevel).toBe(150);
      expect(status.xpToNextLevel).toBe(150);
      expect(status.progress).toBe(0.5);
    });

    it('should return level 3 when user has exactly 400 XP', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/eve',
        total_xp: 400,
        level: 3,
        current_level_xp: 400,
        next_level_xp: 900,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/eve');

      expect(status.level).toBe(3);
      expect(status.currentLevelXp).toBe(400);
      expect(status.nextLevelXp).toBe(900);
      expect(status.xpIntoLevel).toBe(0);
      expect(status.xpToNextLevel).toBe(500);
      expect(status.progress).toBe(0);
    });

    it('should handle users with large amounts of XP', async () => {
      mockRepo.getSubjectState.mockResolvedValue({
        subject_ref: 'user:default/admin',
        total_xp: 10000,
        level: 11,
        current_level_xp: 10000,
        next_level_xp: 12100,
        updated_at: new Date(),
      });

      const status = await service.getStatus('user:default/admin');

      expect(status.level).toBe(11);
      expect(status.totalXp).toBe(10000);
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(1);
    });
  });
});
