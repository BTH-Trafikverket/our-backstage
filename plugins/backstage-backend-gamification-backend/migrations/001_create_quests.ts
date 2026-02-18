import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('quests', table => {
    table.uuid('id').primary();

    table.text('title').notNullable();
    table.text('description').notNullable().defaultTo('');

    table.integer('interval').notNullable();

    table.integer('xp_reward').notNullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.check('interval >= 1', [], 'quest_interval_check');
    table.check('xp_reward > 0', [], 'quest_xp_reward_check');

    table.index(['title']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quests');
}
