import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create trigger that automatically updates 'updated_at' whenever a quest is modified
  // Note: The set_updated_at() function is already created in migration 002
  await knex.raw(`
    CREATE TRIGGER trg_quests_set_updated_at
    BEFORE UPDATE ON quests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove the trigger if we need to rollback
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quests_set_updated_at ON quests;
  `);
}
