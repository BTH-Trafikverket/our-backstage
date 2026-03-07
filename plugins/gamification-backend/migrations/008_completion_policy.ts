import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table
      .text('completion_policy')
      .notNullable()
      .defaultTo('REPEATABLE')
      .checkIn(['ONE_TIME', 'REPEATABLE'], 'quest_completion_policy_check');

    table.integer('cooldown_days').nullable().defaultTo(null);
  });

  // Cooldown only applies to REPEATABLE quests
  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quest_cooldown_days_check
    CHECK (cooldown_days IS NULL OR cooldown_days > 0);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quest_one_time_interval_check;`,
  );
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quest_cooldown_days_check;`,
  );
  await knex.schema.alterTable('quests', table => {
    table.dropColumn('cooldown_days');
    table.dropColumn('completion_policy');
  });
}
