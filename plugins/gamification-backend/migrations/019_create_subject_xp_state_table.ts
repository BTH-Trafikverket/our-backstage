import type { Knex } from 'knex';

const BASE_XP = 100;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subject_xp_state', table => {
    table.text('subject_ref').primary();
    table.integer('total_xp').notNullable().defaultTo(0);
    table.integer('level').notNullable().defaultTo(1);
    table.integer('current_level_xp').notNullable().defaultTo(0);
    table.integer('next_level_xp').notNullable().defaultTo(BASE_XP);
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.check('total_xp >= 0', [], 'subject_xp_state_total_xp_check');
    table.check('level >= 1', [], 'subject_xp_state_level_check');
    table.check(
      'current_level_xp >= 0',
      [],
      'subject_xp_state_current_level_xp_check',
    );
    table.check(
      'next_level_xp > current_level_xp',
      [],
      'subject_xp_state_next_level_xp_check',
    );
    table.check(
      'total_xp >= current_level_xp AND total_xp < next_level_xp',
      [],
      'subject_xp_state_total_xp_window_check',
    );

    table.index(['level'], 'subject_xp_state_level_idx');
    table.index(['updated_at'], 'subject_xp_state_updated_at_idx');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION compute_subject_xp_state(total_xp_input INTEGER)
    RETURNS TABLE(
      level INTEGER,
      current_level_xp INTEGER,
      next_level_xp INTEGER
    ) AS $$
    DECLARE
      safe_total_xp INTEGER := GREATEST(COALESCE(total_xp_input, 0), 0);
      computed_level INTEGER;
    BEGIN
      computed_level := FLOOR(SQRT(safe_total_xp::numeric / ${BASE_XP}))::INTEGER + 1;

      RETURN QUERY
      SELECT
        computed_level,
        ${BASE_XP} * ((computed_level - 1) * (computed_level - 1)),
        ${BASE_XP} * (computed_level * computed_level);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION refresh_subject_xp_state(target_subject_ref TEXT)
    RETURNS VOID AS $$
    DECLARE
      aggregated_total_xp INTEGER;
      computed_level INTEGER;
      computed_current_level_xp INTEGER;
      computed_next_level_xp INTEGER;
    BEGIN
      IF target_subject_ref IS NULL OR btrim(target_subject_ref) = '' THEN
        RETURN;
      END IF;

      SELECT COALESCE(SUM(xp_amount), 0)::INTEGER
      INTO aggregated_total_xp
      FROM xp_awards
      WHERE subject_ref = target_subject_ref;

      SELECT
        computed.level,
        computed.current_level_xp,
        computed.next_level_xp
      INTO
        computed_level,
        computed_current_level_xp,
        computed_next_level_xp
      FROM compute_subject_xp_state(aggregated_total_xp) AS computed;

      INSERT INTO subject_xp_state (
        subject_ref,
        total_xp,
        level,
        current_level_xp,
        next_level_xp,
        updated_at
      )
      VALUES (
        target_subject_ref,
        aggregated_total_xp,
        computed_level,
        computed_current_level_xp,
        computed_next_level_xp,
        now()
      )
      ON CONFLICT (subject_ref) DO UPDATE
      SET
        total_xp = EXCLUDED.total_xp,
        level = EXCLUDED.level,
        current_level_xp = EXCLUDED.current_level_xp,
        next_level_xp = EXCLUDED.next_level_xp,
        updated_at = EXCLUDED.updated_at;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    INSERT INTO subject_xp_state (
      subject_ref,
      total_xp,
      level,
      current_level_xp,
      next_level_xp,
      updated_at
    )
    SELECT
      aggregated.subject_ref,
      aggregated.total_xp,
      computed.level,
      computed.current_level_xp,
      computed.next_level_xp,
      now()
    FROM (
      SELECT
        subject_ref,
        COALESCE(SUM(xp_amount), 0)::INTEGER AS total_xp
      FROM xp_awards
      GROUP BY subject_ref
    ) AS aggregated
    CROSS JOIN LATERAL compute_subject_xp_state(aggregated.total_xp) AS computed
    ON CONFLICT (subject_ref) DO UPDATE
    SET
      total_xp = EXCLUDED.total_xp,
      level = EXCLUDED.level,
      current_level_xp = EXCLUDED.current_level_xp,
      next_level_xp = EXCLUDED.next_level_xp,
      updated_at = EXCLUDED.updated_at;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION sync_subject_xp_state_from_xp_awards()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM refresh_subject_xp_state(OLD.subject_ref);
        RETURN OLD;
      END IF;

      PERFORM refresh_subject_xp_state(NEW.subject_ref);

      IF TG_OP = 'UPDATE' AND NEW.subject_ref IS DISTINCT FROM OLD.subject_ref THEN
        PERFORM refresh_subject_xp_state(OLD.subject_ref);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_xp_awards_sync_subject_xp_state
    AFTER INSERT OR UPDATE OR DELETE ON xp_awards
    FOR EACH ROW
    EXECUTE FUNCTION sync_subject_xp_state_from_xp_awards();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_xp_awards_sync_subject_xp_state ON xp_awards;
  `);
  await knex.raw(
    `DROP FUNCTION IF EXISTS sync_subject_xp_state_from_xp_awards;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS refresh_subject_xp_state(TEXT);`);
  await knex.raw(`DROP FUNCTION IF EXISTS compute_subject_xp_state(INTEGER);`);
  await knex.schema.dropTableIfExists('subject_xp_state');
}
