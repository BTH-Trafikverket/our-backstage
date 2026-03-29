import type {
  LeaderboardRepository,
  LeaderboardSubjectType,
} from '../repositories/leaderboardRepository';

export type LeaderboardEntry = {
  rank: number;
  subjectRef: string;
  subjectType: LeaderboardSubjectType;
  totalXp: number;
};

export type LeaderboardPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedLeaderboardResponse = {
  subjectType: LeaderboardSubjectType;
  data: LeaderboardEntry[];
  pagination: LeaderboardPagination;
};

export class LeaderboardService {
  constructor(
    private readonly repo: LeaderboardRepository,
    private readonly defaultLimit: number = 25,
    private readonly maxLimit: number = 100,
  ) {}

  async getLeaderboard(options: {
    subjectType: LeaderboardSubjectType;
    page?: number;
    limit?: number;
  }): Promise<PaginatedLeaderboardResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      this.maxLimit,
      Math.max(1, options.limit ?? this.defaultLimit),
    );
    const leaderboardPage = await this.repo.getLeaderboardPage({
      subjectType: options.subjectType,
      page,
      limit,
    });
    const rankOffset = (page - 1) * limit;

    return {
      subjectType: options.subjectType,
      data: leaderboardPage.data.map((row, index) => ({
        rank: rankOffset + index + 1,
        subjectRef: row.subject_ref,
        subjectType: options.subjectType,
        totalXp: row.total_xp,
      })),
      pagination: leaderboardPage.pagination,
    };
  }
}
