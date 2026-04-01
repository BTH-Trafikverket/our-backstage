import type { Knex } from 'knex';

const DEFAULT_WEBHOOK_TRIGGER_EVENTS = [
  'quest.completed',
  'user.leveled_up',
  'badge.earned',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('webhook_trigger_events', table => {
    table.text('name').primary();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex('webhook_trigger_events')
    .insert(DEFAULT_WEBHOOK_TRIGGER_EVENTS.map(name => ({ name })))
    .onConflict('name')
    .ignore();

  await knex.raw(`
    CREATE TRIGGER trg_webhook_trigger_events_set_updated_at
    BEFORE UPDATE ON webhook_trigger_events
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_webhook_trigger_events_set_updated_at
    ON webhook_trigger_events;
  `);
  await knex.schema.dropTableIfExists('webhook_trigger_events');
}
