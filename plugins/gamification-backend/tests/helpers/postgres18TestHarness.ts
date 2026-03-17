import path from 'node:path';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

function ensurePostgres18ConnectionString() {
  if (process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    return;
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
  const isLocalHost =
    DB_HOST === 'localhost' ||
    DB_HOST === '127.0.0.1' ||
    DB_HOST === 'postgres';

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && isLocalHost) {
    process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
  }
}

export function createPostgres18TestHarness(currentDir: string) {
  ensurePostgres18ConnectionString();

  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });
  const migrationsDir = path.resolve(currentDir, '../../migrations');
  const liveKnex = new Set<Knex>();

  afterEach(async () => {
    const instances = [...liveKnex];
    liveKnex.clear();

    await Promise.allSettled(instances.map(knex => knex.destroy()));
  });

  async function initDb(options?: { migrateLatest?: boolean }) {
    const knex = await databases.init('POSTGRES_18');
    liveKnex.add(knex);

    if (options?.migrateLatest !== false) {
      await knex.migrate.latest({ directory: migrationsDir });
    }

    return knex;
  }

  return {
    describePostgres18: databases.supports('POSTGRES_18')
      ? describe
      : describe.skip,
    initDb,
    migrationsDir,
    supportsPostgres18: databases.supports('POSTGRES_18'),
  };
}
