import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';
import { QuestsRepository } from '../repositories/questsRepository';
import { ReminderRepository } from '../repositories/reminderRepository';
import { ReminderEvaluationService } from '../services/reminderEvaluationService';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

function createLogger(): jest.Mocked<LoggerService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  } as unknown as jest.Mocked<LoggerService>;
}

async function createUserQuest(knex: Knex, title: string) {
  const questsRepo = new QuestsRepository(knex);

  return questsRepo.createQuest({
    title,
    description: `${title} description`,
    target_count: 1,
    xp_reward: 10,
    subject_type: 'user',
  });
}

async function insertQuestReceipt(params: {
  knex: Knex;
  questId: string;
  eventId: string;
  subjectRef: string;
  receivedAt: Date;
}) {
  await params.knex('quest_event_receipts').insert({
    event_id: params.eventId,
    event_key: `quest:${params.questId}`,
    subject_ref: params.subjectRef,
    caller_subject: 'external:default/github',
    received_at: params.receivedAt,
  });
}

describePostgres18('ReminderEvaluationService integration', () => {
  it('creates an inactivity reminder from quest_event_receipts and stores a human-readable reason', async () => {
    const knex = await initDb();
    const questsRepo = new QuestsRepository(knex);
    const reminderRepo = new ReminderRepository(knex);
    const logger = createLogger();
    const quest = await createUserQuest(knex, 'Review PR Reminder Quest');

    await insertQuestReceipt({
      knex,
      questId: quest.id,
      eventId: 'evt-review-1',
      subjectRef: 'user:default/alice',
      receivedAt: new Date('2026-04-01T09:00:00.000Z'),
    });

    const service = new ReminderEvaluationService({
      questsRepo,
      reminderRepo,
      logger,
      now: () => new Date('2026-04-20T09:00:00.000Z'),
      rules: [
        {
          key: 'inactive-pr-review-14d',
          questId: quest.id,
          inactivityDays: 14,
          activityDescription: 'reviewed a PR',
        },
      ],
    });

    await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
      createdCount: 1,
      refreshedCount: 0,
      suppressedCount: 0,
      skippedRuleCount: 0,
    });

    await expect(
      reminderRepo.getReminderByIdentity(
        quest.id,
        'user:default/alice',
        'inactive-pr-review-14d',
      ),
    ).resolves.toMatchObject({
      quest_id: quest.id,
      target_subject_ref: 'user:default/alice',
      target_subject_type: 'user',
      rule_key: 'inactive-pr-review-14d',
      rule_kind: 'activity',
      status: 'active',
      reason_payload: {
        message: 'You have not reviewed a PR in two weeks',
        activitySource: 'quest_event_receipts',
        activityDescription: 'reviewed a PR',
        latestActivityAt: '2026-04-01T09:00:00.000Z',
        inactivityDays: 14,
      },
    });
  });

  it('refreshes the existing reminder row instead of creating duplicates on repeat runs', async () => {
    const knex = await initDb();
    const questsRepo = new QuestsRepository(knex);
    const reminderRepo = new ReminderRepository(knex);
    const logger = createLogger();
    const quest = await createUserQuest(knex, 'Repeat Reminder Quest');
    let now = new Date('2026-04-20T09:00:00.000Z');

    await insertQuestReceipt({
      knex,
      questId: quest.id,
      eventId: 'evt-repeat-1',
      subjectRef: 'user:default/alice',
      receivedAt: new Date('2026-03-31T09:00:00.000Z'),
    });

    const service = new ReminderEvaluationService({
      questsRepo,
      reminderRepo,
      logger,
      now: () => now,
      rules: [
        {
          key: 'inactive-repeat-14d',
          questId: quest.id,
          inactivityDays: 14,
          activityDescription: 'reviewed a PR',
        },
      ],
    });

    await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
      createdCount: 1,
      refreshedCount: 0,
    });

    now = new Date('2026-04-21T12:00:00.000Z');

    await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
      createdCount: 0,
      refreshedCount: 1,
    });

    const reminderRows = await knex('quest_reminders').select('*');
    expect(reminderRows).toHaveLength(1);
    expect(new Date(reminderRows[0].last_generated_at).toISOString()).toBe(
      '2026-04-21T12:00:00.000Z',
    );
  });

  it('suppresses generation when the reminder row is disabled', async () => {
    const knex = await initDb();
    const questsRepo = new QuestsRepository(knex);
    const reminderRepo = new ReminderRepository(knex);
    const logger = createLogger();
    const quest = await createUserQuest(knex, 'Disabled Reminder Quest');
    const originalGeneratedAt = new Date('2026-04-10T08:00:00.000Z');

    await insertQuestReceipt({
      knex,
      questId: quest.id,
      eventId: 'evt-disabled-1',
      subjectRef: 'user:default/alice',
      receivedAt: new Date('2026-03-20T09:00:00.000Z'),
    });

    const reminder = await reminderRepo.createOrRefreshReminder({
      questId: quest.id,
      targetSubjectRef: 'user:default/alice',
      targetSubjectType: 'user',
      ruleKey: 'inactive-disabled-14d',
      ruleKind: 'activity',
      reasonPayload: { message: 'Original reminder' },
      status: 'disabled',
      lastGeneratedAt: originalGeneratedAt,
    });

    const service = new ReminderEvaluationService({
      questsRepo,
      reminderRepo,
      logger,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      rules: [
        {
          key: 'inactive-disabled-14d',
          questId: quest.id,
          inactivityDays: 14,
          activityDescription: 'reviewed a PR',
        },
      ],
    });

    await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
      createdCount: 0,
      refreshedCount: 0,
      suppressedCount: 1,
    });

    await expect(
      reminderRepo.getReminderById(reminder.id),
    ).resolves.toMatchObject({
      id: reminder.id,
      status: 'disabled',
      last_generated_at: originalGeneratedAt,
    });
  });

  it.each(['dismissed', 'disabled'] as const)(
    'suppresses generation when the target user has viewer state %s',
    async viewerState => {
      const knex = await initDb();
      const questsRepo = new QuestsRepository(knex);
      const reminderRepo = new ReminderRepository(knex);
      const logger = createLogger();
      const quest = await createUserQuest(
        knex,
        `${viewerState} viewer reminder`,
      );
      const originalGeneratedAt = new Date('2026-04-10T08:00:00.000Z');

      await insertQuestReceipt({
        knex,
        questId: quest.id,
        eventId: `evt-viewer-${viewerState}`,
        subjectRef: 'user:default/alice',
        receivedAt: new Date('2026-03-25T09:00:00.000Z'),
      });

      const reminder = await reminderRepo.createOrRefreshReminder({
        questId: quest.id,
        targetSubjectRef: 'user:default/alice',
        targetSubjectType: 'user',
        ruleKey: 'inactive-viewer-14d',
        ruleKind: 'activity',
        reasonPayload: { message: 'Original reminder' },
        status: 'active',
        lastGeneratedAt: originalGeneratedAt,
      });

      if (viewerState === 'dismissed') {
        await reminderRepo.dismissReminderForViewer(
          reminder.id,
          'user:default/alice',
        );
      } else {
        await reminderRepo.disableReminderForViewer(
          reminder.id,
          'user:default/alice',
        );
      }

      const service = new ReminderEvaluationService({
        questsRepo,
        reminderRepo,
        logger,
        now: () => new Date('2026-04-21T12:00:00.000Z'),
        rules: [
          {
            key: 'inactive-viewer-14d',
            questId: quest.id,
            inactivityDays: 14,
            activityDescription: 'reviewed a PR',
          },
        ],
      });

      await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
        createdCount: 0,
        refreshedCount: 0,
        suppressedCount: 1,
      });

      await expect(
        reminderRepo.getReminderByIdentity(
          quest.id,
          'user:default/alice',
          'inactive-viewer-14d',
        ),
      ).resolves.toMatchObject({
        id: reminder.id,
        last_generated_at: originalGeneratedAt,
      });
    },
  );

  it('skips archived quests and logs the rule as skipped', async () => {
    const knex = await initDb();
    const questsRepo = new QuestsRepository(knex);
    const reminderRepo = new ReminderRepository(knex);
    const logger = createLogger();
    const quest = await createUserQuest(knex, 'Archived Reminder Quest');

    await knex('quests')
      .where({ id: quest.id })
      .update({ archived_at: new Date('2026-04-15T00:00:00.000Z') });

    const service = new ReminderEvaluationService({
      questsRepo,
      reminderRepo,
      logger,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      rules: [
        {
          key: 'inactive-archived-14d',
          questId: quest.id,
          inactivityDays: 14,
          activityDescription: 'reviewed a PR',
        },
      ],
    });

    await expect(service.evaluateConfiguredRules()).resolves.toMatchObject({
      createdCount: 0,
      refreshedCount: 0,
      suppressedCount: 0,
      skippedRuleCount: 1,
      ruleResults: [
        expect.objectContaining({
          ruleKey: 'inactive-archived-14d',
          questId: quest.id,
          skippedReason: 'missing_quest',
        }),
      ],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `quest '${quest.id}' was not found or is archived`,
      ),
    );
  });
});
