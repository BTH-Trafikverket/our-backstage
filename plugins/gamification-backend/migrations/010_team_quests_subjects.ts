import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quests', table => {
    table
      .text('subject_type')
      .notNullable()
      .defaultTo('user')
      .checkIn(['user', 'team'], 'quests_subject_type_check');
    table.text('subject_ref').nullable();
    table.index(['subject_type'], 'quests_subject_type_idx');
    table.index(['subject_ref'], 'quests_subject_ref_idx');
  });

  await knex.raw(`
    ALTER TABLE quests
    ADD CONSTRAINT quests_subject_ref_check
    CHECK (
      (subject_type = 'user' AND subject_ref IS NULL)
      OR
      (subject_type = 'team' AND subject_ref IS NOT NULL AND subject_ref LIKE 'group:%')
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_ref_check;`,
  );
  await knex.raw(
    `ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_subject_type_check;`,
  );

  await knex.schema.alterTable('quest_event_receipts', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.schema.alterTable('xp_ledger', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.schema.alterTable('quest_progress', table => {
    table.renameColumn('subject_ref', 'user_ref');
  });

  await knex.schema.alterTable('quests', table => {
    table.dropIndex(['subject_ref'], 'quests_subject_ref_idx');
    table.dropIndex(['subject_type'], 'quests_subject_type_idx');
    table.dropColumn('subject_ref');
    table.dropColumn('subject_type');
  });
}
