import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await knex.schema.createTable('badges', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('title').notNullable();
    table.text('description').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['title'], { indexName: 'badges_title_unique' });
    table.index(['created_at'], 'badges_created_at_idx');
  });

  await knex.schema.createTable('badge_criteria', table => {
    table.uuid('badge_id').notNullable();
    table.uuid('quest_id').notNullable();
    table.integer('target_count').notNullable();

    table.primary(['badge_id', 'quest_id']);

    table
      .foreign('badge_id')
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');
    table
      .foreign('quest_id')
      .references('id')
      .inTable('quests')
      .onDelete('CASCADE');

    table.check('target_count >= 1', [], 'badge_criteria_target_count_check');
    table.index(['quest_id'], 'badge_criteria_quest_id_idx');
  });

  await knex.raw(`
    CREATE TRIGGER trg_badges_set_updated_at
    BEFORE UPDATE ON badges
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS trg_badges_set_updated_at ON badges;`);
  await knex.schema.dropTableIfExists('badge_criteria');
  await knex.schema.dropTableIfExists('badges');
}
