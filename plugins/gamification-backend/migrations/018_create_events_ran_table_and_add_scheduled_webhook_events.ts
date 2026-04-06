import type { Knex } from 'knex';

const SCHEDULED_WEBHOOK_TRIGGER_EVENTS = [
  'daily',
  'weekly',
  'monthly',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex('webhook_trigger_events')
    .insert(SCHEDULED_WEBHOOK_TRIGGER_EVENTS.map(name => ({ name })))
    .onConflict('name')
    .ignore();

  await knex.schema.createTable('events_ran', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('webhook_id')
      .notNullable()
      .references('id')
      .inTable('webhooks')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
    table
      .text('trigger_event_name')
      .notNullable()
      .references('name')
      .inTable('webhook_trigger_events')
      .onUpdate('CASCADE')
      .onDelete('RESTRICT');
    table.text('period_key').notNullable();
    table.text('time_zone').notNullable();
    table.timestamp('period_start', { useTz: true }).notNullable();
    table.timestamp('period_end_exclusive', { useTz: true }).notNullable();
    table
      .timestamp('executed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ['webhook_id', 'trigger_event_name', 'period_key'],
      'events_ran_webhook_id_trigger_event_name_period_key_unique',
    );
    table.index(['webhook_id'], 'events_ran_webhook_id_idx');
    table.index(['trigger_event_name'], 'events_ran_trigger_event_name_idx');
    table.index(['period_start'], 'events_ran_period_start_idx');
  });

  await knex.raw(`
    ALTER TABLE events_ran
    ADD CONSTRAINT events_ran_period_window_check
    CHECK (period_end_exclusive > period_start)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('events_ran');

  await knex('webhook_trigger_events')
    .whereIn('name', [...SCHEDULED_WEBHOOK_TRIGGER_EVENTS])
    .del();
}
