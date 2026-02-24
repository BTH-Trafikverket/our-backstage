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
  id: string;
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

export class QuestsRepository {
  private readonly db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async createQuest(data: CreateQuestRow): Promise<QuestRow> {
    const rows = await this.db<QuestRow>('quests')
      .insert({
        id: data.id,
        title: data.title,
        description: data.description,
        interval: data.interval,
        xp_reward: data.xp_reward,
      })
      .returning('*');

    return rows[0];
  }

  async getQuests(): Promise<QuestRow[]> {
    return await this.db<QuestRow>('quests').select('*');
  }

  async getQuestById(id: string): Promise<QuestRow | undefined> {
    return this.db<QuestRow>('quests').where({ id }).first();
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

  async completeQuestProgress(params: {
    user_ref: string;
    quest_id: string;
  }): Promise<QuestProgressRow> {
    const rows = await this.db<QuestProgressRow>('quest_progress')
      .insert({
        user_ref: params.user_ref,
        quest_id: params.quest_id,
        completion_count: 1,
      })
      .onConflict(['user_ref', 'quest_id'])
      .merge({
        completion_count: this.db.raw('quest_progress.completion_count + 1'),
      })
      .returning('*');

    return rows[0];
  }
}
