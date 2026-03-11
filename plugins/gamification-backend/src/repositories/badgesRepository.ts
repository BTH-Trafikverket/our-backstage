import type { Knex } from 'knex';

export type BadgeRow = {
  id: string;
  title: string;
  description: string;
  created_at: Date;
  updated_at: Date;
};

export type BadgeCriteriaRow = {
  badge_id: string;
  quest_id: string;
  target_count: number;
};

export type CreateBadgeRow = {
  title: string;
  description: string;
};

export type UpdateBadgeRow = Partial<CreateBadgeRow>;

export class BadgesRepository {
  private readonly db: Knex | Knex.Transaction;

  constructor(db: Knex | Knex.Transaction) {
    this.db = db;
  }

  async withTransaction<T>(
    fn: (repo: BadgesRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx => fn(new BadgesRepository(trx)));
  }

  async createBadge(data: CreateBadgeRow): Promise<BadgeRow> {
    const rows = await this.db<BadgeRow>('badges')
      .insert({
        title: data.title,
        description: data.description,
      })
      .returning('*');

    return rows[0];
  }

  async getBadges(): Promise<BadgeRow[]> {
    return this.db<BadgeRow>('badges')
      .select('*')
      .orderBy('created_at', 'desc');
  }

  async getBadgeById(id: string): Promise<BadgeRow | undefined> {
    return this.db<BadgeRow>('badges').where({ id }).first();
  }

  async getBadgeCriteria(badgeId: string): Promise<BadgeCriteriaRow[]> {
    return this.db<BadgeCriteriaRow>('badge_criteria')
      .where({ badge_id: badgeId })
      .select('*')
      .orderBy('quest_id', 'asc');
  }

  async getCriteriaForBadges(badgeIds: string[]): Promise<BadgeCriteriaRow[]> {
    if (badgeIds.length === 0) {
      return [];
    }

    return this.db<BadgeCriteriaRow>('badge_criteria')
      .whereIn('badge_id', badgeIds)
      .select('*')
      .orderBy([
        { column: 'badge_id', order: 'asc' },
        { column: 'quest_id', order: 'asc' },
      ]);
  }

  async insertBadgeCriteria(
    badgeId: string,
    criterias: Array<{ quest_id: string; target_count: number }>,
  ): Promise<void> {
    if (criterias.length === 0) {
      return;
    }

    await this.db<BadgeCriteriaRow>('badge_criteria').insert(
      criterias.map(criteria => ({
        badge_id: badgeId,
        quest_id: criteria.quest_id,
        target_count: criteria.target_count,
      })),
    );
  }

  async replaceBadgeCriteria(
    badgeId: string,
    criterias: Array<{ quest_id: string; target_count: number }>,
  ): Promise<void> {
    await this.db<BadgeCriteriaRow>('badge_criteria')
      .where({ badge_id: badgeId })
      .del();

    await this.insertBadgeCriteria(badgeId, criterias);
  }

  async updateBadge(
    id: string,
    data: UpdateBadgeRow,
  ): Promise<BadgeRow | undefined> {
    const updateData: UpdateBadgeRow = {};

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    const rows = await this.db<BadgeRow>('badges')
      .where({ id })
      .update(updateData)
      .returning('*');

    return rows[0];
  }

  async touchBadge(id: string): Promise<BadgeRow | undefined> {
    const rows = await this.db<BadgeRow>('badges')
      .where({ id })
      .update({ updated_at: this.db.fn.now() })
      .returning('*');

    return rows[0];
  }

  async deleteBadge(id: string): Promise<boolean> {
    const deletedCount = await this.db('badges').where({ id }).del();
    return deletedCount > 0;
  }
}
