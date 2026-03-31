import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('events_ran', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('webhook_id')
      .notNullable()
      .references('id')
      .inTable('webhooks')
      .onDelete('CASCADE');
    table.text('event').notNullable();
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
      ['webhook_id', 'event', 'period_key'],
      'events_ran_webhook_id_event_period_key_uq',
    );
    table.index(['webhook_id'], 'events_ran_webhook_id_idx');
    table.index(['event'], 'events_ran_event_idx');
    table.index(['period_start'], 'events_ran_period_start_idx');
    table.check(
      'period_end_exclusive > period_start',
      [],
      'events_ran_period_bounds_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('events_ran');
}
