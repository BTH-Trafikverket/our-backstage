import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badges', table => {
    table.timestamp('archived_at', { useTz: true }).nullable();
    table.index(['archived_at'], 'badges_archived_at_idx');
  });

  await knex.schema.createTable('badge_criteria_completion', table => {
    table.text('subject_ref').notNullable();
    table.uuid('badge_id').notNullable();
    table.uuid('quest_id').notNullable();
    table
      .timestamp('completed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['subject_ref', 'badge_id', 'quest_id']);
    table.index(
      ['subject_ref', 'completed_at'],
      'badge_criteria_completion_subject_completed_idx',
    );
    table.index(['badge_id'], 'badge_criteria_completion_badge_id_idx');

    table
      .foreign(['badge_id', 'quest_id'])
      .references(['badge_id', 'quest_id'])
      .inTable('badge_criteria')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('earned_badges', table => {
    table.text('subject_ref').notNullable();
    table.uuid('badge_id').notNullable();
    table
      .timestamp('earned_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['subject_ref', 'badge_id']);
    table.index(
      ['subject_ref', 'earned_at'],
      'earned_badges_subject_earned_idx',
    );
    table.index(['badge_id'], 'earned_badges_badge_id_idx');

    table
      .foreign('badge_id')
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION rebuild_badge_runtime_state(p_badge_id uuid)
    RETURNS void AS $$
    DECLARE
      v_criteria_count integer;
    BEGIN
      DELETE FROM earned_badges
      WHERE badge_id = p_badge_id;

      DELETE FROM badge_criteria_completion
      WHERE badge_id = p_badge_id;

      SELECT COUNT(*)
        INTO v_criteria_count
      FROM badge_criteria
      WHERE badge_id = p_badge_id;

      IF v_criteria_count < 1 THEN
        RETURN;
      END IF;

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
        qp.updated_at
      FROM badge_criteria bc
      JOIN quest_progress qp
        ON qp.quest_id = bc.quest_id
       AND qp.completion_count >= bc.target_count
      WHERE bc.badge_id = p_badge_id;

      INSERT INTO earned_badges (
        subject_ref,
        badge_id,
        earned_at
      )
      SELECT
        bcc.subject_ref,
        p_badge_id,
        now() AS earned_at
      FROM badge_criteria_completion bcc
      WHERE bcc.badge_id = p_badge_id
      GROUP BY bcc.subject_ref
      HAVING COUNT(*) = v_criteria_count;
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
      qp.updated_at
    FROM badge_criteria bc
    JOIN badges b
      ON b.id = bc.badge_id
    JOIN quest_progress qp
      ON qp.quest_id = bc.quest_id
     AND qp.completion_count >= bc.target_count
    WHERE b.archived_at IS NULL
    ON CONFLICT (subject_ref, badge_id, quest_id) DO NOTHING;
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
    JOIN badges b
      ON b.id = bcc.badge_id
    WHERE b.archived_at IS NULL
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
    DROP TRIGGER IF EXISTS trg_badge_criteria_rebuild_runtime ON badge_criteria;
  `);
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quest_progress_sync_badges ON quest_progress;
  `);

  await knex.raw(`DROP FUNCTION IF EXISTS badge_criteria_rebuild_runtime;`);
  await knex.raw(`DROP FUNCTION IF EXISTS rebuild_badge_runtime_state;`);
  await knex.raw(`DROP FUNCTION IF EXISTS quest_progress_sync_badges;`);

  await knex.schema.dropTableIfExists('earned_badges');
  await knex.schema.dropTableIfExists('badge_criteria_completion');

  await knex.schema.alterTable('badges', table => {
    table.dropIndex(['archived_at'], 'badges_archived_at_idx');
    table.dropColumn('archived_at');
  });
}
