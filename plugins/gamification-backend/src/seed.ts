import type { Knex } from 'knex';
import { seed001Core } from '../seeds/001_core';
import { seed002EventTriggers } from '../seeds/002_evet_triggers';
import { seed003DemoEvents } from '../seeds/003_demo_progress';
import { seed004Badges } from '../seeds/004_badges';

export async function runSeeds(knex: Knex, opts: { reset?: boolean } = {}) {
  await knex.transaction(async trx => {
    if (opts.reset) {
      await trx('earned_badges').del();
      await trx('badge_criteria').del();
      await trx('badges').del();
      await trx('xp_ledger').del();
      await trx('quest_progress').del();
      await trx('quests').del();
    }

    const ctx = { knex: trx };

    for (const seed of [
      seed001Core,
      seed002EventTriggers,
      seed003DemoEvents,
      seed004Badges,
    ]) {
      await seed.run(ctx);
    }
  });
}
