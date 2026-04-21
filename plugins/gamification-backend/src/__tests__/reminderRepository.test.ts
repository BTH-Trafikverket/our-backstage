import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';
import { ReminderRepository } from '../repositories/reminderRepository';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

async function createQuest(
  knex: Knex,
  title: string,
  subjectType: 'user' | 'team' = 'user',
) {
  const id = randomUUID();

  await knex('quests').insert({
    id,
    title,
    description: `${title} description`,
    target_count: 1,
    xp_reward: 10,
    subject_type: subjectType,
  });

  return { id, title };
}

describePostgres18('ReminderRepository integration', () => {
  it('creates a user-scoped reminder', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'User Reminder Quest', 'user');

    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'user:default/alice',
      targetSubjectType: 'user',
      ruleKey: 'inactive-7d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 7 },
    });

    expect(reminder.quest_id).toBe(quest.id);
    expect(reminder.target_subject_ref).toBe('user:default/alice');
    expect(reminder.target_subject_type).toBe('user');
    expect(reminder.rule_key).toBe('inactive-7d');
    expect(reminder.rule_kind).toBe('activity');
    expect(reminder.reason_payload).toEqual({ inactiveDays: 7 });
    expect(reminder.status).toBe('active');
    expect(reminder.created_at).toBeInstanceOf(Date);
    expect(reminder.updated_at).toBeInstanceOf(Date);
    expect(reminder.last_generated_at).toBeInstanceOf(Date);

    const stored = await knex('quest_reminders')
      .where({ id: reminder.id })
      .first();
    expect(stored).toBeDefined();
    expect(stored.target_subject_ref).toBe('user:default/alice');
  });

  it('creates a team-scoped reminder', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Team Reminder Quest', 'team');

    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-14d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 14 },
    });

    expect(reminder.target_subject_ref).toBe('group:default/platform');
    expect(reminder.target_subject_type).toBe('team');

    const stored = await knex('quest_reminders')
      .where({ id: reminder.id })
      .first();
    expect(stored).toBeDefined();
    expect(stored.target_subject_type).toBe('team');
  });

  it('refreshes an existing reminder without duplicating the row or wiping viewer state', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Refresh Reminder Quest', 'team');
    const firstGeneratedAt = new Date('2026-04-01T00:00:00.000Z');
    const refreshedGeneratedAt = new Date('2026-04-10T00:00:00.000Z');

    const original = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-14d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 14, missingTasks: 2 },
      lastGeneratedAt: firstGeneratedAt,
    });

    await repository.dismissReminderForViewer(
      original.id,
      'user:default/alice',
    );

    const refreshed = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-14d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 21, missingTasks: 5 },
      lastGeneratedAt: refreshedGeneratedAt,
    });

    const reminderRows = await knex('quest_reminders').select('*');
    const viewerRows = await knex('quest_reminder_viewer_state').select([
      'reminder_id',
      'viewer_subject_ref',
      'state',
    ]);

    expect(refreshed.id).toBe(original.id);
    expect(reminderRows).toHaveLength(1);
    expect(refreshed.reason_payload).toEqual({
      inactiveDays: 21,
      missingTasks: 5,
    });
    expect(new Date(refreshed.last_generated_at).toISOString()).toBe(
      refreshedGeneratedAt.toISOString(),
    );
    expect(viewerRows).toEqual([
      {
        reminder_id: original.id,
        viewer_subject_ref: 'user:default/alice',
        state: 'dismissed',
      },
    ]);
  });

  it('shows the same team reminder to multiple team members independently', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Shared Team Reminder Quest', 'team');
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-30d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 30 },
    });

    const aliceView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/alice',
      teamRefs: ['group:default/platform'],
    });
    const bobView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/bob',
      teamRefs: ['group:default/platform'],
    });

    expect(aliceView).toHaveLength(1);
    expect(bobView).toHaveLength(1);
    expect(aliceView[0]).toMatchObject({
      id: reminder.id,
      viewer_state: 'active',
      quest_title: 'Shared Team Reminder Quest',
    });
    expect(bobView[0]).toMatchObject({
      id: reminder.id,
      viewer_state: 'active',
      quest_title: 'Shared Team Reminder Quest',
    });
  });

  it('hides a dismissed reminder only for the viewer who dismissed it', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Dismiss Reminder Quest', 'team');
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-7d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 7 },
    });

    await repository.dismissReminderForViewer(
      reminder.id,
      'user:default/alice',
    );

    const aliceView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/alice',
      teamRefs: ['group:default/platform'],
    });
    const bobView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/bob',
      teamRefs: ['group:default/platform'],
    });

    expect(aliceView).toEqual([]);
    expect(bobView).toHaveLength(1);
    expect(bobView[0].id).toBe(reminder.id);
  });

  it('hides a disabled reminder only for the viewer who disabled it', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Disable Reminder Quest', 'team');
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'inactive-45d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 45 },
    });

    await repository.disableReminderForViewer(
      reminder.id,
      'user:default/alice',
    );

    const aliceView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/alice',
      teamRefs: ['group:default/platform'],
    });
    const bobView = await repository.listVisibleRemindersForViewer({
      viewerSubjectRef: 'user:default/bob',
      teamRefs: ['group:default/platform'],
    });

    expect(aliceView).toEqual([]);
    expect(bobView).toHaveLength(1);
    expect(bobView[0].id).toBe(reminder.id);
  });

  it('looks up reminders by their durable identity', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(knex, 'Identity Reminder Quest', 'user');
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'user:default/alice',
      targetSubjectType: 'user',
      ruleKey: 'inactive-identity',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 14 },
    });

    await expect(
      repository.getReminderByIdentity(
        quest.id,
        'user:default/alice',
        'inactive-identity',
      ),
    ).resolves.toMatchObject({
      id: reminder.id,
      quest_id: quest.id,
      target_subject_ref: 'user:default/alice',
      rule_key: 'inactive-identity',
    });
    await expect(
      repository.getReminderByIdentity(
        quest.id,
        'user:default/bob',
        'inactive-identity',
      ),
    ).resolves.toBeUndefined();
  });

  it('returns the per-viewer state used by evaluation suppression', async () => {
    const knex = await initDb();
    const repository = new ReminderRepository(knex);
    const quest = await createQuest(
      knex,
      'Viewer State Reminder Quest',
      'user',
    );
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'user:default/alice',
      targetSubjectType: 'user',
      ruleKey: 'inactive-viewer-state',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 21 },
    });

    await expect(
      repository.getViewerState(reminder.id, 'user:default/alice'),
    ).resolves.toBeUndefined();

    await repository.dismissReminderForViewer(
      reminder.id,
      'user:default/alice',
    );

    await expect(
      repository.getViewerState(reminder.id, 'user:default/alice'),
    ).resolves.toBe('dismissed');

    await repository.disableReminderForViewer(
      reminder.id,
      'user:default/alice',
    );

    await expect(
      repository.getViewerState(reminder.id, 'user:default/alice'),
    ).resolves.toBe('disabled');
  });

  it('blocks invalid reminder state values with database constraints', async () => {
    const knex = await initDb();
    const quest = await createQuest(
      knex,
      'Invalid Reminder State Quest',
      'user',
    );

    await expect(
      knex('quest_reminders').insert({
        id: randomUUID(),
        quest_id: quest.id,
        target_subject_ref: 'user:default/alice',
        target_subject_type: 'user',
        rule_key: 'invalid-status',
        rule_kind: 'activity',
        reason_payload: knex.raw(`'{}'::jsonb`),
        status: 'paused',
      }),
    ).rejects.toThrow();

    const repository = new ReminderRepository(knex);
    const reminder = await repository.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'user:default/alice',
      targetSubjectType: 'user',
      ruleKey: 'inactive-7d',
      ruleKind: 'activity',
      reasonPayload: { inactiveDays: 7 },
    });

    await expect(
      knex('quest_reminder_viewer_state').insert({
        reminder_id: reminder.id,
        viewer_subject_ref: 'user:default/alice',
        state: 'muted',
      }),
    ).rejects.toThrow();
  });
});
