import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('quests', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.text('title').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.integer('target_count').notNullable();
    table.integer('xp_reward').notNullable();
    table
      .specificType('subject_type', 'quest_subject_type')
      .notNullable()
      .defaultTo('user');
    table
      .text('completion_policy')
      .notNullable()
      .defaultTo('REPEATABLE')
      .checkIn(['ONE_TIME', 'REPEATABLE'], 'quest_completion_policy_check');
    table.integer('cooldown_days').nullable().defaultTo(null);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.check('target_count >= 1', [], 'quest_target_count_check');
    table.check('xp_reward >= 0', [], 'quest_xp_reward_check');
    table.check(
      'cooldown_days IS NULL OR cooldown_days > 0',
      [],
      'quest_cooldown_days_check',
    );

    table.unique(['title'], { indexName: 'quests_title_unique' });
    table.index(['subject_type'], 'quests_subject_type_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quests');
}
