import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('webhooks', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('title').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('url').notNullable();
    table
      .text('trigger_event_name')
      .notNullable()
      .references('name')
      .inTable('webhook_trigger_events')
      .onUpdate('CASCADE')
      .onDelete('RESTRICT');
    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['created_at'], 'webhooks_created_at_idx');
    table.index(['trigger_event_name'], 'webhooks_trigger_event_name_idx');
  });

  await knex.raw(`
    CREATE TRIGGER trg_webhooks_set_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_webhooks_set_updated_at
    ON webhooks;
  `);
  await knex.schema.dropTableIfExists('webhooks');
}
