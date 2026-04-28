import type { Knex } from 'knex';
import { seed001Core } from '../seeds/001_core';
import { seed003DemoEvents } from '../seeds/003_demo_progress';
import { seed004Badges } from '../seeds/004_badges';
import { seed005ReminderDemo } from '../seeds/005_reminder_demo';

export async function runSeeds(knex: Knex, opts: { reset?: boolean } = {}) {
  await knex.transaction(async trx => {
    if (opts.reset) {
      const tablesToClear = [
        'domain_events',
        'events_ran',
        'quest_event_receipts',
        'earned_badges',
        'badge_criteria_completion',
        'xp_awards',
        'subject_xp_state',
        'quest_progress',
      ];
      const hasBadgesTable = await trx.schema.hasTable('badges');

      for (const tableName of tablesToClear) {
        if (await trx.schema.hasTable(tableName)) {
          await trx(tableName).del();
        }
      }

      if (hasBadgesTable) {
        await trx('badges').del();
      }
      await trx('quests').del();
    }

    const ctx = { knex: trx };

    for (const seed of [
      seed001Core,
      seed004Badges,
      seed003DemoEvents,
      seed005ReminderDemo,
    ]) {
      await seed.run(ctx);
    }
  });
}
