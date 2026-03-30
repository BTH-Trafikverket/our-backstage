import type {
  LeaderboardRepository,
  LeaderboardSubjectType,
  LeaderboardTimeRange,
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
  timeRange: LeaderboardTimeRange;
  data: LeaderboardEntry[];
  pagination: LeaderboardPagination;
};

type TimeRangeWindow = {
  createdAtGte?: Date;
  createdAtLt?: Date;
};

export class LeaderboardService {
  constructor(
    private readonly repo: LeaderboardRepository,
    private readonly defaultLimit: number = 25,
    private readonly maxLimit: number = 100,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private getTimeRangeWindow(timeRange: LeaderboardTimeRange): TimeRangeWindow {
    if (timeRange === 'alltime') {
      return {};
    }

    const now = this.now();

    if (timeRange === 'monthly') {
      return {
        createdAtGte: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        ),
        createdAtLt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ),
      };
    }

    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dayOfWeek = startOfTodayUtc.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeekUtc = new Date(startOfTodayUtc);
    startOfWeekUtc.setUTCDate(startOfWeekUtc.getUTCDate() - daysSinceMonday);

    const startOfNextWeekUtc = new Date(startOfWeekUtc);
    startOfNextWeekUtc.setUTCDate(startOfNextWeekUtc.getUTCDate() + 7);

    return {
      createdAtGte: startOfWeekUtc,
      createdAtLt: startOfNextWeekUtc,
    };
  }

  async getLeaderboard(options: {
    subjectType: LeaderboardSubjectType;
    timeRange?: LeaderboardTimeRange;
    page?: number;
    limit?: number;
  }): Promise<PaginatedLeaderboardResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      this.maxLimit,
      Math.max(1, options.limit ?? this.defaultLimit),
    );
    const timeRange = options.timeRange ?? 'alltime';
    const window = this.getTimeRangeWindow(timeRange);

    const leaderboardPage = await this.repo.getLeaderboardPage({
      subjectType: options.subjectType,
      page,
      limit,
      ...window,
    });
    const rankOffset = (page - 1) * limit;

    return {
      subjectType: options.subjectType,
      timeRange,
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
