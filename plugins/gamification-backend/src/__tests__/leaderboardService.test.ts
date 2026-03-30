import type { LeaderboardRepository } from '../repositories/leaderboardRepository';
import { LeaderboardService } from '../services/leaderboardService';

describe('LeaderboardService', () => {
  let mockRepo: jest.Mocked<LeaderboardRepository>;
  let service: LeaderboardService;

  beforeEach(() => {
    mockRepo = {
      getLeaderboardPage: jest.fn(),
    } as unknown as jest.Mocked<LeaderboardRepository>;

    service = new LeaderboardService(
      mockRepo,
      25,
      100,
      () => new Date('2026-04-03T12:00:00Z'),
      'Europe/Stockholm',
    );
  });

  it('returns ranked user leaderboard entries with pagination metadata', async () => {
    mockRepo.getLeaderboardPage.mockResolvedValue({
      data: [
        { subject_ref: 'user:default/alice', total_xp: 320 },
        { subject_ref: 'user:default/bob', total_xp: 180 },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });

    await expect(
      service.getLeaderboard({ subjectType: 'user' }),
    ).resolves.toEqual({
      subjectType: 'user',
      timeRange: 'alltime',
      data: [
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
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });

    expect(mockRepo.getLeaderboardPage).toHaveBeenCalledWith({
      subjectType: 'user',
      page: 1,
      limit: 25,
    });
  });

  it('calculates ranks from the requested page offset', async () => {
    mockRepo.getLeaderboardPage.mockResolvedValue({
      data: [
        { subject_ref: 'group:default/platform', total_xp: 500 },
        { subject_ref: 'group:default/core', total_xp: 450 },
      ],
      pagination: {
        page: 2,
        limit: 15,
        total: 32,
        totalPages: 3,
      },
    });

    await expect(
      service.getLeaderboard({
        subjectType: 'group',
        page: 2,
        limit: 15,
      }),
    ).resolves.toEqual({
      subjectType: 'group',
      timeRange: 'alltime',
      data: [
        {
          rank: 16,
          subjectRef: 'group:default/platform',
          subjectType: 'group',
          totalXp: 500,
        },
        {
          rank: 17,
          subjectRef: 'group:default/core',
          subjectType: 'group',
          totalXp: 450,
        },
      ],
      pagination: {
        page: 2,
        limit: 15,
        total: 32,
        totalPages: 3,
      },
    });

    expect(mockRepo.getLeaderboardPage).toHaveBeenCalledWith({
      subjectType: 'group',
      page: 2,
      limit: 15,
    });
  });

  it('clamps the requested limit to the configured bounds', async () => {
    const customService = new LeaderboardService(
      mockRepo,
      25,
      100,
      () => new Date('2026-04-03T12:00:00Z'),
      'Europe/Stockholm',
    );
    mockRepo.getLeaderboardPage.mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 0,
      },
    });

    await customService.getLeaderboard({
      subjectType: 'user',
      page: 0,
      limit: 1000,
    });

    expect(mockRepo.getLeaderboardPage).toHaveBeenCalledWith({
      subjectType: 'user',
      page: 1,
      limit: 100,
    });
  });

  it('maps monthly to the current UTC calendar month window', async () => {
    mockRepo.getLeaderboardPage.mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
      },
    });

    await customCall(service, {
      subjectType: 'user',
      timeRange: 'monthly',
    });

    expect(mockRepo.getLeaderboardPage).toHaveBeenCalledWith({
      subjectType: 'user',
      page: 1,
      limit: 25,
      createdAtGte: new Date('2026-03-31T22:00:00.000Z'),
      createdAtLt: new Date('2026-04-30T22:00:00.000Z'),
    });
  });

  it('maps weekly to the current UTC week window', async () => {
    mockRepo.getLeaderboardPage.mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
      },
    });

    await customCall(service, {
      subjectType: 'group',
      timeRange: 'weekly',
    });

    expect(mockRepo.getLeaderboardPage).toHaveBeenCalledWith({
      subjectType: 'group',
      page: 1,
      limit: 25,
      createdAtGte: new Date('2026-03-29T22:00:00.000Z'),
      createdAtLt: new Date('2026-04-05T22:00:00.000Z'),
    });
  });
});

async function customCall(
  service: LeaderboardService,
  options: Parameters<LeaderboardService['getLeaderboard']>[0],
) {
  return service.getLeaderboard(options);
}
