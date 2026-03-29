import type { Knex } from 'knex';

export type LeaderboardSubjectType = 'user' | 'group';

export type LeaderboardRow = {
  subject_ref: string;
  total_xp: number;
};

export class LeaderboardRepository {
  constructor(private readonly db: Knex) {}

  async getTopSubjectsByXp(options: {
    subjectType: LeaderboardSubjectType;
    limit: number;
  }): Promise<LeaderboardRow[]> {
    const prefix = options.subjectType === 'group' ? 'group:' : 'user:';

    const rows = await this.db('xp_awards')
      .select('subject_ref')
      .sum<{ subject_ref: string; total_xp: string | number | null }[]>({
        total_xp: 'xp_amount',
      })
      .where('subject_ref', 'like', `${prefix}%`)
      .groupBy('subject_ref')
      .orderByRaw('SUM(xp_amount) DESC')
      .orderBy('subject_ref', 'asc')
      .limit(options.limit);

    return rows.map(row => ({
      subject_ref: row.subject_ref,
      total_xp: Number(row.total_xp ?? 0),
    }));
  }
}
