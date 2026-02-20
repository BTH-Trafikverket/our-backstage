// migrations/004_default_uuid_ids.ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await knex.raw(`
    ALTER TABLE quests
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `);

  await knex.raw(`
    ALTER TABLE xp_ledger
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE quests ALTER COLUMN id DROP DEFAULT;`);
  await knex.raw(`ALTER TABLE xp_ledger ALTER COLUMN id DROP DEFAULT;`);
}
