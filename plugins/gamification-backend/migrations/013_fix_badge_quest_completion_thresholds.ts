import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
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
          JOIN quests q
            ON q.id = bc.quest_id
          JOIN quest_progress qp
            ON qp.quest_id = bc.quest_id
           AND qp.subject_ref = bcc.subject_ref
           AND qp.completion_count >= (bc.target_count * q.target_count)
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
      JOIN quests q
        ON q.id = bc.quest_id
      JOIN quest_progress qp
        ON qp.quest_id = bc.quest_id
       AND qp.completion_count >= (bc.target_count * q.target_count)
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
      JOIN quests q
        ON q.id = bc.quest_id
      WHERE bc.quest_id = NEW.quest_id
        AND b.archived_at IS NULL
        AND NEW.completion_count >= (bc.target_count * q.target_count)
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
