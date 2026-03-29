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
});
