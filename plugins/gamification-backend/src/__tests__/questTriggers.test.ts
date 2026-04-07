import { randomUUID } from 'node:crypto';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('quest_progress trigger -> xp_awards', () => {
  it('inserts xp_awards row when completion_count hits target_count multiple', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/alice';

    await knex('quests').insert({
      id: questId,
      title: 'Merge PRs',
      description: 'Merge a PR',
      target_count: 3,
      xp_reward: 10,
    });
    await knex('webhooks').insert({
      id: randomUUID(),
      title: 'Quest feed',
      description: '',
      url: 'https://example.com/webhooks/quest-feed',
      trigger_event_name: 'quest.completed',
      payload: { content: '{{username}} completed {{quest_title}}' },
    });

    await knex('quest_progress').insert({
      subject_ref: userRef,
      quest_id: questId,
      completion_count: 1,
    });

    expect(await knex('xp_awards').select('*')).toHaveLength(0);

    await knex('quest_progress')
      .where({ subject_ref: userRef, quest_id: questId })
      .update({ completion_count: 3 });

    const rows = await knex('xp_awards').select('*');
    const domainEvents = await knex('domain_events')
      .where({
        event_name: 'quest.completed',
        subject_ref: userRef,
        quest_id: questId,
      })
      .select('*');
    expect(rows).toHaveLength(1);
    expect(domainEvents).toHaveLength(1);
    expect(rows[0].subject_ref).toBe(userRef);
    expect(rows[0].quest_id).toBe(questId);
    expect(rows[0].awarded_on_completion_count).toBe(3);
    expect(rows[0].xp_amount).toBe(10);
    expect(domainEvents[0].payload).toEqual(
      expect.objectContaining({
        username: 'alice',
        quest_title: 'Merge PRs',
        completion_count: 3,
        xp_reward: 10,
      }),
    );
    expect(domainEvents[0].delivery_targets).toEqual([
      {
        id: expect.any(String),
        title: 'Quest feed',
        url: 'https://example.com/webhooks/quest-feed',
        payload: { content: '{{username}} completed {{quest_title}}' },
      },
    ]);
  });

  it('failsafe: does not award when completion_count stays the same', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/bob';

    await knex('quests').insert({
      id: questId,
      title: 'Build',
      description: '',
      target_count: 2,
      xp_reward: 7,
    });

    // Insert at a milestone => trigger should award once
    await knex('quest_progress').insert({
      subject_ref: userRef,
      quest_id: questId,
      completion_count: 2,
    });

    expect(await knex('xp_awards').select('*')).toHaveLength(1);

    // Update to same value => should not add another ledger row
    await knex('quest_progress')
      .where({ subject_ref: userRef, quest_id: questId })
      .update({ completion_count: 2 });

    expect(await knex('xp_awards').select('*')).toHaveLength(1);
  });

  it('failsafe: does not award when completion_count decreases', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const userRef = 'user:default/charlie';

    await knex('quests').insert({
      id: questId,
      title: 'Ship',
      description: '',
      target_count: 2,
      xp_reward: 5,
    });

    await knex('quest_progress').insert({
      subject_ref: userRef,
      quest_id: questId,
      completion_count: 2,
    });

    expect(await knex('xp_awards').select('*')).toHaveLength(1);

    await knex('quest_progress')
      .where({ subject_ref: userRef, quest_id: questId })
      .update({ completion_count: 1 });

    expect(await knex('xp_awards').select('*')).toHaveLength(1);
  });

  it('writes XP ledger entries for team subject refs', async () => {
    const knex = await initDb();

    const questId = randomUUID();
    const subjectRef = 'group:default/platform';

    await knex('quests').insert({
      id: questId,
      title: 'Team Dependency Cleanup',
      description: '',
      target_count: 2,
      xp_reward: 25,
      subject_type: 'team',
    });

    await knex('quest_progress').insert({
      subject_ref: subjectRef,
      quest_id: questId,
      completion_count: 2,
    });

    const rows = await knex('xp_awards').select('*');
    expect(rows).toHaveLength(1);
    expect(rows[0].subject_ref).toBe(subjectRef);
    expect(rows[0].quest_id).toBe(questId);
    expect(rows[0].xp_amount).toBe(25);
  });
});
