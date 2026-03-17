import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('quest_progress', table => {
    table.text('subject_ref').notNullable();
    table.uuid('quest_id').notNullable();
    table.integer('completion_count').notNullable().defaultTo(0);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['subject_ref', 'quest_id']);
    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.check('completion_count >= 0', [], 'quest_progress_count_check');
    table.index(['quest_id'], 'quest_progress_quest_id_idx');
    table.index(['subject_ref'], 'quest_progress_subject_ref_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quest_progress');
}
