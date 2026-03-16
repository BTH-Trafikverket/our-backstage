import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

jest.setTimeout(60000);

describe('badge runtime persistence migration', () => {
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
  const supportsPostgres18 = databases.supports('POSTGRES_18');
  const describeWithDatabase = supportsPostgres18 ? describe : describe.skip;
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const runtimeMigration = '016_persist_badge_runtime_state.ts';

  async function initDb(): Promise<Knex> {
    return databases.init('POSTGRES_18');
  }

  async function migrateThroughLegacySchema(knex: Knex): Promise<void> {
    const migrationNames = fs
      .readdirSync(migrationsDir)
      .filter(name => name.endsWith('.ts') && name < runtimeMigration)
      .sort();

    for (const name of migrationNames) {
      await knex.migrate.up({ directory: migrationsDir, name });
    }
  }

  describeWithDatabase('with POSTGRES_18 available', () => {
    it('backfills badge runtime tables from existing quest_progress rows', async () => {
      const knex = await initDb();

      await migrateThroughLegacySchema(knex);

      const questA = randomUUID();
      const questB = randomUUID();
      const badgeId = randomUUID();
      const subjectRef = 'group:default/platform';

      await knex('quests').insert([
        {
          id: questA,
          title: 'Legacy Badge Quest A',
          description: '',
          target_count: 1,
          xp_reward: 100,
        },
        {
          id: questB,
          title: 'Legacy Badge Quest B',
          description: '',
          target_count: 1,
          xp_reward: 100,
        },
      ]);

      await knex('badges').insert({
        id: badgeId,
        title: 'Legacy Badge',
        description: 'Migrated from live computation',
      });

      await knex('badge_criteria').insert([
        { badge_id: badgeId, quest_id: questA, target_count: 2 },
        { badge_id: badgeId, quest_id: questB, target_count: 1 },
      ]);

      await knex('quest_progress').insert([
        {
          subject_ref: subjectRef,
          quest_id: questA,
          completion_count: 2,
        },
        {
          subject_ref: subjectRef,
          quest_id: questB,
          completion_count: 1,
        },
      ]);

      await knex.migrate.up({
        directory: migrationsDir,
        name: runtimeMigration,
      });

      const badge = await knex('badges').where({ id: badgeId }).first();
      const criteriaCompletion = await knex('badge_criteria_completion')
        .select(['subject_ref', 'badge_id', 'quest_id'])
        .orderBy([
          { column: 'badge_id', order: 'asc' },
          { column: 'quest_id', order: 'asc' },
        ]);
      const earnedBadges = await knex('earned_badges')
        .select(['subject_ref', 'badge_id'])
        .orderBy([
          { column: 'subject_ref', order: 'asc' },
          { column: 'badge_id', order: 'asc' },
        ]);

      expect(badge).toMatchObject({
        id: badgeId,
        archived_at: null,
      });
      expect(criteriaCompletion).toEqual([
        {
          subject_ref: subjectRef,
          badge_id: badgeId,
          quest_id: questA,
        },
        {
          subject_ref: subjectRef,
          badge_id: badgeId,
          quest_id: questB,
        },
      ]);
      expect(earnedBadges).toEqual([
        {
          subject_ref: subjectRef,
          badge_id: badgeId,
        },
      ]);

      await knex.destroy();
    });
  });
});
