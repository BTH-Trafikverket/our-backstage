import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE badges
    ADD COLUMN subject_type quest_subject_type;
  `);

  await knex.raw(`
    WITH badge_subject_types AS (
      SELECT
        bc.badge_id,
        MIN(q.subject_type::text) AS subject_type_min,
        MAX(q.subject_type::text) AS subject_type_max
      FROM badge_criteria bc
      JOIN quests q
        ON q.id = bc.quest_id
      GROUP BY bc.badge_id
    )
    UPDATE badges b
    SET subject_type = bst.subject_type_min::quest_subject_type
    FROM badge_subject_types bst
    WHERE b.id = bst.badge_id
      AND bst.subject_type_min = bst.subject_type_max;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM (
          SELECT bc.badge_id
          FROM badge_criteria bc
          JOIN quests q
            ON q.id = bc.quest_id
          GROUP BY bc.badge_id
          HAVING MIN(q.subject_type::text) <> MAX(q.subject_type::text)
        ) inconsistent_badges
      ) THEN
        RAISE EXCEPTION
          'Cannot backfill badges.subject_type because one or more badges mix user and team quests';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM badges
        WHERE subject_type IS NULL
      ) THEN
        RAISE EXCEPTION
          'Cannot backfill badges.subject_type because one or more badges have no criteria-backed subject type';
      END IF;
    END
    $$;
  `);

  await knex.raw(`
    ALTER TABLE badges
    ALTER COLUMN subject_type SET NOT NULL,
    ALTER COLUMN subject_type SET DEFAULT 'user'::quest_subject_type;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS badges_subject_type_idx ON badges (subject_type);
  `);

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
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_badge_criteria_subject_type_guard ON badge_criteria;
  `);
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_badges_subject_type_guard ON badges;
  `);
  await knex.raw(
    `DROP FUNCTION IF EXISTS badge_criteria_subject_type_guard();`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS badges_subject_type_guard();`);
  await knex.raw(
    `DROP FUNCTION IF EXISTS enforce_badge_subject_type_consistency(uuid);`,
  );
  await knex.raw(`DROP INDEX IF EXISTS badges_subject_type_idx;`);

  await knex.raw(`
    ALTER TABLE badges
    ALTER COLUMN subject_type DROP DEFAULT,
    ALTER COLUMN subject_type DROP NOT NULL;
  `);

  await knex.schema.alterTable('badges', table => {
    table.dropColumn('subject_type');
  });
}
