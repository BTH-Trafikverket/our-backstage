import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('quest_event_receipts', table => {
    table.text('event_id').primary();
    table.text('event_key').notNullable();
    table.text('subject_ref').notNullable();
    table.text('caller_subject').notNullable();
    table
      .timestamp('received_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['event_key'], 'quest_event_receipts_event_key_idx');
    table.index(['subject_ref'], 'quest_event_receipts_subject_ref_idx');
    table.index(['caller_subject'], 'quest_event_receipts_caller_subject_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quest_event_receipts');
}
