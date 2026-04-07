import type { Knex } from 'knex';

export type SubjectXpStateRow = {
  subject_ref: string;
  total_xp: number;
  level: number;
  current_level_xp: number;
  next_level_xp: number;
  updated_at: Date;
};

export class XpRepository {
  constructor(private readonly db: Knex) {}

  async getSubjectState(subjectRef: string): Promise<SubjectXpStateRow> {
    const snapshot = await this.db<SubjectXpStateRow>('subject_xp_state')
      .where({ subject_ref: subjectRef })
      .first();

    if (snapshot) {
      return {
        ...snapshot,
        total_xp: Number(snapshot.total_xp ?? 0),
        level: Number(snapshot.level ?? 1),
        current_level_xp: Number(snapshot.current_level_xp ?? 0),
        next_level_xp: Number(snapshot.next_level_xp ?? 100),
      };
    }

    const computed = await this.db
      .select(
        this.db.raw('? as subject_ref', [subjectRef]),
        'aggregated.total_xp',
        'computed.level',
        'computed.current_level_xp',
        'computed.next_level_xp',
      )
      .from(
        this.db.raw(
          `(SELECT COALESCE(SUM(xp_amount), 0)::INTEGER AS total_xp
            FROM xp_awards
            WHERE subject_ref = ?) AS aggregated`,
          [subjectRef],
        ),
      )
      .joinRaw(
        'CROSS JOIN LATERAL compute_subject_xp_state(aggregated.total_xp) AS computed',
      )
      .first<SubjectXpStateRow>();

    return {
      subject_ref: subjectRef,
      total_xp: Number(computed?.total_xp ?? 0),
      level: Number(computed?.level ?? 1),
      current_level_xp: Number(computed?.current_level_xp ?? 0),
      next_level_xp: Number(computed?.next_level_xp ?? 100),
      updated_at: computed?.updated_at ?? new Date(0),
    };
  }

  async getTotalXp(subjectRef: string): Promise<number> {
    const row = await this.getSubjectState(subjectRef);
    return row.total_xp;
  }
}
