import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { LeaderboardRepository } from '../repositories/leaderboardRepository';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('LeaderboardRepository integration', () => {
  async function createQuest(knex: Knex, questId: string) {
    await knex('quests').insert({
      id: questId,
      title: `Quest ${questId.substring(0, 8)}`,
      description: 'Leaderboard test quest',
      target_count: 1,
      xp_reward: 1,
    });
  }

  async function seedXpAwards(
    knex: Knex,
    subjectRef: string,
    xpAmounts: number[],
    createdAt?: Date,
  ) {
    const questId = randomUUID();
    await createQuest(knex, questId);

    await knex('xp_awards').insert(
      xpAmounts.map((xpAmount, index) => ({
        id: randomUUID(),
        subject_ref: subjectRef,
        quest_id: questId,
        awarded_on_completion_count: index + 1,
        xp_amount: xpAmount,
        source: 'leaderboard_test',
        ...(createdAt ? { created_at: createdAt } : {}),
      })),
    );
  }

  it('returns the top user leaderboard ordered by total xp and then subject ref', async () => {
    const knex = await initDb();
    const repository = new LeaderboardRepository(knex);

    await seedXpAwards(knex, 'user:default/zoe', [100, 150]);
    await seedXpAwards(knex, 'user:default/alice', [125, 125]);
    await seedXpAwards(knex, 'user:default/bob', [90]);
    await seedXpAwards(knex, 'group:default/platform', [999]);

    await expect(
      repository.getLeaderboardPage({
        subjectType: 'user',
        page: 1,
        limit: 25,
        createdAtGte: undefined,
        createdAtLt: undefined,
      }),
    ).resolves.toEqual({
      data: [
        { subject_ref: 'user:default/alice', total_xp: 250 },
        { subject_ref: 'user:default/zoe', total_xp: 250 },
        { subject_ref: 'user:default/bob', total_xp: 90 },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 3,
        totalPages: 1,
      },
    });
  });

  it('filters to groups and respects page and limit offsets', async () => {
    const knex = await initDb();
    const repository = new LeaderboardRepository(knex);

    await seedXpAwards(knex, 'group:default/core', [500]);
    await seedXpAwards(knex, 'group:default/platform', [400]);
    await seedXpAwards(knex, 'group:default/payments', [300]);
    await seedXpAwards(knex, 'group:default/ops', [200]);
    await seedXpAwards(knex, 'user:default/alice', [999]);

    await expect(
      repository.getLeaderboardPage({
        subjectType: 'group',
        page: 2,
        limit: 2,
        createdAtGte: undefined,
        createdAtLt: undefined,
      }),
    ).resolves.toEqual({
      data: [
        { subject_ref: 'group:default/payments', total_xp: 300 },
        { subject_ref: 'group:default/ops', total_xp: 200 },
      ],
      pagination: {
        page: 2,
        limit: 2,
        total: 4,
        totalPages: 2,
      },
    });
  });

  it('filters leaderboard rows by created_at time windows', async () => {
    const knex = await initDb();
    const repository = new LeaderboardRepository(knex);

    await seedXpAwards(
      knex,
      'user:default/current-month',
      [200],
      new Date('2026-04-02T12:00:00Z'),
    );
    await seedXpAwards(
      knex,
      'user:default/previous-month',
      [300],
      new Date('2026-03-31T21:00:00Z'),
    );
    await seedXpAwards(
      knex,
      'user:default/current-week',
      [150],
      new Date('2026-04-04T09:00:00Z'),
    );

    await expect(
      repository.getLeaderboardPage({
        subjectType: 'user',
        page: 1,
        limit: 25,
        createdAtGte: new Date('2026-04-01T00:00:00Z'),
        createdAtLt: new Date('2026-05-01T00:00:00Z'),
      }),
    ).resolves.toEqual({
      data: [
        { subject_ref: 'user:default/current-month', total_xp: 200 },
        { subject_ref: 'user:default/current-week', total_xp: 150 },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });
  });
});
