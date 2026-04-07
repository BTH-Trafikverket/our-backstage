import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('subject_xp_state sync', () => {
  async function createQuest(
    knex: Knex,
    questId: string,
    xpReward: number = 10,
  ): Promise<void> {
    await knex('quests').insert({
      id: questId,
      title: `Quest ${questId.slice(0, 8)}`,
      description: 'Subject XP state test quest',
      target_count: 1,
      xp_reward: xpReward,
    });
  }

  async function insertQuestAward(
    knex: Knex,
    params: {
      subjectRef: string;
      questId: string;
      xpAmount: number;
      awardedOnCompletionCount?: number;
    },
  ): Promise<void> {
    await knex('xp_awards').insert({
      id: randomUUID(),
      subject_ref: params.subjectRef,
      quest_id: params.questId,
      awarded_on_completion_count: params.awardedOnCompletionCount ?? 1,
      xp_amount: params.xpAmount,
      source: 'subject_xp_state_test',
    });
  }

  it('creates and updates subject_xp_state rows when xp awards are inserted', async () => {
    const knex = await initDb();
    const questId = randomUUID();

    await createQuest(knex, questId);
    await insertQuestAward(knex, {
      subjectRef: 'user:default/alice',
      questId,
      xpAmount: 250,
    });

    const row = await knex('subject_xp_state')
      .where({ subject_ref: 'user:default/alice' })
      .first();

    expect(row).toMatchObject({
      subject_ref: 'user:default/alice',
      total_xp: 250,
      level: 2,
      current_level_xp: 100,
      next_level_xp: 400,
    });

    await knex.destroy();
  });

  it('recomputes persisted totals and level thresholds when quest rewards rewrite ledger rows', async () => {
    const knex = await initDb();
    const questId = randomUUID();

    await createQuest(knex, questId, 10);
    await insertQuestAward(knex, {
      subjectRef: 'user:default/alice',
      questId,
      xpAmount: 10,
      awardedOnCompletionCount: 1,
    });
    await insertQuestAward(knex, {
      subjectRef: 'user:default/alice',
      questId,
      xpAmount: 10,
      awardedOnCompletionCount: 2,
    });

    await knex('quests').where({ id: questId }).update({ xp_reward: 220 });

    const row = await knex('subject_xp_state')
      .where({ subject_ref: 'user:default/alice' })
      .first();

    expect(row).toMatchObject({
      subject_ref: 'user:default/alice',
      total_xp: 440,
      level: 3,
      current_level_xp: 400,
      next_level_xp: 900,
    });

    await knex.destroy();
  });

  it('refreshes both subjects when a ledger row changes subject_ref', async () => {
    const knex = await initDb();
    const questId = randomUUID();
    const awardId = randomUUID();

    await createQuest(knex, questId);
    await knex('xp_awards').insert({
      id: awardId,
      subject_ref: 'user:default/alice',
      quest_id: questId,
      awarded_on_completion_count: 1,
      xp_amount: 120,
      source: 'subject_xp_state_test',
    });

    await knex('xp_awards')
      .where({ id: awardId })
      .update({ subject_ref: 'user:default/bob' });

    const alice = await knex('subject_xp_state')
      .where({ subject_ref: 'user:default/alice' })
      .first();
    const bob = await knex('subject_xp_state')
      .where({ subject_ref: 'user:default/bob' })
      .first();

    expect(alice).toMatchObject({
      subject_ref: 'user:default/alice',
      total_xp: 0,
      level: 1,
      current_level_xp: 0,
      next_level_xp: 100,
    });
    expect(bob).toMatchObject({
      subject_ref: 'user:default/bob',
      total_xp: 120,
      level: 2,
      current_level_xp: 100,
      next_level_xp: 400,
    });

    await knex.destroy();
  });

  it('keeps a zeroed level row when the last xp award is removed by cascade delete', async () => {
    const knex = await initDb();
    const questId = randomUUID();

    await createQuest(knex, questId);
    await insertQuestAward(knex, {
      subjectRef: 'group:default/platform',
      questId,
      xpAmount: 150,
    });

    await knex('quests').where({ id: questId }).del();

    const row = await knex('subject_xp_state')
      .where({ subject_ref: 'group:default/platform' })
      .first();

    expect(row).toMatchObject({
      subject_ref: 'group:default/platform',
      total_xp: 0,
      level: 1,
      current_level_xp: 0,
      next_level_xp: 100,
    });

    await knex.destroy();
  });
});
