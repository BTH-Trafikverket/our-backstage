import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_badge_subject_type_consistency(
      p_badge_id uuid
    )
    RETURNS void AS $$
    BEGIN
      IF p_badge_id IS NULL THEN
        RETURN;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM badges b
        JOIN badge_criteria bc
          ON bc.badge_id = b.id
        JOIN quests q
          ON q.id = bc.quest_id
        WHERE b.id = p_badge_id
          AND q.subject_type <> b.subject_type
      ) THEN
        RAISE EXCEPTION
          'Badge criteria quests must match badge subject_type for badge %',
          p_badge_id;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION badge_criteria_subject_type_guard()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM enforce_badge_subject_type_consistency(
        COALESCE(NEW.badge_id, OLD.badge_id)
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION badges_subject_type_guard()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM enforce_badge_subject_type_consistency(NEW.id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION rebuild_badge_runtime_state(p_badge_id uuid)
    RETURNS void AS $$
    DECLARE
      v_criteria_count integer;
    BEGIN
      SELECT COUNT(*)
        INTO v_criteria_count
      FROM badge_criteria
      WHERE badge_id = p_badge_id;

      DELETE FROM badge_criteria_completion bcc
      WHERE bcc.badge_id = p_badge_id
        AND NOT EXISTS (
          SELECT 1
          FROM badge_criteria bc
          JOIN badges b
            ON b.id = bc.badge_id
          JOIN quest_progress qp
            ON qp.quest_id = bc.quest_id
           AND qp.subject_ref = bcc.subject_ref
           AND qp.completion_count >= bc.target_count
          WHERE bc.badge_id = p_badge_id
            AND b.archived_at IS NULL
            AND bc.quest_id = bcc.quest_id
        );

      INSERT INTO badge_criteria_completion (
        subject_ref,
        badge_id,
        quest_id,
        completed_at
      )
      SELECT
        qp.subject_ref,
        bc.badge_id,
        bc.quest_id,
        COALESCE(qp.updated_at, qp.created_at, now())
      FROM badge_criteria bc
      JOIN badges b
        ON b.id = bc.badge_id
      JOIN quest_progress qp
        ON qp.quest_id = bc.quest_id
       AND qp.completion_count >= bc.target_count
      WHERE bc.badge_id = p_badge_id
        AND b.archived_at IS NULL
      ON CONFLICT (subject_ref, badge_id, quest_id) DO UPDATE
      SET completed_at = LEAST(
        badge_criteria_completion.completed_at,
        EXCLUDED.completed_at
      );

      IF v_criteria_count < 1 THEN
        DELETE FROM earned_badges
        WHERE badge_id = p_badge_id;
        RETURN;
      END IF;

      DELETE FROM earned_badges eb
      WHERE eb.badge_id = p_badge_id
        AND NOT EXISTS (
          SELECT 1
          FROM badge_criteria_completion bcc
          WHERE bcc.badge_id = p_badge_id
            AND bcc.subject_ref = eb.subject_ref
          GROUP BY bcc.subject_ref
          HAVING COUNT(*) = v_criteria_count
        );

      INSERT INTO earned_badges (
        subject_ref,
        badge_id,
        earned_at
      )
      SELECT
        bcc.subject_ref,
        p_badge_id,
        MAX(bcc.completed_at) AS earned_at
      FROM badge_criteria_completion bcc
      WHERE bcc.badge_id = p_badge_id
      GROUP BY bcc.subject_ref
      HAVING COUNT(*) = v_criteria_count
      ON CONFLICT (subject_ref, badge_id) DO UPDATE
      SET earned_at = LEAST(earned_badges.earned_at, EXCLUDED.earned_at);
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION badge_criteria_rebuild_runtime()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM rebuild_badge_runtime_state(OLD.badge_id);
        RETURN OLD;
      END IF;

      IF TG_OP = 'UPDATE' AND OLD.badge_id IS DISTINCT FROM NEW.badge_id THEN
        PERFORM rebuild_badge_runtime_state(OLD.badge_id);
      END IF;

      PERFORM rebuild_badge_runtime_state(NEW.badge_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_sync_badges()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      INSERT INTO badge_criteria_completion (
        subject_ref,
        badge_id,
        quest_id,
        completed_at
      )
      SELECT
        NEW.subject_ref,
        bc.badge_id,
        bc.quest_id,
        COALESCE(NEW.updated_at, NEW.created_at, now())
      FROM badge_criteria bc
      JOIN badges b
        ON b.id = bc.badge_id
      WHERE bc.quest_id = NEW.quest_id
        AND b.archived_at IS NULL
        AND NEW.completion_count >= bc.target_count
      ON CONFLICT (subject_ref, badge_id, quest_id) DO UPDATE
      SET completed_at = LEAST(
        badge_criteria_completion.completed_at,
        EXCLUDED.completed_at
      );

      INSERT INTO earned_badges (
        subject_ref,
        badge_id,
        earned_at
      )
      SELECT
        NEW.subject_ref,
        affected_badges.badge_id,
        (
          SELECT MAX(bcc.completed_at)
          FROM badge_criteria_completion bcc
          WHERE bcc.subject_ref = NEW.subject_ref
            AND bcc.badge_id = affected_badges.badge_id
        ) AS earned_at
      FROM (
        SELECT DISTINCT bc.badge_id
        FROM badge_criteria bc
        JOIN badges b
          ON b.id = bc.badge_id
        WHERE bc.quest_id = NEW.quest_id
          AND b.archived_at IS NULL
      ) AS affected_badges
      WHERE (
        SELECT COUNT(*)
        FROM badge_criteria_completion bcc
        WHERE bcc.subject_ref = NEW.subject_ref
          AND bcc.badge_id = affected_badges.badge_id
      ) = (
        SELECT COUNT(*)
        FROM badge_criteria bc_all
        WHERE bc_all.badge_id = affected_badges.badge_id
      )
      ON CONFLICT (subject_ref, badge_id) DO UPDATE
      SET earned_at = LEAST(earned_badges.earned_at, EXCLUDED.earned_at);

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION award_badge_xp_on_earn()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO xp_awards (
        id,
        subject_ref,
        quest_id,
        badge_id,
        awarded_on_completion_count,
        xp_amount,
        source,
        created_at
      )
      SELECT
        gen_random_uuid(),
        NEW.subject_ref,
        NULL,
        NEW.badge_id,
        1,
        b.xp_reward,
        'badge_completion_trigger',
        NEW.earned_at
      FROM badges b
      WHERE b.id = NEW.badge_id
        AND b.xp_reward > 0
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_badges_set_updated_at
    BEFORE UPDATE ON badges
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE CONSTRAINT TRIGGER trg_badge_criteria_subject_type_guard
    AFTER INSERT OR UPDATE OR DELETE ON badge_criteria
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION badge_criteria_subject_type_guard();
  `);

  await knex.raw(`
    CREATE CONSTRAINT TRIGGER trg_badges_subject_type_guard
    AFTER UPDATE OF subject_type ON badges
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION badges_subject_type_guard();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_badge_criteria_rebuild_runtime
    AFTER INSERT OR UPDATE OR DELETE ON badge_criteria
    FOR EACH ROW
    EXECUTE FUNCTION badge_criteria_rebuild_runtime();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quest_progress_sync_badges
    AFTER INSERT OR UPDATE OF completion_count ON quest_progress
    FOR EACH ROW
    EXECUTE FUNCTION quest_progress_sync_badges();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_earned_badges_award_xp
    AFTER INSERT ON earned_badges
    FOR EACH ROW
    EXECUTE FUNCTION award_badge_xp_on_earn();
  `);

  await knex.raw(`
    DO $$
    DECLARE
      badge_row RECORD;
    BEGIN
      FOR badge_row IN SELECT id FROM badges LOOP
        PERFORM rebuild_badge_runtime_state(badge_row.id);
      END LOOP;
    END
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_earned_badges_award_xp ON earned_badges;`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_progress_sync_badges ON quest_progress;`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_badge_criteria_rebuild_runtime ON badge_criteria;`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_badges_subject_type_guard ON badges;`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_badge_criteria_subject_type_guard ON badge_criteria;`,
  );
  await knex.raw(`DROP TRIGGER IF EXISTS trg_badges_set_updated_at ON badges;`);

  await knex.raw(`DROP FUNCTION IF EXISTS award_badge_xp_on_earn;`);
  await knex.raw(`DROP FUNCTION IF EXISTS quest_progress_sync_badges;`);
  await knex.raw(`DROP FUNCTION IF EXISTS badge_criteria_rebuild_runtime;`);
  await knex.raw(`DROP FUNCTION IF EXISTS rebuild_badge_runtime_state(uuid);`);
  await knex.raw(`DROP FUNCTION IF EXISTS badges_subject_type_guard();`);
  await knex.raw(
    `DROP FUNCTION IF EXISTS badge_criteria_subject_type_guard();`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS enforce_badge_subject_type_consistency(uuid);`,
  );
}
