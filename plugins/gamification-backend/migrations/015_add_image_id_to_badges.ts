import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badges', table => {
    table
      .integer('image_id')
      .nullable()
      .references('id')
      .inTable('badge_images')
      .onDelete('SET NULL'); // viktigt
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badges', table => {
    table.dropColumn('image_id');
  });
}
