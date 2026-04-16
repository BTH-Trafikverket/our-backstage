import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('domain_events', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .text('event_name')
      .notNullable()
      .references('name')
      .inTable('webhook_trigger_events')
      .onUpdate('CASCADE')
      .onDelete('RESTRICT');
    table.text('source_table').notNullable();
    table.text('source_id').notNullable();
    table.text('subject_ref').notNullable();
    table.uuid('quest_id').nullable();
    table.uuid('badge_id').nullable();
    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .timestamp('occurred_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('available_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('claimed_at', { useTz: true }).nullable();
    table.text('claimed_by').nullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('processed_at', { useTz: true }).nullable();
    table.timestamp('dead_lettered_at', { useTz: true }).nullable();
    table.text('last_error').nullable();

    table.unique(
      ['event_name', 'source_table', 'source_id'],
      'domain_events_source_unique_idx',
    );
    table.index(
      ['event_name', 'occurred_at'],
      'domain_events_event_occurred_idx',
    );
    table.index(['claimed_at'], 'domain_events_claimed_at_idx');
    table.check('attempt_count >= 0', [], 'domain_events_attempt_count_check');
  });

  await knex.raw(`
    CREATE INDEX domain_events_pending_idx
      ON domain_events (available_at, occurred_at, id)
      WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('domain_events');
}
