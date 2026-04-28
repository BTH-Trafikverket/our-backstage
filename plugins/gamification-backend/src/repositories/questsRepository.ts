import type { Knex } from 'knex';
import type { QuestEditSchema } from '../schemas/quests/questEditSchema';
import type {
  CatalogCondition,
  CatalogRule,
  CompletionPolicy,
  QuestMode,
  QuestSubjectType,
} from '../schemas/quests/questCreationSchema';

export type QuestReminderConfig = {
  description: string;
  day: number;
};

export type LinkedQuestConfig = {
  catalog_condition?: CatalogCondition;
  catalog_rule?: CatalogRule;
  reminder?: QuestReminderConfig;
};

export type QuestRow = {
  id: string;
  title: string;
  description: string;
  target_count: number;
  xp_reward: number;
  subject_type: QuestSubjectType;
  completion_policy: CompletionPolicy;
  cooldown_days: number | null;
  quest_mode: QuestMode;
  linked_config: LinkedQuestConfig;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

export type CreateQuestRow = {
  title: string;
  description: string;
  target_count: number;
  xp_reward: number;
  subject_type?: QuestSubjectType;
  /** Defaults to 'REPEATABLE' if not provided */
  completion_policy?: CompletionPolicy;
  /** Defaults to null (no cooldown) if not provided */
  cooldown_days?: number | null;
  /** Defaults to event_driven if not provided */
  quest_mode?: QuestMode;
  /** Defaults to empty object if not provided */
  linked_config?: LinkedQuestConfig;
};

export type QuestProgressRow = {
  subject_ref: string;
  quest_id: string;
  completion_count: number;
  created_at: Date;
  updated_at: Date;
};

export type QuestEventReceiptRow = {
  event_id: string;
  event_key: string;
  subject_ref: string;
  caller_subject: string;
  received_at: Date;
};

export type QuestWithProgressRow = QuestRow & {
  subject_ref: string;
  completion_count: number;
  progress_toward_target: number;
  next_milestone: number;
};

export type QuestAudienceFilter = 'all' | 'individual' | 'team';
export type QuestStatusFilter = 'active' | 'completed' | 'all';
export type QuestSortField =
  | 'created_at'
  | 'updated_at'
  | 'title'
  | 'xp_reward'
  | 'progress_toward_target';
export type SortOrder = 'asc' | 'desc';

export type PaginationResult = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedQuestRowsResult = {
  data: QuestRow[];
  pagination: PaginationResult;
};

export type PaginatedQuestsResult = {
  data: QuestWithProgressRow[];
  pagination: PaginationResult;
};

export type BadgeCriteriaUsageRow = {
  badge_id: string;
  badge_title: string;
};

export type QuestActivitySubjectRow = {
  subject_ref: string;
};

export class QuestsRepository {
  private readonly db: Knex | Knex.Transaction;

  constructor(db: Knex | Knex.Transaction) {
    this.db = db;
  }

  private toJsonb(value: Record<string, unknown> | undefined) {
    return this.db.raw('?::jsonb', [JSON.stringify(value ?? {})]);
  }

  async withTransaction<T>(
    fn: (repo: QuestsRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx => fn(new QuestsRepository(trx)));
  }

  async lockSubjectQuest(subjectRef: string, questId: string): Promise<void> {
    // Serialize writes per subject+quest so policy checks and progress updates
    // observe a stable view before XP award triggers run.
    await this.db.raw(
      'SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))',
      [subjectRef, questId],
    );
  }

  async createQuest(data: CreateQuestRow): Promise<QuestRow> {
    const linkedConfig = this.toJsonb(data.linked_config);

    const rows = await this.db<QuestRow>('quests')
      .insert({
        title: data.title,
        description: data.description,
        target_count: data.target_count,
        xp_reward: data.xp_reward,
        subject_type: data.subject_type ?? 'user',
        completion_policy: data.completion_policy ?? 'REPEATABLE',
        cooldown_days: data.cooldown_days ?? null,
        quest_mode: data.quest_mode ?? 'event_driven',
        linked_config: linkedConfig,
      })
      .returning('*');

    return rows[0];
  }

  async getQuests(params?: {
    searchTitle?: string;
    audience?: QuestAudienceFilter;
    sortBy?: QuestSortField;
    order?: SortOrder;
    includeArchived?: boolean;
    page?: number;
    limit?: number;
  }): Promise<PaginatedQuestRowsResult> {
    const {
      searchTitle,
      audience = 'all',
      sortBy = 'created_at',
      order = 'desc',
      includeArchived = false,
      page = 1,
      limit = 10,
    } = params ?? {};

    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    let query = this.db<QuestRow>('quests').select('*');

    if (!includeArchived) {
      query = query.whereNull('archived_at');
    }

    if (searchTitle) {
      query = query.where('title', 'ilike', `%${searchTitle}%`);
    }

    if (audience === 'individual') {
      query = query.where('subject_type', 'user');
    } else if (audience === 'team') {
      query = query.where('subject_type', 'team');
    }

    const results = await query
      .clone()
      .select(this.db.raw('COUNT(*) OVER() as full_count'))
      .orderBy([
        { column: sortBy, order: sortOrder },
        { column: 'id', order: sortOrder },
      ])
      .limit(safeLimit)
      .offset(offset);

    let total = results.length > 0 ? Number((results[0] as any).full_count) : 0;

    if (results.length === 0 && safePage > 1) {
      const countRow = await this.db
        .from(query.clone().clearSelect().as('matching_quests'))
        .count<{ count: string }[]>({ count: '*' })
        .first();

      total = Number(countRow?.count ?? 0);
    }

    const totalPages = Math.ceil(total / safeLimit) || 0;
    const data = results.map((row: any) => {
      const { full_count, ...rest } = row;
      return rest as QuestRow;
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

  async getQuestById(id: string): Promise<QuestRow | undefined> {
    return this.db<QuestRow>('quests')
      .where({ id })
      .whereNull('archived_at')
      .first();
  }

  async getQuestByTitle(title: string): Promise<QuestRow | undefined> {
    return this.db<QuestRow>('quests')
      .where({ title })
      .whereNull('archived_at')
      .first();
  }

  async getQuestsByIds(ids: string[]): Promise<QuestRow[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.db<QuestRow>('quests')
      .whereIn('id', ids)
      .whereNull('archived_at')
      .select('*');
  }

  async getBadgeCriteriaUsage(
    questId: string,
  ): Promise<BadgeCriteriaUsageRow[]> {
    return this.db('badge_criteria')
      .join('badges', 'badges.id', 'badge_criteria.badge_id')
      .where('badge_criteria.quest_id', questId)
      .whereNull('badges.archived_at')
      .select(
        'badge_criteria.badge_id as badge_id',
        'badges.title as badge_title',
      )
      .orderBy('badges.title', 'asc');
  }

  async getQuestsWithProgress(params: {
    user_ref: string;
    ownership_refs: string[];
    searchTitle?: string;
    audience?: QuestAudienceFilter;
    status?: QuestStatusFilter;
    team_ref?: string;
    sortBy?: QuestSortField;
    order?: SortOrder;
    page?: number;
    limit?: number;
  }): Promise<PaginatedQuestsResult> {
    const {
      user_ref,
      ownership_refs,
      searchTitle,
      audience = 'all',
      status = 'active',
      team_ref,
      sortBy = 'created_at',
      order = 'desc',
      page = 1,
      limit = 10,
    } = params;
    const db = this.db;

    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;

    const teamRefs = ownership_refs.filter(
      ref => ref !== user_ref && ref.startsWith('group:'),
    );
    const selectedTeamRefs = team_ref
      ? teamRefs.filter(
          ref =>
            ref.toLocaleLowerCase('en-US') ===
            team_ref.toLocaleLowerCase('en-US'),
        )
      : teamRefs;

    const selectQuestColumns = (subjectRefSelection: Knex.Raw | string) => [
      'quests.id',
      'quests.title',
      'quests.description',
      'quests.target_count',
      'quests.xp_reward',
      'quests.subject_type',
      'quests.quest_mode',
      'quests.linked_config',
      subjectRefSelection,
      'quests.completion_policy',
      'quests.cooldown_days',
      'quests.created_at',
      'quests.updated_at',
      db.raw(
        'COALESCE(quest_progress.completion_count, 0) as completion_count',
      ),
      db.raw(`
        CASE
          WHEN quests.target_count IS NULL OR quests.target_count < 1 THEN 0
          ELSE COALESCE(quest_progress.completion_count, 0) % quests.target_count
        END as progress_toward_target
      `),
      db.raw(`
        CASE
          WHEN quests.target_count IS NULL OR quests.target_count < 1 THEN COALESCE(quest_progress.completion_count, 0)
          WHEN (COALESCE(quest_progress.completion_count, 0) % quests.target_count) = 0
            THEN COALESCE(quest_progress.completion_count, 0) + quests.target_count
          ELSE COALESCE(quest_progress.completion_count, 0)
            + (quests.target_count - (COALESCE(quest_progress.completion_count, 0) % quests.target_count))
        END as next_milestone
      `),
    ];

    const queries: Knex.QueryBuilder[] = [];

    if (audience !== 'team') {
      const userQuery = db('quests')
        .leftJoin('quest_progress', function joinUserProgress() {
          this.on('quest_progress.quest_id', '=', 'quests.id').andOn(
            'quest_progress.subject_ref',
            '=',
            db.raw('?', [user_ref]),
          );
        })
        .where('quests.subject_type', 'user')
        .whereNull('quests.archived_at')
        .modify(queryBuilder => {
          if (searchTitle) {
            queryBuilder.where('quests.title', 'ilike', `%${searchTitle}%`);
          }
        })
        .select(...selectQuestColumns(db.raw('? as subject_ref', [user_ref])));

      queries.push(userQuery);
    }

    if (audience !== 'individual' && selectedTeamRefs.length > 0) {
      const teamQuery = db('quests')
        .joinRaw('CROSS JOIN unnest(?::text[]) as team_subjects(subject_ref)', [
          selectedTeamRefs,
        ])
        .leftJoin('quest_progress', function joinTeamProgress() {
          this.on('quest_progress.quest_id', '=', 'quests.id').andOn(
            'quest_progress.subject_ref',
            '=',
            'team_subjects.subject_ref',
          );
        })
        .where('quests.subject_type', 'team')
        .whereNull('quests.archived_at')
        .modify(queryBuilder => {
          if (searchTitle) {
            queryBuilder.where('quests.title', 'ilike', `%${searchTitle}%`);
          }
        })
        .select(
          ...selectQuestColumns(
            db.raw('team_subjects.subject_ref as subject_ref'),
          ),
        );

      queries.push(teamQuery);
    }

    if (queries.length === 0) {
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

    const [firstQuery, ...restQueries] = queries;
    const questRowsQuery =
      restQueries.length > 0
        ? firstQuery.unionAll(restQueries, true)
        : firstQuery;

    let query = db
      .from(questRowsQuery.as('quest_rows'))
      .select(
        'quest_rows.id',
        'quest_rows.title',
        'quest_rows.description',
        'quest_rows.target_count',
        'quest_rows.xp_reward',
        'quest_rows.subject_type',
        'quest_rows.subject_ref',
        'quest_rows.completion_policy',
        'quest_rows.cooldown_days',
        'quest_rows.created_at',
        'quest_rows.updated_at',
        'quest_rows.completion_count',
        'quest_rows.progress_toward_target',
        'quest_rows.next_milestone',
      );

    const completedCondition = `
      quest_rows.completion_policy = 'ONE_TIME'
      AND COALESCE(quest_rows.completion_count, 0) >= quest_rows.target_count
    `;

    if (status === 'completed') {
      query = query.whereRaw(completedCondition);
    } else if (status === 'active') {
      query = query.whereRaw(`NOT (${completedCondition})`);
    }

    // Map sortBy to actual column names
    const sortColumn = `quest_rows.${sortBy}`;
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    // Use window function to get total count in same query
    const results = await query
      .select(db.raw('COUNT(*) OVER() as full_count'))
      .orderBy([
        { column: sortColumn, order: sortOrder },
        { column: 'quest_rows.subject_ref', order: sortOrder },
        { column: 'quest_rows.id', order: sortOrder },
      ])
      .limit(safeLimit)
      .offset(offset);

    let total = results.length > 0 ? Number(results[0].full_count || 0) : 0;

    // When page is out of range, LIMIT/OFFSET returns no rows and we lose
    // the windowed count; run a lightweight count to keep pagination metadata.
    if (results.length === 0 && safePage > 1) {
      const countRow = await db
        .from(questRowsQuery.as('quest_rows'))
        .count<{ count: string }[]>({ count: '*' })
        .modify(queryBuilder => {
          if (status === 'completed') {
            queryBuilder.whereRaw(completedCondition);
          } else if (status === 'active') {
            queryBuilder.whereRaw(`NOT (${completedCondition})`);
          }
        })
        .first();

      total = Number(countRow?.count ?? 0);
    }

    const totalPages = Math.ceil(total / safeLimit) || 0;

    // Remove full_count from each row
    const data = results.map((row: any) => {
      const { full_count, ...rest } = row;
      return rest as QuestWithProgressRow;
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

  async editQuest(
    id: string,
    data: QuestEditSchema,
  ): Promise<QuestRow | undefined> {
    const updateData: Partial<
      Omit<QuestRow, 'id' | 'created_at' | 'updated_at'>
    > = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.target_count !== undefined)
      updateData.target_count = data.target_count;
    if (data.xp_reward !== undefined) updateData.xp_reward = data.xp_reward;
    if (data.subject_type !== undefined)
      updateData.subject_type = data.subject_type;
    if (data.completion_policy !== undefined)
      updateData.completion_policy = data.completion_policy;
    if (data.cooldown_days !== undefined)
      updateData.cooldown_days = data.cooldown_days ?? null;
    if (data.quest_mode !== undefined) updateData.quest_mode = data.quest_mode;
    if (data.linked_config !== undefined) {
      (updateData as Record<string, unknown>).linked_config = this.toJsonb(
        data.linked_config as Record<string, unknown>,
      );
    }

    const rows = await this.db<QuestRow>('quests')
      .where({ id })
      .update(updateData)
      .returning('*');

    return rows[0];
  }

  async deleteQuest(id: string): Promise<boolean> {
    const rows = await this.db<QuestRow>('quests')
      .where({ id })
      .whereNull('archived_at')
      .update({ archived_at: this.db.fn.now() })
      .returning('id');

    return rows.length > 0;
  }

  async getProgressForSubjectQuest(
    subjectRef: string,
    questId: string,
  ): Promise<QuestProgressRow | undefined> {
    return this.db<QuestProgressRow>('quest_progress')
      .where({ subject_ref: subjectRef, quest_id: questId })
      .first();
  }

  /**
   * Returns the timestamp of the last XP award for a subject on a given quest,
   * or null if XP has never been awarded.
   * Used by the cooldown enforcement logic in the service layer.
   */
  async getLastAwardedAt(
    subjectRef: string,
    questId: string,
  ): Promise<Date | null> {
    const row = await this.db('xp_awards')
      .where({ subject_ref: subjectRef, quest_id: questId })
      .max('created_at as last_awarded_at')
      .first();
    return row?.last_awarded_at ? new Date(row.last_awarded_at) : null;
  }

  /**
   * Returns distinct subjects with accepted quest activity receipts for the
   * given quest. Reminder evaluation uses `quest_event_receipts` on purpose:
   * receipts are the existing per-activity history source, while
   * `quest_progress` and `xp_awards` only expose aggregated milestones.
   */
  async listSubjectsWithQuestActivity(
    questId: string,
    subjectType: QuestSubjectType,
  ): Promise<string[]> {
    const subjectPrefix = subjectType === 'team' ? 'group:%' : 'user:%';
    const rows = await this.db<QuestActivitySubjectRow>('quest_event_receipts')
      .distinct('subject_ref')
      .where({
        event_key: `quest:${questId}`,
      })
      .andWhere('subject_ref', 'like', subjectPrefix)
      .orderBy('subject_ref', 'asc');

    return rows.map(row => row.subject_ref);
  }

  /**
   * Returns the most recent accepted quest activity receipt timestamp for the
   * subject on the given quest. This is the v1 source of truth for inactivity
   * reminders; it intentionally does not depend on any external GitHub log.
   */
  async getLatestQuestActivityAt(
    questId: string,
    subjectRef: string,
  ): Promise<Date | null> {
    const row = await this.db('quest_event_receipts')
      .where({
        event_key: `quest:${questId}`,
        subject_ref: subjectRef,
      })
      .max('received_at as latest_activity_at')
      .first();

    return row?.latest_activity_at ? new Date(row.latest_activity_at) : null;
  }

  async incrementQuestProgress(params: {
    subject_ref: string;
    quest_id: string;
    by: number;
  }): Promise<QuestProgressRow> {
    const by = Math.max(1, Math.floor(params.by));

    const rows = await this.db<QuestProgressRow>('quest_progress')
      .insert({
        subject_ref: params.subject_ref,
        quest_id: params.quest_id,
        completion_count: by,
      })
      .onConflict(['subject_ref', 'quest_id'])
      .merge({
        completion_count: this.db.raw('quest_progress.completion_count + ?', [
          by,
        ]),
      })
      .returning('*');

    return rows[0];
  }

  async tryInsertReceipt(params: {
    event_id: string;
    event_key: string;
    subject_ref: string;
    caller_subject: string;
  }): Promise<boolean> {
    try {
      await this.db<QuestEventReceiptRow>('quest_event_receipts').insert({
        event_id: params.event_id,
        event_key: params.event_key,
        subject_ref: params.subject_ref,
        caller_subject: params.caller_subject,
      });
      return true;
    } catch (e: any) {
      if (e?.code === '23505') {
        return false;
      }
      throw e;
    }
  }
}
