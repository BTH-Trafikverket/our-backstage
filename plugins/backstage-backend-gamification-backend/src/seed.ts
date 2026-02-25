import type { Knex } from 'knex';
import { seed001Core } from '../seeds/001_core';
import { seed002DemoEvents } from '../seeds/002_demo_progress';

export async function runSeeds(knex: Knex, opts: { reset?: boolean } = {}) {
  await knex.transaction(async trx => {
    if (opts.reset) {
      await trx('xp_ledger').del();
      await trx('quest_progress').del();
      await trx('quests').del();
    }

    const ctx = { knex: trx };

    for (const seed of [seed001Core, seed002DemoEvents]) {
      await seed.run(ctx);
    }
  });
}
