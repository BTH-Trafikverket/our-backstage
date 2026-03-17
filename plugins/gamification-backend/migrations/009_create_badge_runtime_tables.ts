import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('badge_criteria_completion', table => {
    table.text('subject_ref').notNullable();
    table.uuid('badge_id').notNullable();
    table.uuid('quest_id').notNullable();
    table
      .timestamp('completed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['subject_ref', 'badge_id', 'quest_id']);
    table.index(
      ['subject_ref', 'completed_at'],
      'badge_criteria_completion_subject_completed_idx',
    );
    table.index(['badge_id'], 'badge_criteria_completion_badge_id_idx');
    table
      .foreign(['badge_id', 'quest_id'])
      .references(['badge_id', 'quest_id'])
      .inTable('badge_criteria')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('earned_badges', table => {
    table.text('subject_ref').notNullable();
    table.uuid('badge_id').notNullable();
    table
      .timestamp('earned_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['subject_ref', 'badge_id']);
    table.index(
      ['subject_ref', 'earned_at'],
      'earned_badges_subject_earned_idx',
    );
    table.index(['badge_id'], 'earned_badges_badge_id_idx');
    table
      .foreign('badge_id')
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('earned_badges');
  await knex.schema.dropTableIfExists('badge_criteria_completion');
}
