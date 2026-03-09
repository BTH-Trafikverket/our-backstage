import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

jest.setTimeout(60000);

describe('quests updated_at trigger', () => {
  // Auto-derive the TestDatabases Postgres connection string from your existing DB_* env vars.
  if (!process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

    const isLocal =
      DB_HOST === 'localhost' ||
      DB_HOST === '127.0.0.1' ||
      DB_HOST === 'postgres';

    if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && isLocal) {
      process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
    }
  }

  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });

  const migrationsDir = path.resolve(__dirname, '../../migrations');

  async function initDb(): Promise<Knex> {
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

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
    });

    // Get the initial timestamps
    const initialQuest = await knex('quests').where({ id: questId }).first();

    expect(initialQuest).toBeDefined();
    const initialUpdatedAt = new Date(initialQuest!.updated_at);

    // Wait a bit to ensure time difference is visible
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update the quest
    await knex('quests').where({ id: questId }).update({
      title: 'Updated Title',
      description: 'Updated description',
    });

    // Get the updated quest
    const updatedQuest = await knex('quests').where({ id: questId }).first();

    expect(updatedQuest).toBeDefined();
    const newUpdatedAt = new Date(updatedQuest!.updated_at);

    // Verify the trigger worked
    expect(updatedQuest!.title).toBe('Updated Title');
    expect(updatedQuest!.description).toBe('Updated description');
    expect(newUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());

    await knex.destroy();
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
    });

    const initialQuest = await knex('quests').where({ id: questId }).first();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Update only xp_reward
    await knex('quests').where({ id: questId }).update({ xp_reward: 20 });

    const updatedQuest = await knex('quests').where({ id: questId }).first();

    expect(updatedQuest!.xp_reward).toBe(20);
    expect(new Date(updatedQuest!.updated_at).getTime()).toBeGreaterThan(
      new Date(initialQuest!.updated_at).getTime(),
    );

    await knex.destroy();
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
    });

    const initialQuest = await knex('quests').where({ id: questId }).first();

    const initialUpdatedAt = new Date(initialQuest!.updated_at);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Just read the quest multiple times
    await knex('quests').where({ id: questId }).first();
    await knex('quests').where({ id: questId }).first();
    await knex('quests').where({ id: questId }).first();

    const afterReadsQuest = await knex('quests').where({ id: questId }).first();

    // updated_at should NOT have changed
    expect(new Date(afterReadsQuest!.updated_at).getTime()).toBe(
      initialUpdatedAt.getTime(),
    );

    await knex.destroy();
  });
});
