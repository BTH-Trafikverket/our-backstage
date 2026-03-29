import type { Knex } from 'knex';

export type LeaderboardSubjectType = 'user' | 'group';

export type LeaderboardRow = {
  subject_ref: string;
  total_xp: number;
};

export type LeaderboardPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type LeaderboardPage = {
  data: LeaderboardRow[];
  pagination: LeaderboardPagination;
};

export class LeaderboardRepository {
  constructor(private readonly db: Knex) {}

  async getLeaderboardPage(options: {
    subjectType: LeaderboardSubjectType;
    page: number;
    limit: number;
  }): Promise<LeaderboardPage> {
    const prefix = options.subjectType === 'group' ? 'group:' : 'user:';
    const offset = (options.page - 1) * options.limit;
    const groupedQuery = this.db('xp_awards')
      .select('subject_ref')
      .sum<{ subject_ref: string; total_xp: string | number | null }[]>({
        total_xp: 'xp_amount',
      })
      .where('subject_ref', 'like', `${prefix}%`)
      .groupBy('subject_ref');

    const rows = await groupedQuery
      .clone()
      .orderByRaw('SUM(xp_amount) DESC')
      .orderBy('subject_ref', 'asc')
      .offset(offset)
      .limit(options.limit);

    const totalRow = await this.db
      .from(groupedQuery.clone().as('leaderboard_entries'))
      .count<{ count: string | number }>({ count: '*' })
      .first();

    const total = Number(totalRow?.count ?? 0);
    const totalPages = total > 0 ? Math.ceil(total / options.limit) : 0;

    return {
      data: rows.map(row => ({
        subject_ref: row.subject_ref,
        total_xp: Number(row.total_xp ?? 0),
      })),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages,
      },
    };
  }
}
