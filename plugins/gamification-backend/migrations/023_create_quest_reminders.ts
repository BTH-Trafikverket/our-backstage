import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('quest_reminders', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('quest_id')
      .notNullable()
      .references('id')
      .inTable('quests')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
    table.text('target_subject_ref').notNullable();
    table
      .specificType('target_subject_type', 'quest_subject_type')
      .notNullable();
    table.text('rule_key').notNullable();
    table.text('rule_kind').notNullable();
    table
      .jsonb('reason_payload')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .text('status')
      .notNullable()
      .defaultTo('active')
      .checkIn(['active', 'disabled'], 'quest_reminders_status_check');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('last_generated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['quest_id', 'target_subject_ref', 'rule_key'], {
      indexName: 'quest_reminders_identity_unique',
    });
    table.index(['quest_id'], 'quest_reminders_quest_id_idx');
    table.index(
      ['target_subject_type', 'target_subject_ref'],
      'quest_reminders_target_idx',
    );
    table.index(['status'], 'quest_reminders_status_idx');
    table.index(['last_generated_at'], 'quest_reminders_last_generated_at_idx');
  });

  await knex.raw(`
    CREATE TRIGGER trg_quest_reminders_set_updated_at
    BEFORE UPDATE ON quest_reminders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable('quest_reminder_viewer_state', table => {
    table
      .uuid('reminder_id')
      .notNullable()
      .references('id')
      .inTable('quest_reminders')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
    table.text('viewer_subject_ref').notNullable();
    table
      .text('state')
      .notNullable()
      .checkIn(
        ['dismissed', 'disabled'],
        'quest_reminder_viewer_state_state_check',
      );
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['reminder_id', 'viewer_subject_ref'], {
      constraintName: 'quest_reminder_viewer_state_pkey',
    });
    table.index(
      ['viewer_subject_ref'],
      'quest_reminder_viewer_state_viewer_subject_ref_idx',
    );
    table.index(['state'], 'quest_reminder_viewer_state_state_idx');
  });

  await knex.raw(`
    CREATE TRIGGER trg_quest_reminder_viewer_state_set_updated_at
    BEFORE UPDATE ON quest_reminder_viewer_state
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quest_reminder_viewer_state_set_updated_at
    ON quest_reminder_viewer_state;
  `);
  await knex.schema.dropTableIfExists('quest_reminder_viewer_state');

  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_quest_reminders_set_updated_at
    ON quest_reminders;
  `);
  await knex.schema.dropTableIfExists('quest_reminders');
}
