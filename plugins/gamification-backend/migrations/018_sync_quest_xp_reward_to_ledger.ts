import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION sync_quest_xp_reward_to_ledger()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.xp_reward IS DISTINCT FROM OLD.xp_reward THEN
        UPDATE xp_ledger
        SET xp_amount = NEW.xp_reward
        WHERE quest_id = NEW.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quests_sync_xp_reward_to_ledger
    AFTER UPDATE OF xp_reward ON quests
    FOR EACH ROW
    EXECUTE FUNCTION sync_quest_xp_reward_to_ledger();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quests_sync_xp_reward_to_ledger ON quests;
  `);
  await knex.raw(`
    DROP FUNCTION IF EXISTS sync_quest_xp_reward_to_ledger;
  `);
}
