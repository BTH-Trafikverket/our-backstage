import type { Knex } from 'knex';
import { seed001Core } from '../seeds/001_core';
import { seed002EventTriggers } from '../seeds/002_evet_triggers';
import { seed003DemoEvents } from '../seeds/003_demo_progress';
import { seed004Badges } from '../seeds/004_badges';

export async function runSeeds(knex: Knex, opts: { reset?: boolean } = {}) {
  await knex.transaction(async trx => {
    if (opts.reset) {
      const hasQuestEventReceiptsTable = await trx.schema.hasTable(
        'quest_event_receipts',
      );
      const hasBadgesTable = await trx.schema.hasTable('badges');

      if (hasQuestEventReceiptsTable) {
        await trx('quest_event_receipts').del();
      }
      await trx('xp_awards').del();
      await trx('quest_progress').del();
      if (hasBadgesTable) {
        await trx('badges').del();
      }
      await trx('quests').del();
    }

    const ctx = { knex: trx };

    for (const seed of [
      seed001Core,
      seed002EventTriggers,
      seed004Badges,
      seed003DemoEvents,
    ]) {
      await seed.run(ctx);
    }
  });
}
