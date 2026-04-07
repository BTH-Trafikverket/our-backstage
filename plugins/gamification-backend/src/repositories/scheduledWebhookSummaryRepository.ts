import type { Knex } from 'knex';
import { LeaderboardRepository } from './leaderboardRepository';

type LeaderboardEntry = {
  rank: number;
  subject_ref: string;
  subject_name: string;
  total_xp: number;
};

function getSubjectName(subjectRef: string): string {
  const [, rest = ''] = subjectRef.split(':', 2);
  const [, name = subjectRef] = rest.split('/', 2);
  return name || subjectRef;
}

export class ScheduledWebhookSummaryRepository {
  private readonly leaderboardRepo: LeaderboardRepository;

  constructor(private readonly db: Knex | Knex.Transaction) {
    this.leaderboardRepo = new LeaderboardRepository(this.db as Knex);
  }

  async getSummary(options: {
    periodStart: Date;
    periodEndExclusive: Date;
  }): Promise<Record<string, unknown>> {
    const [
      totalQuestsRow,
      totalBadgesRow,
      totalXpRow,
      topUsersPage,
      topTeamsPage,
    ] = await Promise.all([
      this.db('domain_events')
        .where({ event_name: 'quest.completed' })
        .andWhere('occurred_at', '>=', options.periodStart)
        .andWhere('occurred_at', '<', options.periodEndExclusive)
        .count<{ count: string | number }>({ count: '*' })
        .first(),
      this.db('domain_events')
        .where({ event_name: 'badge.earned' })
        .andWhere('occurred_at', '>=', options.periodStart)
        .andWhere('occurred_at', '<', options.periodEndExclusive)
        .count<{ count: string | number }>({ count: '*' })
        .first(),
      this.db('xp_awards')
        .where('created_at', '>=', options.periodStart)
        .andWhere('created_at', '<', options.periodEndExclusive)
        .sum<{ sum: string | number | null }>({ sum: 'xp_amount' })
        .first(),
      this.leaderboardRepo.getLeaderboardPage({
        subjectType: 'user',
        page: 1,
        limit: 3,
        createdAtGte: options.periodStart,
        createdAtLt: options.periodEndExclusive,
      }),
      this.leaderboardRepo.getLeaderboardPage({
        subjectType: 'group',
        page: 1,
        limit: 3,
        createdAtGte: options.periodStart,
        createdAtLt: options.periodEndExclusive,
      }),
    ]);

    const topUsers = topUsersPage.data.map((row, index) => ({
      rank: index + 1,
      subject_ref: row.subject_ref,
      subject_name: getSubjectName(row.subject_ref),
      total_xp: row.total_xp,
    }));
    const topTeams = topTeamsPage.data.map((row, index) => ({
      rank: index + 1,
      subject_ref: row.subject_ref,
      subject_name: getSubjectName(row.subject_ref),
      total_xp: row.total_xp,
    }));

    return {
      total_quests_completed: Number(totalQuestsRow?.count ?? 0),
      total_badges_earned: Number(totalBadgesRow?.count ?? 0),
      total_badges_completed: Number(totalBadgesRow?.count ?? 0),
      total_xp_awarded: Number(totalXpRow?.sum ?? 0),
      total_xp_overall: Number(totalXpRow?.sum ?? 0),
      top_users: topUsers,
      top_teams: topTeams,
      ...this.flattenLeaderboardEntries('user', topUsers),
      ...this.flattenLeaderboardEntries('team', topTeams),
    };
  }

  private flattenLeaderboardEntries(
    label: 'user' | 'team',
    entries: LeaderboardEntry[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (let rank = 1; rank <= 3; rank += 1) {
      const entry = entries[rank - 1];
      result[`top_${rank}_${label}_name`] = entry?.subject_name ?? null;
      result[`top_${rank}_${label}_ref`] = entry?.subject_ref ?? null;
      result[`top_${rank}_${label}_xp`] = entry?.total_xp ?? null;
    }

    if (entries[0]) {
      result[`top_${label}_name`] = entries[0].subject_name;
      result[`top_${label}_ref`] = entries[0].subject_ref;
      result[`top_${label}_xp`] = entries[0].total_xp;
    } else {
      result[`top_${label}_name`] = null;
      result[`top_${label}_ref`] = null;
      result[`top_${label}_xp`] = null;
    }

    return result;
  }
}
