import type { Knex } from 'knex';
import type { QuestEditSchema } from '../schemas/quests/questEditSchema';

export type QuestRow = {
  id: string;
  title: string;
  description: string;
  interval: number;
  xp_reward: number;
  created_at: Date;
  updated_at: Date;
};

export type CreateQuestRow = {
  title: string;
  description: string;
  interval: number;
  xp_reward: number;
};

export type QuestProgressRow = {
  user_ref: string;
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
  user_ref: string;
  caller_subject: string;
  received_at: Date;
};

export type QuestWithProgressRow = QuestRow & {
  user_ref: string | null;
  completion_count: number;
  progress_in_interval: number;
  next_milestone: number;
};

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
        interval: data.interval,
        xp_reward: data.xp_reward,
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
    searchTitle?: string;
  }): Promise<QuestWithProgressRow[]> {
    const { user_ref, searchTitle } = params;
    const db = this.db;

    let query = db('quests').leftJoin('quest_progress', function () {
      this.on('quest_progress.quest_id', '=', 'quests.id').andOn(
        'quest_progress.user_ref',
        '=',
        db.raw('?', [user_ref]),
      );
    });

    if (searchTitle) {
      query = query.where('quests.title', 'ilike', `%${searchTitle}%`);
    }

    return await query
      .select(
        'quests.id',
        'quests.title',
        'quests.description',
        'quests.interval',
        'quests.xp_reward',
        'quests.created_at',
        'quests.updated_at',
        db.raw('quest_progress.user_ref as user_ref'),
        db.raw(
          'COALESCE(quest_progress.completion_count, 0) as completion_count',
        ),
        db.raw(`
        CASE
          WHEN quests.interval IS NULL OR quests.interval < 1 THEN 0
          ELSE COALESCE(quest_progress.completion_count, 0) % quests.interval
        END as progress_in_interval
      `),
        db.raw(`
        CASE
          WHEN quests.interval IS NULL OR quests.interval < 1 THEN COALESCE(quest_progress.completion_count, 0)
          WHEN (COALESCE(quest_progress.completion_count, 0) % quests.interval) = 0
            THEN COALESCE(quest_progress.completion_count, 0) + quests.interval
          ELSE COALESCE(quest_progress.completion_count, 0)
            + (quests.interval - (COALESCE(quest_progress.completion_count, 0) % quests.interval))
        END as next_milestone
      `),
      )
      .orderBy('quests.created_at', 'asc');
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
    if (data.interval !== undefined) updateData.interval = data.interval;
    if (data.xp_reward !== undefined) updateData.xp_reward = data.xp_reward;

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

  async incrementQuestProgress(params: {
    user_ref: string;
    quest_id: string;
    by: number;
  }): Promise<QuestProgressRow> {
    const by = Math.max(1, Math.floor(params.by));

    const rows = await this.db<QuestProgressRow>('quest_progress')
      .insert({
        user_ref: params.user_ref,
        quest_id: params.quest_id,
        completion_count: by,
      })
      .onConflict(['user_ref', 'quest_id'])
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
    user_ref: string;
    caller_subject: string;
  }): Promise<boolean> {
    try {
      await this.db<QuestEventReceiptRow>('quest_event_receipts').insert({
        event_id: params.event_id,
        event_key: params.event_key,
        user_ref: params.user_ref,
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
