import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';
import { ScheduledWebhookSummaryRepository } from '../repositories/scheduledWebhookSummaryRepository';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('ScheduledWebhookSummaryRepository integration', () => {
  it('builds summary stats for a closed reporting window', async () => {
    const knex = await initDb();
    const repository = new ScheduledWebhookSummaryRepository(knex);
    const periodStart = new Date('2026-03-31T00:00:00.000Z');
    const periodEndExclusive = new Date('2026-04-01T00:00:00.000Z');
    const questIds = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000005',
      '20000000-0000-4000-8000-000000000006',
      '20000000-0000-4000-8000-000000000007',
    ];

    await knex('quests').insert([
      {
        id: questIds[0],
        title: 'Scheduled Summary User 1',
        target_count: 1,
        xp_reward: 120,
        subject_type: 'user',
      },
      {
        id: questIds[1],
        title: 'Scheduled Summary User 2',
        target_count: 1,
        xp_reward: 90,
        subject_type: 'user',
      },
      {
        id: questIds[2],
        title: 'Scheduled Summary User 3',
        target_count: 1,
        xp_reward: 60,
        subject_type: 'user',
      },
      {
        id: questIds[3],
        title: 'Scheduled Summary Team 1',
        target_count: 1,
        xp_reward: 250,
        subject_type: 'team',
      },
      {
        id: questIds[4],
        title: 'Scheduled Summary Team 2',
        target_count: 1,
        xp_reward: 200,
        subject_type: 'team',
      },
      {
        id: questIds[5],
        title: 'Scheduled Summary Team 3',
        target_count: 1,
        xp_reward: 150,
        subject_type: 'team',
      },
      {
        id: questIds[6],
        title: 'Scheduled Summary Outside',
        target_count: 1,
        xp_reward: 999,
        subject_type: 'user',
      },
    ]);

    await knex('domain_events').insert([
      {
        event_name: 'quest.completed',
        source_table: 'xp_awards',
        source_id: 'quest-1',
        subject_ref: 'user:default/alice',
        payload: { username: 'alice' },
        occurred_at: new Date('2026-03-31T09:00:00.000Z'),
        available_at: new Date('2026-03-31T09:00:00.000Z'),
      },
      {
        event_name: 'quest.completed',
        source_table: 'xp_awards',
        source_id: 'quest-2',
        subject_ref: 'user:default/bob',
        payload: { username: 'bob' },
        occurred_at: new Date('2026-03-31T12:00:00.000Z'),
        available_at: new Date('2026-03-31T12:00:00.000Z'),
      },
      {
        event_name: 'badge.earned',
        source_table: 'earned_badges',
        source_id: 'badge-1',
        subject_ref: 'user:default/alice',
        payload: { username: 'alice' },
        occurred_at: new Date('2026-03-31T13:00:00.000Z'),
        available_at: new Date('2026-03-31T13:00:00.000Z'),
      },
      {
        event_name: 'quest.completed',
        source_table: 'xp_awards',
        source_id: 'quest-outside',
        subject_ref: 'user:default/zoe',
        payload: { username: 'zoe' },
        occurred_at: new Date('2026-04-01T01:00:00.000Z'),
        available_at: new Date('2026-04-01T01:00:00.000Z'),
      },
    ]);

    await knex('xp_awards').insert([
      {
        id: '10000000-0000-4000-8000-000000000001',
        subject_ref: 'user:default/alice',
        quest_id: questIds[0],
        awarded_on_completion_count: 1,
        xp_amount: 120,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T08:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        subject_ref: 'user:default/bob',
        quest_id: questIds[1],
        awarded_on_completion_count: 1,
        xp_amount: 90,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T10:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        subject_ref: 'user:default/charlie',
        quest_id: questIds[2],
        awarded_on_completion_count: 1,
        xp_amount: 60,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T11:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000004',
        subject_ref: 'group:default/payments',
        quest_id: questIds[3],
        awarded_on_completion_count: 1,
        xp_amount: 250,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T14:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000005',
        subject_ref: 'group:default/ops',
        quest_id: questIds[4],
        awarded_on_completion_count: 1,
        xp_amount: 200,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T15:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000006',
        subject_ref: 'group:default/design',
        quest_id: questIds[5],
        awarded_on_completion_count: 1,
        xp_amount: 150,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-03-31T16:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000007',
        subject_ref: 'user:default/outside',
        quest_id: questIds[6],
        awarded_on_completion_count: 1,
        xp_amount: 999,
        source: 'scheduled-summary-test',
        created_at: new Date('2026-04-01T01:00:00.000Z'),
      },
    ]);

    await expect(
      repository.getSummary({ periodStart, periodEndExclusive }),
    ).resolves.toEqual(
      expect.objectContaining({
        total_quests_completed: 2,
        total_badges_earned: 1,
        total_badges_completed: 1,
        total_xp_awarded: 870,
        total_xp_overall: 870,
        top_user_name: 'alice',
        top_user_ref: 'user:default/alice',
        top_user_xp: 120,
        top_team_name: 'payments',
        top_team_ref: 'group:default/payments',
        top_team_xp: 250,
        top_2_user_name: 'bob',
        top_2_user_xp: 90,
        top_3_team_name: 'design',
        top_3_team_xp: 150,
        top_users: [
          {
            rank: 1,
            subject_ref: 'user:default/alice',
            subject_name: 'alice',
            total_xp: 120,
          },
          {
            rank: 2,
            subject_ref: 'user:default/bob',
            subject_name: 'bob',
            total_xp: 90,
          },
          {
            rank: 3,
            subject_ref: 'user:default/charlie',
            subject_name: 'charlie',
            total_xp: 60,
          },
        ],
      }),
    );

    await knex.destroy();
  });
});
