import { randomUUID } from 'node:crypto';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('quests xp_reward -> xp_awards sync trigger', () => {
  it('updates existing ledger rows when a quest xp_reward changes', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const otherQuestId = randomUUID();

    await knex('quests').insert([
      {
        id: questId,
        title: 'Quest To Sync',
        description: 'Updates historical ledger rows',
        target_count: 2,
        xp_reward: 10,
      },
      {
        id: otherQuestId,
        title: 'Quest To Leave Alone',
        description: 'Should not change',
        target_count: 1,
        xp_reward: 5,
      },
    ]);

    await knex('xp_awards').insert([
      {
        id: randomUUID(),
        subject_ref: 'user:default/alice',
        quest_id: questId,
        awarded_on_completion_count: 2,
        xp_amount: 10,
        source: 'integration_test',
      },
      {
        id: randomUUID(),
        subject_ref: 'group:default/platform',
        quest_id: questId,
        awarded_on_completion_count: 4,
        xp_amount: 10,
        source: 'integration_test',
      },
      {
        id: randomUUID(),
        subject_ref: 'user:default/bob',
        quest_id: otherQuestId,
        awarded_on_completion_count: 1,
        xp_amount: 5,
        source: 'integration_test',
      },
    ]);

    await knex('quests').where({ id: questId }).update({ xp_reward: 35 });

    const syncedRows = await knex('xp_awards')
      .where({ quest_id: questId })
      .orderBy('subject_ref', 'asc');
    const untouchedRow = await knex('xp_awards')
      .where({ quest_id: otherQuestId })
      .first();

    expect(syncedRows).toHaveLength(2);
    expect(syncedRows.map(row => row.xp_amount)).toEqual([35, 35]);
    expect(untouchedRow?.xp_amount).toBe(5);
  });

  it('does not touch ledger rows when another quest field changes', async () => {
    const knex = await initDb();

    const questId = randomUUID();

    await knex('quests').insert({
      id: questId,
      title: 'Quest Title',
      description: 'Original description',
      target_count: 1,
      xp_reward: 20,
    });

    await knex('xp_awards').insert({
      id: randomUUID(),
      subject_ref: 'user:default/alice',
      quest_id: questId,
      awarded_on_completion_count: 1,
      xp_amount: 20,
      source: 'integration_test',
    });

    await knex('quests').where({ id: questId }).update({
      description: 'Updated description',
    });

    const row = await knex('xp_awards').where({ quest_id: questId }).first();

    expect(row?.xp_amount).toBe(20);
  });
});
