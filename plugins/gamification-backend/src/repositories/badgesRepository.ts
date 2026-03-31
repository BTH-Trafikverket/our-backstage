import type { Knex } from 'knex';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';

export type BadgeRow = {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  subject_type: QuestSubjectType;
  image_id: number | null;
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
  progress_percent: number;
  completed_requirements?: number;
  total_requirements?: number;
  progress_percent_total?: number;
  criteria_progress_percent?: number;
  progress_subject_ref?: string | null;
};

export type BadgeProgressSortField =
  | 'earned_at'
  | 'created_at'
  | 'title'
  | 'xp_reward'
  | 'progress_percent';
export type BadgeAdminSortField =
  | 'created_at'
  | 'title'
  | 'xp_reward'
  | 'criteria_count'
  | 'status';
export type BadgeSortOrder = 'asc' | 'desc';
export type BadgeProgressStatusFilter = 'active' | 'earned' | 'all';

export type BadgePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedBadgesResult<T> = {
  data: T[];
  pagination: BadgePagination;
};

export type CreateBadgeRow = {
  title: string;
  description: string;
  xp_reward: number;
  subject_type: QuestSubjectType;
  image_id?: number | null;
};

export type UpdateBadgeRow = Partial<CreateBadgeRow>;

export type CriteriaProgressRow = {
  badge_id: string;
  quest_id: string;
  target_count: number;
  quest_title: string;
  quest_target_count: number;
  completion_policy: string;
  subject_ref: string;
  completion_count: number;
};

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
        xp_reward: data.xp_reward,
        subject_type: data.subject_type,
        image_id: data.image_id,
      })
      .returning('*');

    return rows[0];
  }

  private getSafePagination(page = 1, limit = 10) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;

    return { safePage, safeLimit, offset };
  }

  async getPaginatedBadges(params?: {
    searchTitle?: string;
    includeArchived?: boolean;
    sortBy?: BadgeAdminSortField;
    order?: BadgeSortOrder;
    page?: number;
    limit?: number;
  }): Promise<PaginatedBadgesResult<BadgeRow>> {
    const {
      searchTitle,
      includeArchived,
      sortBy = 'created_at',
      order = 'desc',
      page = 1,
      limit = 10,
    } = params ?? {};
    const { safePage, safeLimit, offset } = this.getSafePagination(page, limit);
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    let query = this.db<BadgeRow>('badges').select('*');

    if (!includeArchived) {
      query = query.whereNull('archived_at');
    }

    if (searchTitle) {
      query = query.where('title', 'ilike', `%${searchTitle}%`);
    }

    const resultsQuery = query
      .clone()
      .select(this.db.raw('COUNT(*) OVER() as full_count'));

    if (sortBy === 'criteria_count') {
      resultsQuery.orderByRaw(
        `(SELECT COUNT(*) FROM badge_criteria WHERE badge_criteria.badge_id = badges.id) ${
          sortOrder === 'asc' ? 'ASC' : 'DESC'
        }`,
      );
      resultsQuery.orderBy('badges.created_at', sortOrder);
      resultsQuery.orderBy('badges.id', sortOrder);
    } else if (sortBy === 'status') {
      resultsQuery.orderByRaw(
        `CASE WHEN badges.archived_at IS NULL THEN 0 ELSE 1 END ${
          sortOrder === 'asc' ? 'ASC' : 'DESC'
        }`,
      );
      resultsQuery.orderBy('badges.archived_at', sortOrder);
      resultsQuery.orderBy('badges.created_at', sortOrder);
      resultsQuery.orderBy('badges.id', sortOrder);
    } else {
      resultsQuery.orderBy(`badges.${sortBy}`, sortOrder);
      if (sortBy !== 'created_at') {
        resultsQuery.orderBy('badges.created_at', sortOrder);
      }
      resultsQuery.orderBy('badges.id', sortOrder);
    }

    const results = await resultsQuery.limit(safeLimit).offset(offset);

    let total =
      results.length > 0 ? Number((results[0] as any).full_count || 0) : 0;

    if (results.length === 0 && safePage > 1) {
      const countRow = await query
        .clone()
        .count<{ count: string }[]>({ count: '*' })
        .first();

      total = Number(countRow?.count ?? 0);
    }

    const totalPages = Math.ceil(total / safeLimit) || 0;
    const data = results.map(row => {
      const { full_count, ...rest } = row as any;
      return rest as BadgeRow;
    });

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };
  }

  async getPaginatedBadgeProgress(
    subjectRefs: string[],
    params?: {
      searchTitle?: string;
      sortBy?: BadgeProgressSortField;
      order?: BadgeSortOrder;
      status?: BadgeProgressStatusFilter;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedBadgesResult<BadgeProgressRow>> {
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
    const {
      searchTitle,
      sortBy = 'earned_at',
      order = 'desc',
      status = 'active',
      page = 1,
      limit = 10,
    } = params ?? {};
    const { safePage, safeLimit, offset } = this.getSafePagination(page, limit);

    if (refs.length === 0 || subjectTypes.length === 0) {
      return {
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const baseQuery = this.db<BadgeRow>('badges')
      .leftJoin('earned_badges', function joinEarnedBadges() {
        this.on('earned_badges.badge_id', '=', 'badges.id').onIn(
          'earned_badges.subject_ref',
          refs,
        );
      })
      .modify(query => {
        if (searchTitle) {
          query.where('badges.title', 'ilike', `%${searchTitle}%`);
        }
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
        'badges.xp_reward',
        'badges.subject_type',
        'badges.created_at',
        'badges.updated_at',
        'badges.archived_at',
      ]);

    const visibleBadgeIdsQuery = baseQuery
      .clone()
      .clearSelect()
      .select('badges.id');

    const completedMilestonesExpr = `FLOOR(COALESCE(quest_progress.completion_count, 0)::numeric / GREATEST(1, quests.target_count))`;

    const subjectProgressQuery = this.db('badge_criteria as badge_criteria')
      .joinRaw(
        'CROSS JOIN unnest(?::text[]) as requested_subjects(subject_ref)',
        [refs],
      )
      .join('quests', 'quests.id', 'badge_criteria.quest_id')
      .leftJoin('quest_progress', function joinProgress() {
        this.on(
          'quest_progress.quest_id',
          '=',
          'badge_criteria.quest_id',
        ).andOn(
          'quest_progress.subject_ref',
          '=',
          'requested_subjects.subject_ref',
        );
      })
      .whereExists(query => {
        query
          .select(this.db.raw('1'))
          .from(visibleBadgeIdsQuery.as('visible'))
          .whereRaw('visible.id = badge_criteria.badge_id');
      })
      .select(
        'badge_criteria.badge_id',
        'requested_subjects.subject_ref',
        this.db.raw(
          `SUM(CASE WHEN ${completedMilestonesExpr} >= badge_criteria.target_count THEN 1 ELSE 0 END)::int as completed_requirements`,
        ),
        this.db.raw('COUNT(*)::int as total_requirements'),
        this.db.raw(
          `SUM(CASE WHEN badge_criteria.target_count > 0 THEN LEAST(100, ROUND((${completedMilestonesExpr} * 100) / badge_criteria.target_count)) ELSE 0 END)::int as progress_percent_total`,
        ),
        this.db.raw(
          `SUM(${completedMilestonesExpr})::bigint as completion_count_total`,
        ),
      )
      .groupBy(['badge_criteria.badge_id', 'requested_subjects.subject_ref']);

    const rankedProgressQuery = this.db
      .from(subjectProgressQuery.as('subject_progress'))
      .select(
        'subject_progress.badge_id',
        'subject_progress.subject_ref',
        'subject_progress.completed_requirements',
        'subject_progress.total_requirements',
        'subject_progress.progress_percent_total',
        'subject_progress.completion_count_total',
        this.db.raw(
          'CASE WHEN subject_progress.total_requirements > 0 THEN ROUND((subject_progress.completed_requirements::numeric * 100) / subject_progress.total_requirements) ELSE 0 END::int as progress_percent',
        ),
        this.db.raw(
          'CASE WHEN subject_progress.total_requirements > 0 THEN ROUND((subject_progress.progress_percent_total::numeric) / subject_progress.total_requirements) ELSE 0 END::int as criteria_progress_percent',
        ),
        this.db.raw(
          'ROW_NUMBER() OVER (PARTITION BY subject_progress.badge_id ORDER BY subject_progress.completed_requirements DESC, CASE WHEN subject_progress.total_requirements > 0 THEN ROUND((subject_progress.progress_percent_total::numeric) / subject_progress.total_requirements) ELSE 0 END DESC, CASE WHEN subject_progress.total_requirements > 0 THEN ROUND((subject_progress.completed_requirements::numeric * 100) / subject_progress.total_requirements) ELSE 0 END DESC, subject_progress.progress_percent_total DESC, subject_progress.completion_count_total DESC, subject_progress.subject_ref ASC) as progress_rank',
        ),
      );

    const filteredResultsQuery = this.db
      .from(baseQuery.as('badge_rows'))
      .leftJoin(rankedProgressQuery.as('ranked_progress'), join => {
        join
          .on('ranked_progress.badge_id', '=', 'badge_rows.id')
          .andOn(this.db.raw('ranked_progress.progress_rank = 1'));
      })
      .select(
        'badge_rows.*',
        this.db.raw(
          'COALESCE(ranked_progress.completed_requirements, 0) as completed_requirements',
        ),
        this.db.raw(
          'COALESCE(ranked_progress.total_requirements, 0) as total_requirements',
        ),
        this.db.raw(
          'COALESCE(ranked_progress.progress_percent, 0) as progress_percent',
        ),
        this.db.raw(
          'COALESCE(ranked_progress.progress_percent_total, 0) as progress_percent_total',
        ),
        this.db.raw(
          'COALESCE(ranked_progress.criteria_progress_percent, 0) as criteria_progress_percent',
        ),
        'ranked_progress.subject_ref as progress_subject_ref',
      );

    if (status === 'active') {
      filteredResultsQuery.where('badge_rows.is_earned', false);
    } else if (status === 'earned') {
      filteredResultsQuery.where('badge_rows.is_earned', true);
    }

    if (sortBy === 'earned_at') {
      filteredResultsQuery.orderByRaw(
        `badge_rows.earned_at ${
          order === 'asc' ? 'ASC NULLS FIRST' : 'DESC NULLS LAST'
        }`,
      );
      filteredResultsQuery.orderBy('badge_rows.created_at', order);
      filteredResultsQuery.orderBy('badge_rows.id', order);
    } else if (sortBy === 'progress_percent') {
      filteredResultsQuery.orderBy('completed_requirements', order);
      filteredResultsQuery.orderBy('criteria_progress_percent', order);
      filteredResultsQuery.orderBy('progress_percent', order);
      filteredResultsQuery.orderBy('progress_percent_total', order);
      filteredResultsQuery.orderBy('badge_rows.created_at', order);
      filteredResultsQuery.orderBy('badge_rows.id', order);
    } else {
      filteredResultsQuery.orderBy(`badge_rows.${sortBy}`, order);
      if (sortBy !== 'created_at') {
        filteredResultsQuery.orderBy('badge_rows.created_at', order);
      }
      filteredResultsQuery.orderBy('badge_rows.id', order);
    }

    const results = await filteredResultsQuery
      .clone()
      .select(this.db.raw('COUNT(*) OVER() as full_count'))
      .limit(safeLimit)
      .offset(offset);

    let total =
      results.length > 0 ? Number((results[0] as any).full_count || 0) : 0;

    if (results.length === 0 && safePage > 1) {
      const countRow = await this.db
        .from(
          filteredResultsQuery
            .clone()
            .clearSelect()
            .clearOrder()
            .as('filtered_badge_rows'),
        )
        .count<{ count: string }[]>({ count: '*' })
        .first();

      total = Number(countRow?.count ?? 0);
    }

    const totalPages = Math.ceil(total / safeLimit) || 0;
    const data = results.map(row => {
      const { full_count, ...rest } = row as any;
      return rest as BadgeProgressRow;
    });

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };
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
    if (data.xp_reward !== undefined) {
      updateData.xp_reward = data.xp_reward;
    }
    if (data.subject_type !== undefined) {
      updateData.subject_type = data.subject_type;
    }
    if (data.image_id !== undefined) {
      updateData.image_id = data.image_id;
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

  async getCriteriaProgressForBadges(
    badgeIds: string[],
    subjectRefs: string[],
  ): Promise<CriteriaProgressRow[]> {
    const refs = [
      ...new Set(subjectRefs.map(ref => ref.trim()).filter(Boolean)),
    ];

    if (badgeIds.length === 0 || refs.length === 0) {
      return [];
    }

    return this.db('badge_criteria')
      .joinRaw(
        'CROSS JOIN unnest(?::text[]) as requested_subjects(subject_ref)',
        [refs],
      )
      .join('quests', 'quests.id', 'badge_criteria.quest_id')
      .leftJoin('quest_progress', function joinProgress() {
        this.on(
          'quest_progress.quest_id',
          '=',
          'badge_criteria.quest_id',
        ).andOn(
          'quest_progress.subject_ref',
          '=',
          'requested_subjects.subject_ref',
        );
      })
      .whereIn('badge_criteria.badge_id', badgeIds)
      .select(
        'badge_criteria.badge_id',
        'badge_criteria.quest_id',
        'badge_criteria.target_count',
        'quests.title as quest_title',
        'quests.target_count as quest_target_count',
        'quests.completion_policy',
        'requested_subjects.subject_ref',
        this.db.raw(
          'COALESCE(quest_progress.completion_count, 0) as completion_count',
        ),
      )
      .orderBy([
        { column: 'badge_criteria.badge_id', order: 'asc' },
        { column: 'requested_subjects.subject_ref', order: 'asc' },
        { column: 'badge_criteria.quest_id', order: 'asc' },
      ]);
  }

  async deleteBadge(id: string): Promise<boolean> {
    const rows = await this.db<BadgeRow>('badges')
      .where({ id })
      .whereNull('archived_at')
      .update({ archived_at: this.db.fn.now() })
      .returning('id');

    return rows.length > 0;
  }
  async createBadgeImage(image: string) {
    return this.db('badge_images').insert({ image }).returning(['id', 'image']);
  }

  async getBadgeImages() {
    return this.db('badge_images')
      .select('id', 'image')
      .orderBy('created_at', 'desc');
  }
}
