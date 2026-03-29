import type { LeaderboardRepository } from '../repositories/leaderboardRepository';
import { LeaderboardService } from '../services/leaderboardService';

describe('LeaderboardService', () => {
  let mockRepo: jest.Mocked<LeaderboardRepository>;
  let service: LeaderboardService;

  beforeEach(() => {
    mockRepo = {
      getTopSubjectsByXp: jest.fn(),
    } as unknown as jest.Mocked<LeaderboardRepository>;

    service = new LeaderboardService(mockRepo, 25);
  });

  it('returns ranked user leaderboard entries with the configured limit', async () => {
    mockRepo.getTopSubjectsByXp.mockResolvedValue([
      { subject_ref: 'user:default/alice', total_xp: 320 },
      { subject_ref: 'user:default/bob', total_xp: 180 },
    ]);

    await expect(service.getLeaderboard('user')).resolves.toEqual({
      subjectType: 'user',
      limit: 25,
      entries: [
        {
          rank: 1,
          subjectRef: 'user:default/alice',
          subjectType: 'user',
          totalXp: 320,
        },
        {
          rank: 2,
          subjectRef: 'user:default/bob',
          subjectType: 'user',
          totalXp: 180,
        },
      ],
    });

    expect(mockRepo.getTopSubjectsByXp).toHaveBeenCalledWith({
      subjectType: 'user',
      limit: 25,
    });
  });

  it('normalizes the limit floor when configured with a non-positive value', async () => {
    const customService = new LeaderboardService(mockRepo, 0);
    mockRepo.getTopSubjectsByXp.mockResolvedValue([
      { subject_ref: 'group:default/platform', total_xp: 500 },
    ]);

    await expect(customService.getLeaderboard('group')).resolves.toEqual({
      subjectType: 'group',
      limit: 1,
      entries: [
        {
          rank: 1,
          subjectRef: 'group:default/platform',
          subjectType: 'group',
          totalXp: 500,
        },
      ],
    });

    expect(mockRepo.getTopSubjectsByXp).toHaveBeenCalledWith({
      subjectType: 'group',
      limit: 1,
    });
  });
});
