import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quest_progress', table => {
    table.renameColumn('user_ref', 'subject_ref');
  });

  await knex.schema.alterTable('xp_ledger', table => {
    table.renameColumn('user_ref', 'subject_ref');
  });

  await knex.schema.alterTable('quest_event_receipts', table => {
    table.renameColumn('user_ref', 'subject_ref');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_award_xp()
    RETURNS TRIGGER AS $$
    DECLARE
      v_interval INTEGER;
      v_reward INTEGER;
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      SELECT interval, xp_reward
        INTO v_interval, v_reward
      FROM quests
      WHERE id = NEW.quest_id;

      IF v_interval IS NULL OR v_reward IS NULL OR v_interval < 1 THEN
        RETURN NEW;
      END IF;

      IF (NEW.completion_count % v_interval) = 0 THEN
        INSERT INTO xp_ledger (
          id, subject_ref, quest_id, awarded_on_completion_count, xp_amount, source
        )
        VALUES (
          gen_random_uuid(), NEW.subject_ref, NEW.quest_id, NEW.completion_count, v_reward, 'quest_progress_trigger'
        )
        ON CONFLICT (subject_ref, quest_id, awarded_on_completion_count) DO NOTHING;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quest_event_receipts', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.schema.alterTable('xp_ledger', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.schema.alterTable('quest_progress', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_award_xp()
    RETURNS TRIGGER AS $$
    DECLARE
      v_interval INTEGER;
      v_reward INTEGER;
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      SELECT interval, xp_reward
        INTO v_interval, v_reward
      FROM quests
      WHERE id = NEW.quest_id;

      IF v_interval IS NULL OR v_reward IS NULL OR v_interval < 1 THEN
        RETURN NEW;
      END IF;

      IF (NEW.completion_count % v_interval) = 0 THEN
        INSERT INTO xp_ledger (
          id, user_ref, quest_id, awarded_on_completion_count, xp_amount, source
        )
        VALUES (
          gen_random_uuid(), NEW.user_ref, NEW.quest_id, NEW.completion_count, v_reward, 'quest_progress_trigger'
        )
        ON CONFLICT (user_ref, quest_id, awarded_on_completion_count) DO NOTHING;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
