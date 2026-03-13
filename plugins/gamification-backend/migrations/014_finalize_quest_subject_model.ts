import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'quest_subject_type'
      ) THEN
        CREATE TYPE quest_subject_type AS ENUM ('user', 'team');
      END IF;
    END
    $$;
  `);

  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_ref_check;`,
  );
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_type_check;`,
  );

  await knex.raw(`
    ALTER TABLE quests
    ALTER COLUMN subject_type DROP DEFAULT,
    ALTER COLUMN subject_type TYPE quest_subject_type
    USING subject_type::quest_subject_type,
    ALTER COLUMN subject_type SET DEFAULT 'user'::quest_subject_type,
    ALTER COLUMN subject_type SET NOT NULL;
  `);

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS quests_subject_type_idx ON quests (subject_type);`,
  );

  const hasSubjectRef = await knex.schema.hasColumn('quests', 'subject_ref');
  if (!hasSubjectRef) {
    return;
  }

  await knex.raw(`DROP INDEX IF EXISTS quests_subject_ref_idx;`);

  await knex.schema.alterTable('quests', table => {
    table.dropColumn('subject_ref');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasSubjectRef = await knex.schema.hasColumn('quests', 'subject_ref');
  if (!hasSubjectRef) {
    await knex.schema.alterTable('quests', table => {
      table.text('subject_ref').nullable();
      table.index(['subject_ref'], 'quests_subject_ref_idx');
    });
  }

  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_ref_check;`,
  );
  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quests_subject_ref_check
    CHECK (subject_ref IS NULL);
  `);

  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_type_check;`,
  );
  await knex.raw(`
    ALTER TABLE quests
    ALTER COLUMN subject_type DROP DEFAULT,
    ALTER COLUMN subject_type TYPE text
    USING subject_type::text,
    ALTER COLUMN subject_type SET DEFAULT 'user';
  `);
  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quests_subject_type_check
    CHECK (subject_type IN ('user', 'team'));
  `);
  await knex.raw(`DROP TYPE IF EXISTS quest_subject_type;`);
}
