import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('badge_criteria', table => {
    table.uuid('badge_id').notNullable();
    table.uuid('quest_id').notNullable();
    table.integer('target_count').notNullable();

    table.primary(['badge_id', 'quest_id']);
    table
      .foreign('badge_id')
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');
    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.check('target_count >= 1', [], 'badge_criteria_target_count_check');
    table.index(['quest_id'], 'badge_criteria_quest_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('badge_criteria');
}
