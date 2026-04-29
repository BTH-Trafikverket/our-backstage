import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('quest_event_receipts', table => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('quest_event_receipts', table => {
    table.primary(['caller_subject', 'event_id', 'event_key', 'subject_ref'], {
      constraintName: 'quest_event_receipts_pkey',
    });
    table.index(['event_id'], 'quest_event_receipts_event_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM quest_event_receipts q
    USING (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY event_id
          ORDER BY received_at ASC, caller_subject ASC, event_key ASC, subject_ref ASC
        ) AS row_number
      FROM quest_event_receipts
    ) ranked
    WHERE q.ctid = ranked.ctid
      AND ranked.row_number > 1
  `);

  await knex.schema.alterTable('quest_event_receipts', table => {
    table.dropIndex(['event_id'], 'quest_event_receipts_event_id_idx');
    table.dropPrimary();
  });

  await knex.schema.alterTable('quest_event_receipts', table => {
    table.primary(['event_id'], {
      constraintName: 'quest_event_receipts_pkey',
    });
  });
}
