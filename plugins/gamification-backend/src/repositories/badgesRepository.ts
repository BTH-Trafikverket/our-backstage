import type { Knex } from 'knex';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';

export type BadgeRow = {
  id: string;
  title: string;
  description: string;
  subject_type: QuestSubjectType;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

export type BadgeCriteriaRow = {
  badge_id: string;
  quest_id: string;
  target_count: number;
};

export type BadgeProgressRow = BadgeRow & {
  earned_at: Date | null;
  is_earned: boolean;
};

export type CreateBadgeRow = {
  title: string;
  description: string;
  subject_type: QuestSubjectType;
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
        subject_type: data.subject_type,
      })
      .returning('*');

    return rows[0];
  }

  async getBadges(
    searchTitle?: string,
    options?: { includeArchived?: boolean },
  ): Promise<BadgeRow[]> {
    let query = this.db<BadgeRow>('badges').select('*');

    if (!options?.includeArchived) {
      query = query.whereNull('archived_at');
    }

    if (searchTitle) {
      query = query.where('title', 'ilike', `%${searchTitle}%`);
    }

    return query.orderBy('created_at', 'desc');
  }

  async getBadgeProgress(subjectRefs: string[]): Promise<BadgeProgressRow[]> {
    const refs = [
      ...new Set(subjectRefs.map(ref => ref.trim()).filter(Boolean)),
    ];
    const subjectTypes = [
      ...new Set(
        refs.flatMap(ref => {
          if (ref.startsWith('group:')) {
            return ['team' as const];
          }
          if (ref.startsWith('user:')) {
            return ['user' as const];
          }
          return [];
        }),
      ),
    ];

    if (refs.length === 0 || subjectTypes.length === 0) {
      return [];
    }

    const rows = await this.db<BadgeRow>('badges')
      .leftJoin('earned_badges', function joinEarnedBadges() {
        this.on('earned_badges.badge_id', '=', 'badges.id').onIn(
          'earned_badges.subject_ref',
          refs,
        );
      })
      .select(
        'badges.*',
        this.db.raw(
          'COALESCE(BOOL_OR(earned_badges.earned_at IS NOT NULL), FALSE) AS is_earned, MIN(earned_badges.earned_at) AS earned_at',
        ),
      )
      .where(function whereVisibleBadges() {
        this.where(function whereActiveApplicableBadges() {
          this.whereNull('badges.archived_at').whereIn(
            'badges.subject_type',
            subjectTypes,
          );
        }).orWhereNotNull('earned_badges.earned_at');
      })
      .groupBy([
        'badges.id',
        'badges.title',
        'badges.description',
        'badges.subject_type',
        'badges.created_at',
        'badges.updated_at',
        'badges.archived_at',
      ])
      .orderByRaw('earned_at DESC NULLS LAST, badges.created_at DESC');

    return rows as BadgeProgressRow[];
  }

  async getBadgeById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<BadgeRow | undefined> {
    let query = this.db<BadgeRow>('badges').where({ id });

    if (!options?.includeArchived) {
      query = query.whereNull('archived_at');
    }

    return query.first();
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
    if (data.subject_type !== undefined) {
      updateData.subject_type = data.subject_type;
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
    const rows = await this.db<BadgeRow>('badges')
      .where({ id })
      .whereNull('archived_at')
      .update({ archived_at: this.db.fn.now() })
      .returning('id');

    return rows.length > 0;
  }
}
