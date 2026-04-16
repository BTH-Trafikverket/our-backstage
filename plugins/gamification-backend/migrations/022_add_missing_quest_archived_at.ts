import type { Knex } from 'knex';

const INDEX_NAME = 'quests_archived_at_idx';

export async function up(knex: Knex): Promise<void> {
  const hasQuestsTable = await knex.schema.hasTable('quests');

  if (!hasQuestsTable) {
    return;
  }

  const hasArchivedAt = await knex.schema.hasColumn('quests', 'archived_at');

  if (!hasArchivedAt) {
    await knex.schema.alterTable('quests', table => {
      table.timestamp('archived_at', { useTz: true }).nullable();
    });
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_NAME} ON quests (archived_at)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasQuestsTable = await knex.schema.hasTable('quests');

  if (!hasQuestsTable) {
    return;
  }

  const hasArchivedAt = await knex.schema.hasColumn('quests', 'archived_at');

  if (!hasArchivedAt) {
    return;
  }

  await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);

  await knex.schema.alterTable('quests', table => {
    table.dropColumn('archived_at');
  });
}
