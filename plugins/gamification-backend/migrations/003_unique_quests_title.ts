import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table.unique(['title'], { indexName: 'quests_title_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table.dropUnique(['title'], 'quests_title_unique');
  });
}
