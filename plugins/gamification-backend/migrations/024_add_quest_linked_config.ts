import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table
      .text('quest_mode')
      .notNullable()
      .defaultTo('event_driven')
      .checkIn(['event_driven', 'catalog'], 'quests_mode_check');
    table
      .jsonb('linked_config')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table.dropColumn('linked_config');
    table.dropColumn('quest_mode');
  });
}
