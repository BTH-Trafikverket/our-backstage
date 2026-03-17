import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_award_xp()
    RETURNS TRIGGER AS $$
    DECLARE
      v_target_count INTEGER;
      v_reward INTEGER;
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      SELECT target_count, xp_reward
        INTO v_target_count, v_reward
      FROM quests
      WHERE id = NEW.quest_id;

      IF v_target_count IS NULL OR v_reward IS NULL THEN
        RETURN NEW;
      END IF;

      IF v_target_count < 1 OR v_reward <= 0 THEN
        RETURN NEW;
      END IF;

      IF (NEW.completion_count % v_target_count) = 0 THEN
        INSERT INTO xp_awards (
          id,
          subject_ref,
          quest_id,
          badge_id,
          awarded_on_completion_count,
          xp_amount,
          source
        )
        VALUES (
          gen_random_uuid(),
          NEW.subject_ref,
          NEW.quest_id,
          NULL,
          NEW.completion_count,
          v_reward,
          'quest_progress_trigger'
        )
        ON CONFLICT DO NOTHING;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION sync_quest_xp_reward_to_ledger()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.xp_reward IS DISTINCT FROM OLD.xp_reward THEN
        UPDATE xp_awards
        SET xp_amount = NEW.xp_reward
        WHERE quest_id = NEW.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quests_set_updated_at
    BEFORE UPDATE ON quests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quest_progress_set_updated_at
    BEFORE UPDATE ON quest_progress
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quest_progress_award_xp
    AFTER INSERT OR UPDATE OF completion_count
    ON quest_progress
    FOR EACH ROW
    EXECUTE FUNCTION quest_progress_award_xp();
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
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_progress_award_xp ON quest_progress;`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_progress_set_updated_at ON quest_progress;`,
  );
  await knex.raw(`DROP TRIGGER IF EXISTS trg_quests_set_updated_at ON quests;`);
  await knex.raw(`DROP FUNCTION IF EXISTS sync_quest_xp_reward_to_ledger;`);
  await knex.raw(`DROP FUNCTION IF EXISTS quest_progress_award_xp;`);
}
