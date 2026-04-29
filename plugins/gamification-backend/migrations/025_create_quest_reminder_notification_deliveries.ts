import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(
    'quest_reminder_notification_deliveries',
    table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table
        .uuid('reminder_id')
        .notNullable()
        .references('id')
        .inTable('quest_reminders')
        .onUpdate('CASCADE')
        .onDelete('CASCADE');
      table.text('delivery_window_key').notNullable();
      table
        .text('status')
        .notNullable()
        .defaultTo('sending')
        .checkIn(
          ['sending', 'sent'],
          'quest_reminder_notification_deliveries_status_check',
        );
      table.timestamp('sent_at', { useTz: true }).nullable();
      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['reminder_id', 'delivery_window_key'], {
        indexName:
          'quest_reminder_notification_deliveries_reminder_window_unique',
      });
      table.index(
        ['reminder_id'],
        'quest_reminder_notification_deliveries_reminder_id_idx',
      );
      table.index(
        ['status'],
        'quest_reminder_notification_deliveries_status_idx',
      );
    },
  );

  await knex.raw(`
    CREATE TRIGGER trg_quest_reminder_notification_deliveries_set_updated_at
    BEFORE UPDATE ON quest_reminder_notification_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quest_reminder_notification_deliveries_set_updated_at
    ON quest_reminder_notification_deliveries;
  `);
  await knex.schema.dropTableIfExists('quest_reminder_notification_deliveries');
}
