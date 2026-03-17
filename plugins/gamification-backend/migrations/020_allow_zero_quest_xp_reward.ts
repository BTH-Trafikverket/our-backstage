import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quest_xp_reward_check;`,
  );
  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quest_xp_reward_check
    CHECK (xp_reward >= 0);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quest_xp_reward_check;`,
  );
  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quest_xp_reward_check
    CHECK (xp_reward > 0);
  `);
}
