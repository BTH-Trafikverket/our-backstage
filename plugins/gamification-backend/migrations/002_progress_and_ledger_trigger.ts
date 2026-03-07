import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Needed for gen_random_uuid()
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Per-user progress for each quest (one row per user_ref + quest_id)
  await knex.schema.createTable('quest_progress', table => {
    table.text('user_ref').notNullable();
    table.uuid('quest_id').notNullable();
    table.integer('completion_count').notNullable().defaultTo(0);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['user_ref', 'quest_id']);

    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.check('completion_count >= 0', [], 'quest_progress_count_check');
    table.index(['quest_id']);
    table.index(['user_ref']);
  });

  // XP awards (append-only). We dedupe milestone awards with a unique constraint.
  await knex.schema.createTable('xp_ledger', table => {
    table.uuid('id').primary();

    table.text('user_ref').notNullable();
    table.uuid('quest_id').notNullable();

    table.integer('awarded_on_completion_count').notNullable();

    table.integer('xp_amount').notNullable();
    table.text('source').notNullable().defaultTo('quest_progress_trigger');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    // prevent double-awards for the same milestone
    table.unique(['user_ref', 'quest_id', 'awarded_on_completion_count']);

    table.check(
      'awarded_on_completion_count >= 1',
      [],
      'xp_ledger_award_count_check',
    );
    table.check('xp_amount >= 0', [], 'xp_ledger_xp_amount_check');

    table.index(['user_ref', 'created_at']);
    table.index(['quest_id', 'created_at']);
  });

  // Keep updated_at fresh on any update to quest_progress
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_quest_progress_set_updated_at
    BEFORE UPDATE ON quest_progress
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  // Award XP on INSERT/UPDATE of completion_count:
  // - ignore completion_count <= 0
  // - only act when completion_count increases (prevents re-award attempts)
  // - guard interval < 1 to avoid division-by-zero
  // - insert into xp_ledger on milestones, deduped by unique constraint
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

  await knex.raw(`
    CREATE TRIGGER trg_quest_progress_award_xp
    AFTER INSERT OR UPDATE OF completion_count
    ON quest_progress
    FOR EACH ROW
    EXECUTE FUNCTION quest_progress_award_xp();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_progress_award_xp ON quest_progress;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS quest_progress_award_xp;`);

  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_progress_set_updated_at ON quest_progress;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS set_updated_at;`);

  await knex.schema.dropTableIfExists('xp_ledger');
  await knex.schema.dropTableIfExists('quest_progress');
}
