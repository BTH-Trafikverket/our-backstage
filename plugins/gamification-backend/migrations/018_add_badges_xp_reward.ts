import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badges', table => {
    table.integer('xp_reward').notNullable().defaultTo(0);
  });

  await knex.raw(`
    ALTER TABLE badges
    ADD CONSTRAINT badges_xp_reward_check
    CHECK (xp_reward >= 0);
  `);

  await knex.schema.alterTable('xp_ledger', table => {
    table.uuid('badge_id').nullable();
    table.uuid('quest_id').nullable().alter();
  });

  await knex.raw(`
    ALTER TABLE xp_ledger
    ADD CONSTRAINT xp_ledger_badge_id_fkey
    FOREIGN KEY (badge_id)
    REFERENCES badges (id)
    ON DELETE CASCADE;
  `);

  await knex.raw(`
    ALTER TABLE xp_ledger
    ADD CONSTRAINT xp_ledger_source_target_check
    CHECK (
      (quest_id IS NOT NULL AND badge_id IS NULL)
      OR
      (quest_id IS NULL AND badge_id IS NOT NULL)
    );
  `);

  await knex.raw(`
    DROP INDEX IF EXISTS xp_ledger_quest_id_created_at_index;
    CREATE INDEX xp_ledger_quest_id_created_at_index
      ON xp_ledger (quest_id, created_at)
      WHERE quest_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX xp_ledger_badge_id_created_at_index
      ON xp_ledger (badge_id, created_at)
      WHERE badge_id IS NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE xp_ledger
    DROP CONSTRAINT IF EXISTS xp_ledger_subject_ref_quest_id_awarded_on_completion_count_unique;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX xp_ledger_quest_award_unique_idx
      ON xp_ledger (subject_ref, quest_id, awarded_on_completion_count)
      WHERE quest_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX xp_ledger_badge_award_unique_idx
      ON xp_ledger (subject_ref, badge_id)
      WHERE badge_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION rebuild_badge_runtime_state(p_badge_id uuid)
    RETURNS void AS $$
    DECLARE
      v_criteria_count integer;
      v_badge_reward integer;
    BEGIN
      DELETE FROM xp_ledger
      WHERE badge_id = p_badge_id;

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

      SELECT xp_reward
        INTO v_badge_reward
      FROM badges
      WHERE id = p_badge_id;

      IF v_badge_reward IS NULL OR v_badge_reward <= 0 THEN
        RETURN;
      END IF;

      INSERT INTO xp_ledger (
        id,
        subject_ref,
        quest_id,
        badge_id,
        awarded_on_completion_count,
        xp_amount,
        source
      )
      SELECT
        gen_random_uuid(),
        eb.subject_ref,
        NULL,
        eb.badge_id,
        1,
        v_badge_reward,
        'badge_completion_trigger'
      FROM earned_badges eb
      WHERE eb.badge_id = p_badge_id
      ON CONFLICT DO NOTHING;
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

      INSERT INTO xp_ledger (
        id,
        subject_ref,
        quest_id,
        badge_id,
        awarded_on_completion_count,
        xp_amount,
        source
      )
      SELECT
        gen_random_uuid(),
        eb.subject_ref,
        NULL,
        eb.badge_id,
        1,
        b.xp_reward,
        'badge_completion_trigger'
      FROM earned_badges eb
      JOIN badges b
        ON b.id = eb.badge_id
      WHERE eb.subject_ref = NEW.subject_ref
        AND eb.badge_id IN (
          SELECT bc.badge_id
          FROM badge_criteria bc
          WHERE bc.quest_id = NEW.quest_id
        )
        AND b.archived_at IS NULL
        AND b.xp_reward > 0
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS quest_progress_sync_badges;`);
  await knex.raw(`DROP FUNCTION IF EXISTS rebuild_badge_runtime_state(uuid);`);

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

  await knex.raw(`DROP INDEX IF EXISTS xp_ledger_badge_award_unique_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS xp_ledger_badge_id_created_at_index;`);
  await knex.raw(`DROP INDEX IF EXISTS xp_ledger_quest_award_unique_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS xp_ledger_quest_id_created_at_index;`);

  await knex.raw(`
    CREATE UNIQUE INDEX xp_ledger_subject_ref_quest_id_awarded_on_completion_count_unique
      ON xp_ledger (subject_ref, quest_id, awarded_on_completion_count);
  `);

  await knex.raw(`
    CREATE INDEX xp_ledger_quest_id_created_at_index
      ON xp_ledger (quest_id, created_at);
  `);

  await knex.raw(`
    ALTER TABLE xp_ledger
    DROP CONSTRAINT IF EXISTS xp_ledger_source_target_check;
  `);
  await knex.raw(`
    ALTER TABLE xp_ledger
    DROP CONSTRAINT IF EXISTS xp_ledger_badge_id_fkey;
  `);

  await knex('xp_ledger').whereNotNull('badge_id').del();

  await knex.schema.alterTable('xp_ledger', table => {
    table.dropColumn('badge_id');
  });

  await knex.raw(`
    ALTER TABLE xp_ledger
    ALTER COLUMN quest_id SET NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE badges
    DROP CONSTRAINT IF EXISTS badges_xp_reward_check;
  `);

  await knex.schema.alterTable('badges', table => {
    table.dropColumn('xp_reward');
  });
}
