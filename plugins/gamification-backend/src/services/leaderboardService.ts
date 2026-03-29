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

export type LeaderboardResponse = {
  subjectType: LeaderboardSubjectType;
  limit: number;
  entries: LeaderboardEntry[];
};

export class LeaderboardService {
  constructor(
    private readonly repo: LeaderboardRepository,
    private readonly defaultLimit: number = 25,
  ) {}

  async getLeaderboard(
    subjectType: LeaderboardSubjectType,
  ): Promise<LeaderboardResponse> {
    const limit = Math.max(1, this.defaultLimit);
    const rows = await this.repo.getTopSubjectsByXp({ subjectType, limit });

    return {
      subjectType,
      limit,
      entries: rows.map((row, index) => ({
        rank: index + 1,
        subjectRef: row.subject_ref,
        subjectType,
        totalXp: row.total_xp,
      })),
    };
  }
}
