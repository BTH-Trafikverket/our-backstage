import type { Knex } from 'knex';

export class XpRepository {
  constructor(private readonly db: Knex) {}

  async getTotalXp(subjectRef: string): Promise<number> {
    const row = await this.db('xp_awards')
      .where({ subject_ref: subjectRef })
      .sum<{ sum: string | null }>({ sum: 'xp_amount' })
      .first();

    return row?.sum ? Number(row.sum) : 0;
  }
}
