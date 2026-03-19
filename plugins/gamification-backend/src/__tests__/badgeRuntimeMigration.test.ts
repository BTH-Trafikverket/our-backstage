import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb, migrationsDir } =
  createPostgres18TestHarness(__dirname);

describePostgres18('badge runtime persistence migration', () => {
  const runtimeMigration = '012_create_badge_triggers.ts';

  async function migrateThroughLegacySchema(knex: Knex): Promise<void> {
    const migrationNames = fs
      .readdirSync(migrationsDir)
      .filter(name => name.endsWith('.ts') && name < runtimeMigration)
      .sort();

    for (const name of migrationNames) {
      await knex.migrate.up({ directory: migrationsDir, name });
    }
  }

  it('backfills badge runtime tables from existing quest_progress rows', async () => {
    const knex = await initDb({ migrateLatest: false });

    await migrateThroughLegacySchema(knex);

    const questA = randomUUID();
    const questB = randomUUID();
    const badgeId = randomUUID();
    const subjectRef = 'group:default/platform';

    await knex('quests').insert([
      {
        id: questA,
        title: 'Legacy Badge Quest A',
        description: '',
        target_count: 1,
        xp_reward: 100,
      },
      {
        id: questB,
        title: 'Legacy Badge Quest B',
        description: '',
        target_count: 1,
        xp_reward: 100,
      },
    ]);

    await knex('badges').insert({
      id: badgeId,
      title: 'Legacy Badge',
      description: 'Migrated from live computation',
      xp_reward: 75,
    });

    await knex('badge_criteria').insert([
      { badge_id: badgeId, quest_id: questA, target_count: 2 },
      { badge_id: badgeId, quest_id: questB, target_count: 1 },
    ]);

    await knex('quest_progress').insert([
      {
        subject_ref: subjectRef,
        quest_id: questA,
        completion_count: 2,
      },
      {
        subject_ref: subjectRef,
        quest_id: questB,
        completion_count: 1,
      },
    ]);

    await knex.migrate.up({
      directory: migrationsDir,
      name: runtimeMigration,
    });

    const badge = await knex('badges').where({ id: badgeId }).first();
    const criteriaCompletion = await knex('badge_criteria_completion')
      .select(['subject_ref', 'badge_id', 'quest_id'])
      .orderBy([
        { column: 'badge_id', order: 'asc' },
        { column: 'quest_id', order: 'asc' },
      ]);
    const earnedBadges = await knex('earned_badges')
      .select(['subject_ref', 'badge_id'])
      .orderBy([
        { column: 'subject_ref', order: 'asc' },
        { column: 'badge_id', order: 'asc' },
      ]);
    const badgeXpAwards = await knex('xp_awards')
      .select(['subject_ref', 'badge_id', 'quest_id', 'xp_amount', 'source'])
      .where({ badge_id: badgeId })
      .orderBy('subject_ref', 'asc');

    expect(badge).toMatchObject({
      id: badgeId,
      archived_at: null,
    });
    const expectedCriteriaCompletion = [
      {
        subject_ref: subjectRef,
        badge_id: badgeId,
        quest_id: questA,
      },
      {
        subject_ref: subjectRef,
        badge_id: badgeId,
        quest_id: questB,
      },
    ].sort((a, b) => a.quest_id.localeCompare(b.quest_id));

    expect(criteriaCompletion).toEqual(expectedCriteriaCompletion);
    expect(earnedBadges).toEqual([
      {
        subject_ref: subjectRef,
        badge_id: badgeId,
      },
    ]);
    expect(badgeXpAwards).toEqual([
      {
        subject_ref: subjectRef,
        badge_id: badgeId,
        quest_id: null,
        xp_amount: 75,
        source: 'badge_completion_trigger',
      },
    ]);
  });

  it('does not backfill badge runtime rows from partial quest progress', async () => {
    const knex = await initDb({ migrateLatest: false });

    await migrateThroughLegacySchema(knex);

    const questId = randomUUID();
    const badgeId = randomUUID();
    const subjectRef = 'user:default/alice';

    await knex('quests').insert({
      id: questId,
      title: 'Legacy Multi-Step Quest',
      description: '',
      target_count: 5,
      xp_reward: 100,
    });

    await knex('badges').insert({
      id: badgeId,
      title: 'Legacy Milestone Badge',
      description: 'Should wait for a full quest completion',
      xp_reward: 75,
    });

    await knex('badge_criteria').insert({
      badge_id: badgeId,
      quest_id: questId,
      target_count: 1,
    });

    await knex('quest_progress').insert({
      subject_ref: subjectRef,
      quest_id: questId,
      completion_count: 4,
    });

    await knex.migrate.up({
      directory: migrationsDir,
      name: runtimeMigration,
    });

    expect(
      await knex('badge_criteria_completion').where({ badge_id: badgeId }),
    ).toEqual([]);
    expect(await knex('earned_badges').where({ badge_id: badgeId })).toEqual(
      [],
    );
    expect(await knex('xp_awards').where({ badge_id: badgeId })).toEqual([]);
  });
});
