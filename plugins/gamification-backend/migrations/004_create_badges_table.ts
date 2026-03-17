import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('badges', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.text('title').notNullable();
    table.text('description').notNullable();
    table
      .specificType('subject_type', 'quest_subject_type')
      .notNullable()
      .defaultTo('user');
    table.integer('xp_reward').notNullable().defaultTo(0);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('archived_at', { useTz: true }).nullable();

    table.check('xp_reward >= 0', [], 'badges_xp_reward_check');
    table.unique(['title'], { indexName: 'badges_title_unique' });
    table.index(['created_at'], 'badges_created_at_idx');
    table.index(['subject_type'], 'badges_subject_type_idx');
    table.index(['archived_at'], 'badges_archived_at_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('badges');
}
