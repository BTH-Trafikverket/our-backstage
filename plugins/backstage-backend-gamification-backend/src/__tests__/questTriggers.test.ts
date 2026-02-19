import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

describe('quest_progress trigger -> xp_ledger', () => {
  // Auto-derive the TestDatabases Postgres connection string from your existing DB_* env vars.
  // Must happen BEFORE TestDatabases.create().
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

  // Backstage standard: create this synchronously inside describe.
  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });

  // If we couldn't derive / set the connection string, this will be false locally and we'll skip.
  if (!databases.supports('POSTGRES_18')) {
    it('skipped: set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD (or BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) to run Postgres trigger tests', () => {
      // noop
    });
    return;
  }

  const migrationsDir = path.resolve(__dirname, '../../migrations');

  async function initDb(): Promise<Knex> {
    // Each init() gives a fresh empty logical DB on Postgres.
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

  it('inserts xp_ledger row when completion_count hits interval multiple', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/alice';

    await knex('quests').insert({
      id: questId,
      title: 'Merge PRs',
      description: 'Merge a PR',
      interval: 3,
      xp_reward: 10,
    });

    await knex('quest_progress').insert({
      user_ref: userRef,
      quest_id: questId,
      completion_count: 1,
    });

    expect(await knex('xp_ledger').select('*')).toHaveLength(0);

    await knex('quest_progress')
      .where({ user_ref: userRef, quest_id: questId })
      .update({ completion_count: 3 });

    const rows = await knex('xp_ledger').select('*');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_ref).toBe(userRef);
    expect(rows[0].quest_id).toBe(questId);
    expect(rows[0].awarded_on_completion_count).toBe(3);
    expect(rows[0].xp_amount).toBe(10);
  });

  it('failsafe: does not award when completion_count stays the same', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/bob';

    await knex('quests').insert({
      id: questId,
      title: 'Build',
      description: '',
      interval: 2,
      xp_reward: 7,
    });

    // Insert at a milestone => trigger should award once
    await knex('quest_progress').insert({
      user_ref: userRef,
      quest_id: questId,
      completion_count: 2,
    });

    expect(await knex('xp_ledger').select('*')).toHaveLength(1);

    // Update to same value => should not add another ledger row
    await knex('quest_progress')
      .where({ user_ref: userRef, quest_id: questId })
      .update({ completion_count: 2 });

    expect(await knex('xp_ledger').select('*')).toHaveLength(1);
  });

  it('failsafe: does not award when completion_count decreases', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/charlie';

    await knex('quests').insert({
      id: questId,
      title: 'Ship',
      description: '',
      interval: 2,
      xp_reward: 5,
    });

    await knex('quest_progress').insert({
      user_ref: userRef,
      quest_id: questId,
      completion_count: 2,
    });

    expect(await knex('xp_ledger').select('*')).toHaveLength(1);

    await knex('quest_progress')
      .where({ user_ref: userRef, quest_id: questId })
      .update({ completion_count: 1 });

    expect(await knex('xp_ledger').select('*')).toHaveLength(1);
  });
});
