import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  const exists = await knex.schema.hasTable('quest_event_triggers');
  if (exists) return;

  await knex.schema.createTable('quest_event_triggers', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.text('event_key').notNullable();
    table.uuid('quest_id').notNullable();

    table.integer('increment_by').notNullable().defaultTo(1);
    table.boolean('enabled').notNullable().defaultTo(true);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.unique(['event_key', 'quest_id'], {
      indexName: 'quest_event_triggers_event_quest_unique',
    });

    table.index(['event_key'], 'quest_event_triggers_event_key_idx');
    table.index(['quest_id'], 'quest_event_triggers_quest_id_idx');

    table.check(
      'increment_by >= 1',
      [],
      'quest_event_triggers_increment_check',
    );
  });

  await knex.raw(`
    CREATE TRIGGER trg_quest_event_triggers_set_updated_at
    BEFORE UPDATE ON quest_event_triggers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_quest_event_triggers_set_updated_at ON quest_event_triggers;`,
  );
  await knex.schema.dropTableIfExists('quest_event_triggers');
}
