import fs from 'node:fs';
import type { Knex } from 'knex';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb, migrationsDir } =
  createPostgres18TestHarness(__dirname);

describePostgres18('quest event receipts idempotency migration', () => {
  const migrationName = '025_rekey_quest_event_receipts_idempotency.ts';

  async function migrateThroughLegacySchema(knex: Knex): Promise<void> {
    const migrationNames = fs
      .readdirSync(migrationsDir)
      .filter(name => name.endsWith('.ts') && name < migrationName)
      .sort();

    for (const name of migrationNames) {
      await knex.migrate.up({ directory: migrationsDir, name });
    }
  }

  it('migrates existing receipts and rekeys uniqueness to the logical completion boundary', async () => {
    const knex = await initDb({ migrateLatest: false });

    await migrateThroughLegacySchema(knex);

    await knex('quest_event_receipts').insert({
      event_id: 'evt-1',
      event_key: 'quest:quest-a',
      subject_ref: 'user:default/alice',
      caller_subject: 'external:test-service',
      received_at: new Date('2026-04-01T10:00:00.000Z'),
    });

    await knex.migrate.up({
      directory: migrationsDir,
      name: migrationName,
    });

    await expect(
      knex('quest_event_receipts')
        .where({
          event_id: 'evt-1',
          event_key: 'quest:quest-a',
          subject_ref: 'user:default/alice',
          caller_subject: 'external:test-service',
        })
        .first(),
    ).resolves.toMatchObject({
      event_id: 'evt-1',
      event_key: 'quest:quest-a',
      subject_ref: 'user:default/alice',
      caller_subject: 'external:test-service',
    });

    await expect(
      knex('quest_event_receipts').insert({
        event_id: 'evt-1',
        event_key: 'quest:quest-b',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      }),
    ).resolves.toBeDefined();

    await expect(
      knex('quest_event_receipts').insert({
        event_id: 'evt-1',
        event_key: 'quest:quest-a',
        subject_ref: 'user:default/bob',
        caller_subject: 'external:test-service',
      }),
    ).resolves.toBeDefined();

    await expect(
      knex('quest_event_receipts').insert({
        event_id: 'evt-1',
        event_key: 'quest:quest-a',
        subject_ref: 'user:default/alice',
        caller_subject: 'external:test-service',
      }),
    ).rejects.toMatchObject({ code: '23505' });

    const eventIdIndexes = await knex('pg_indexes')
      .select('indexname')
      .where({
        schemaname: 'public',
        tablename: 'quest_event_receipts',
      })
      .andWhere('indexname', 'quest_event_receipts_event_id_idx');

    expect(eventIdIndexes).toHaveLength(1);
  });
});
