import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('quests', 'entity_ref');
  if (!hasColumn) {
    await knex.schema.alterTable('quests', table => {
      table.text('entity_ref').nullable();
      table.index(['entity_ref']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('quests', 'entity_ref');
  if (hasColumn) {
    await knex.schema.alterTable('quests', table => {
      table.dropIndex(['entity_ref']);
      table.dropColumn('entity_ref');
    });
  }
}
