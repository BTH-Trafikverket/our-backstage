import type { Knex } from 'knex';

export class XpRepository {
  constructor(private readonly db: Knex) {}

  async getTotalXp(userRef: string): Promise<number> {
    const row = await this.db('xp_ledger')
      .where({ user_ref: userRef })
      .sum<{ sum: string | null }>({ sum: 'xp_amount' })
      .first();

    return row?.sum ? Number(row.sum) : 0;
  }
}
