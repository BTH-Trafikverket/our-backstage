import type { Knex } from 'knex';
import type { QuestEditSchema } from '../schemas/quests/questEditSchema';
import type {
  CompletionPolicy,
  QuestSubjectType,
} from '../schemas/quests/questCreationSchema';

export type QuestRow = {
  id: string;
  title: string;
  description: string;
  target_count: number;
  xp_reward: number;
  subject_type: QuestSubjectType;
  subject_ref: string | null;
  completion_policy: CompletionPolicy;
  cooldown_days: number | null;
  created_at: Date;
  updated_at: Date;
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
};

export type QuestProgressRow = {
  subject_ref: string;
  quest_id: string;
  completion_count: number;
  created_at: Date;
  updated_at: Date;
};

export type QuestEventTriggerRow = {
  id: string;
  event_key: string;
  quest_id: string;
  increment_by: number;
  enabled: boolean;
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

export class QuestsRepository {
  private readonly db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async createQuest(data: CreateQuestRow): Promise<QuestRow> {
    const rows = await this.db<QuestRow>('quests')
      .insert({
        title: data.title,
        description: data.description,
        target_count: data.target_count,
        xp_reward: data.xp_reward,
        subject_type: data.subject_type ?? 'user',
        completion_policy: data.completion_policy ?? 'REPEATABLE',
        cooldown_days: data.cooldown_days ?? null,
      })
      .returning('*');

    return rows[0];
  }

  async getQuests(searchTitle?: string): Promise<QuestRow[]> {
    let query = this.db<QuestRow>('quests');

    if (searchTitle) {
      query = query.where('title', 'ilike', `%${searchTitle}%`);
    }

    return await query.select('*');
  }

  async getQuestById(id: string): Promise<QuestRow | undefined> {
    return this.db<QuestRow>('quests').where({ id }).first();
  }

  async getQuestsWithProgress(params: {
    user_ref: string;
    ownership_refs: string[];
    searchTitle?: string;
    audience?: QuestAudienceFilter;
    status?: QuestStatusFilter;
    team_ref?: string;
  }): Promise<QuestWithProgressRow[]> {
    const {
      user_ref,
      ownership_refs,
      searchTitle,
      audience = 'all',
      status = 'active',
      team_ref,
    } = params;
    const db = this.db;
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
      return [];
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

    return await query.orderBy([
      { column: 'quest_rows.created_at', order: 'asc' },
      { column: 'quest_rows.subject_ref', order: 'asc' },
    ]);
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

    const rows = await this.db<QuestRow>('quests')
      .where({ id })
      .update(updateData)
      .returning('*');

    return rows[0];
  }

  async deleteQuest(id: string): Promise<boolean> {
    const deletedCount = await this.db('quests').where({ id }).del();
    return deletedCount > 0;
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
   * Returns the timestamp of the last XP award for a user on a given quest,
   * or null if XP has never been awarded.
   * Used by the cooldown enforcement logic in the service layer.
   */
  async getLastAwardedAt(
    subjectRef: string,
    questId: string,
  ): Promise<Date | null> {
    const row = await this.db('xp_ledger')
      .where({ subject_ref: subjectRef, quest_id: questId })
      .max('created_at as last_awarded_at')
      .first();
    return row?.last_awarded_at ? new Date(row.last_awarded_at) : null;
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

  async getTriggerByEvent(
    eventKey: string,
  ): Promise<QuestEventTriggerRow | undefined> {
    return await this.db<QuestEventTriggerRow>('quest_event_triggers')
      .where({ event_key: eventKey, enabled: true })
      .orderBy('created_at', 'asc')
      .first();
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
