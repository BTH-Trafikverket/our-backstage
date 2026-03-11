import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('badges', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.string('name').notNullable();
    table.text('description').nullable();

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('badge_criteria', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('badge_id')
      .notNullable()
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');

    table
      .uuid('quest_id')
      .nullable()
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.string('type').notNullable();

    table.jsonb('config').nullable();

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('earned_badges', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.string('user_ref').notNullable();

    table
      .uuid('badge_id')
      .notNullable()
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');

    table.timestamp('earned_at').notNullable().defaultTo(knex.fn.now());

    /**
     * Prevent duplicate earning of same badge
     */
    table.unique(['user_ref', 'badge_id']);

    /**
     * Index for listing earned badges by subject
     */
    table.index(['user_ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('earned_badges');
  await knex.schema.dropTableIfExists('badge_criteria');
  await knex.schema.dropTableIfExists('badges');
}
