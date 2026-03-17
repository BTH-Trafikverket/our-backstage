import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('xp_awards', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.text('subject_ref').notNullable();
    table.uuid('quest_id').nullable();
    table.uuid('badge_id').nullable();
    table.integer('awarded_on_completion_count').notNullable();
    table.integer('xp_amount').notNullable();
    table.text('source').notNullable().defaultTo('quest_progress_trigger');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');
    table
      .foreign('badge_id')
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');

    table.check(
      'awarded_on_completion_count >= 1',
      [],
      'xp_awards_award_count_check',
    );
    table.check('xp_amount >= 0', [], 'xp_awards_xp_amount_check');
    table.check(
      `(quest_id IS NOT NULL AND badge_id IS NULL)
      OR
      (quest_id IS NULL AND badge_id IS NOT NULL)`,
      [],
      'xp_awards_source_target_check',
    );

    table.index(
      ['subject_ref', 'created_at'],
      'xp_awards_subject_ref_created_at_index',
    );
  });

  await knex.raw(`
    CREATE INDEX xp_awards_quest_id_created_at_index
      ON xp_awards (quest_id, created_at)
      WHERE quest_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX xp_awards_badge_id_created_at_index
      ON xp_awards (badge_id, created_at)
      WHERE badge_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX xp_awards_quest_award_unique_idx
      ON xp_awards (subject_ref, quest_id, awarded_on_completion_count)
      WHERE quest_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX xp_awards_badge_award_unique_idx
      ON xp_awards (subject_ref, badge_id)
      WHERE badge_id IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('xp_awards');
}
