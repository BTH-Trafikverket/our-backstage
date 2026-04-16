import path from 'node:path';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

const PRESERVED_TABLES = new Set([
  'knex_migrations',
  'knex_migrations_lock',
  'webhook_trigger_events',
]);

function ensurePostgres18ConnectionString() {
  if (process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    return;
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD !== undefined) {
    const adminDatabase =
      process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_ADMIN_DB ?? 'postgres';

    process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING = `postgresql://${encodeURIComponent(
      DB_USER,
    )}:${encodeURIComponent(
      DB_PASSWORD,
    )}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(adminDatabase)}`;
  }
}

export function createPostgres18TestHarness(currentDir: string) {
  ensurePostgres18ConnectionString();
  jest.setTimeout(30_000);

  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });
  const supportsPostgres18 = databases.supports('POSTGRES_18');
  const migrationsDir = path.resolve(currentDir, '../../migrations');
  const isolatedKnex = new Set<Knex>();
  let sharedKnexPromise: Promise<Knex> | undefined;

  async function createSharedKnex() {
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

  async function getSharedKnex() {
    if (!sharedKnexPromise) {
      sharedKnexPromise = createSharedKnex();
    }

    return sharedKnexPromise;
  }

  async function truncateSharedTables(knex: Knex) {
    const tableRows = await knex<{ tablename: string }>('pg_tables')
      .select('tablename')
      .where({ schemaname: 'public' });

    const tableNames = tableRows
      .map(row => row.tablename)
      .filter(name => !PRESERVED_TABLES.has(name));

    if (tableNames.length === 0) {
      return;
    }

    const quotedTableNames = tableNames.map(
      name => `"${name.replaceAll('"', '""')}"`,
    );

    await knex.raw(
      `TRUNCATE TABLE ${quotedTableNames.join(', ')} RESTART IDENTITY CASCADE`,
    );
  }

  beforeAll(async () => {
    if (!supportsPostgres18) {
      return;
    }

    await getSharedKnex();
  });

  afterEach(async () => {
    if (sharedKnexPromise) {
      await truncateSharedTables(await sharedKnexPromise);
    }

    const instances = [...isolatedKnex];
    isolatedKnex.clear();

    await Promise.allSettled(instances.map(knex => knex.destroy()));
  });

  afterAll(async () => {
    const instances = [...isolatedKnex];
    isolatedKnex.clear();

    await Promise.allSettled(instances.map(knex => knex.destroy()));
  });

  async function initDb(options?: { migrateLatest?: boolean }) {
    if (options?.migrateLatest === false) {
      const knex = await databases.init('POSTGRES_18');
      isolatedKnex.add(knex);
      return knex;
    }

    return getSharedKnex();
  }

  return {
    describePostgres18: supportsPostgres18 ? describe : describe.skip,
    initDb,
    migrationsDir,
    supportsPostgres18,
  };
}
