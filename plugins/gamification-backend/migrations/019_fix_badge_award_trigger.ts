import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
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
      ON CONFLICT (subject_ref, badge_id, quest_id) DO NOTHING;

      INSERT INTO earned_badges (
        subject_ref,
        badge_id,
        earned_at
      )
      SELECT
        NEW.subject_ref,
        affected_badges.badge_id,
        now() AS earned_at
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
      ON CONFLICT (subject_ref, badge_id) DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    INSERT INTO earned_badges (
      subject_ref,
      badge_id,
      earned_at
    )
    SELECT
      bcc.subject_ref,
      bcc.badge_id,
      now() AS earned_at
    FROM badge_criteria_completion bcc
    GROUP BY bcc.subject_ref, bcc.badge_id
    HAVING COUNT(*) = (
      SELECT COUNT(*)
      FROM badge_criteria bc
      WHERE bc.badge_id = bcc.badge_id
    )
    ON CONFLICT (subject_ref, badge_id) DO NOTHING;
  `);
}

export async function down(knex: Knex): Promise<void> {
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
      ON CONFLICT (subject_ref, badge_id, quest_id) DO NOTHING;

      INSERT INTO earned_badges (
        subject_ref,
        badge_id,
        earned_at
      )
      SELECT
        NEW.subject_ref,
        bc.badge_id,
        now() AS earned_at
      FROM badge_criteria bc
      JOIN badges b
        ON b.id = bc.badge_id
      JOIN badge_criteria_completion bcc
        ON bcc.subject_ref = NEW.subject_ref
       AND bcc.badge_id = bc.badge_id
       AND bcc.quest_id = bc.quest_id
      WHERE bc.quest_id = NEW.quest_id
        AND b.archived_at IS NULL
      GROUP BY bc.badge_id
      HAVING COUNT(*) = (
        SELECT COUNT(*)
        FROM badge_criteria bc_all
        WHERE bc_all.badge_id = bc.badge_id
      )
      ON CONFLICT (subject_ref, badge_id) DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
