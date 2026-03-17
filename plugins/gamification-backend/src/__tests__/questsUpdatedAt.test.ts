import { randomUUID } from 'node:crypto';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('quests updated_at trigger', () => {
  const staleTimestamp = new Date('2024-01-01T00:00:00Z');

  it('automatically updates updated_at when quest is modified', async () => {
    const knex = await initDb();

    const questId = randomUUID();

    // Insert a new quest
    await knex('quests').insert({
      id: questId,
      title: 'Original Title',
      description: 'Original description',
      target_count: 1,
      xp_reward: 10,
      created_at: staleTimestamp,
      updated_at: staleTimestamp,
    });

    // Get the initial timestamps
    const initialQuest = await knex('quests').where({ id: questId }).first();

    expect(initialQuest).toBeDefined();
    const initialUpdatedAt = new Date(initialQuest!.updated_at);

    await knex('quests').where({ id: questId }).update({
      title: 'Updated Title',
      description: 'Updated description',
    });

    // Get the updated quest
    const updatedQuest = await knex('quests').where({ id: questId }).first();

    expect(updatedQuest).toBeDefined();
    const newUpdatedAt = new Date(updatedQuest!.updated_at);

    expect(updatedQuest!.title).toBe('Updated Title');
    expect(updatedQuest!.description).toBe('Updated description');
    expect(newUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
  });

  it('updates updated_at even when only changing xp_reward', async () => {
    const knex = await initDb();

    const questId = randomUUID();

    await knex('quests').insert({
      id: questId,
      title: 'Static Quest',
      description: 'Test',
      target_count: 1,
      xp_reward: 10,
      created_at: staleTimestamp,
      updated_at: staleTimestamp,
    });

    const initialQuest = await knex('quests').where({ id: questId }).first();

    await knex('quests').where({ id: questId }).update({ xp_reward: 20 });

    const updatedQuest = await knex('quests').where({ id: questId }).first();

    expect(updatedQuest!.xp_reward).toBe(20);
    expect(new Date(updatedQuest!.updated_at).getTime()).toBeGreaterThan(
      new Date(initialQuest!.updated_at).getTime(),
    );
  });

  it('does not update updated_at on SELECT queries', async () => {
    const knex = await initDb();

    const questId = randomUUID();

    await knex('quests').insert({
      id: questId,
      title: 'Read Only Quest',
      description: 'Test',
      target_count: 1,
      xp_reward: 10,
      created_at: staleTimestamp,
      updated_at: staleTimestamp,
    });

    const initialQuest = await knex('quests').where({ id: questId }).first();

    const initialUpdatedAt = new Date(initialQuest!.updated_at);

    await knex('quests').where({ id: questId }).first();
    await knex('quests').where({ id: questId }).first();
    await knex('quests').where({ id: questId }).first();

    const afterReadsQuest = await knex('quests').where({ id: questId }).first();

    expect(new Date(afterReadsQuest!.updated_at).getTime()).toBe(
      initialUpdatedAt.getTime(),
    );
  });
});
