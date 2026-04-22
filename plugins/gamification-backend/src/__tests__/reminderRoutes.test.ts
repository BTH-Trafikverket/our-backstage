import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import type { UserInfoService } from '@backstage/backend-plugin-api';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';
import { ReminderRepository } from '../repositories/reminderRepository';
import { createRouter } from '../router';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

async function createQuest(
  knex: Knex,
  title: string,
  subjectType: 'user' | 'team',
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

async function createReminder(
  knex: Knex,
  params: {
    questId: string;
    targetSubjectRef: string;
    targetSubjectType: 'user' | 'team';
    ruleKey?: string;
    reasonPayload?: Record<string, unknown>;
  },
) {
  const repository = new ReminderRepository(knex);

  return repository.createOrRefreshReminder({
    questId: params.questId,
    targetSubjectRef: params.targetSubjectRef,
    targetSubjectType: params.targetSubjectType,
    ruleKey: params.ruleKey ?? `rule-${randomUUID()}`,
    ruleKind: 'activity',
    reasonPayload: params.reasonPayload ?? { inactiveDays: 7 },
  });
}

function makeApp(opts: { knex: Knex; userInfo?: UserInfoService }) {
  const httpAuth = mockServices.httpAuth();
  const userInfo = opts.userInfo ?? mockServices.userInfo();
  const config = mockServices.rootConfig();
  const auth = mockServices.auth();
  const discovery = mockServices.discovery();

  const app = express();
  app.use(
    '/api/backstage-backend-gamification',
    createRouter({
      httpAuth,
      userInfo,
      knex: opts.knex,
      config,
      auth,
      discovery,
    }),
  );
  app.use(mockErrorHandler());

  return { app };
}

describePostgres18('reminder routes', () => {
  it('lists reminders for the authenticated user', async () => {
    const knex = await initDb();
    const userRef = 'user:default/alice';
    const quest = await createQuest(knex, 'Personal Reminder Quest', 'user');
    await createReminder(knex, {
      questId: quest.id,
      targetSubjectRef: userRef,
      targetSubjectType: 'user',
      ruleKey: 'inactive-personal',
    });

    const { app } = makeApp({
      knex,
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/reminders')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body.reminders).toHaveLength(1);
    expect(res.body.reminders[0]).toMatchObject({
      quest_id: quest.id,
      quest_title: 'Personal Reminder Quest',
      target_subject_ref: userRef,
      target_subject_type: 'user',
      rule_key: 'inactive-personal',
      rule_kind: 'activity',
      reason_payload: { inactiveDays: 7 },
      viewer_state: 'active',
      status: 'active',
    });
  });

  it('lists reminders for ownership groups and hides unrelated team reminders', async () => {
    const knex = await initDb();
    const userRef = 'user:default/alice';
    const ownedQuest = await createQuest(
      knex,
      'Owned Team Reminder Quest',
      'team',
    );
    const unrelatedQuest = await createQuest(
      knex,
      'Unrelated Team Reminder Quest',
      'team',
    );

    await createReminder(knex, {
      questId: ownedQuest.id,
      targetSubjectRef: 'group:default/engineering',
      targetSubjectType: 'team',
      ruleKey: 'owned-team',
    });
    await createReminder(knex, {
      questId: unrelatedQuest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
      ruleKey: 'unrelated-team',
    });

    const { app } = makeApp({
      knex,
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/reminders')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body.reminders).toHaveLength(1);
    expect(res.body.reminders[0]).toMatchObject({
      quest_title: 'Owned Team Reminder Quest',
      target_subject_ref: 'group:default/engineering',
      target_subject_type: 'team',
      rule_key: 'owned-team',
    });
  });

  it('does not expose unrelated team reminders', async () => {
    const knex = await initDb();
    const userRef = 'user:default/alice';
    const quest = await createQuest(knex, 'Platform Reminder Quest', 'team');
    await createReminder(knex, {
      questId: quest.id,
      targetSubjectRef: 'group:default/platform',
      targetSubjectType: 'team',
    });

    const { app } = makeApp({
      knex,
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/reminders')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body.reminders).toEqual([]);
  });

  it.each(['dismiss', 'disable'] as const)(
    'rejects %s for inaccessible reminders',
    async action => {
      const knex = await initDb();
      const userRef = 'user:default/alice';
      const quest = await createQuest(
        knex,
        'Restricted Reminder Quest',
        'team',
      );
      const reminder = await createReminder(knex, {
        questId: quest.id,
        targetSubjectRef: 'group:default/platform',
        targetSubjectType: 'team',
      });

      const { app } = makeApp({
        knex,
        userInfo: mockServices.userInfo({
          ownershipEntityRefs: [userRef, 'group:default/engineering'],
        }),
      });

      const res = await request(app)
        .post(
          `/api/backstage-backend-gamification/reminders/${reminder.id}/${action}`,
        )
        .set('authorization', mockCredentials.user.header(userRef));

      expect(res.status).toBe(403);
      expect(res.body?.error?.name).toBe('NotAllowedError');
    },
  );

  it.each(['dismiss', 'disable'] as const)(
    'hides %sed reminders from the default list',
    async action => {
      const knex = await initDb();
      const userRef = 'user:default/alice';
      const quest = await createQuest(knex, 'Visible Reminder Quest', 'user');
      const reminder = await createReminder(knex, {
        questId: quest.id,
        targetSubjectRef: userRef,
        targetSubjectType: 'user',
      });

      const { app } = makeApp({
        knex,
        userInfo: mockServices.userInfo({
          ownershipEntityRefs: [userRef, 'group:default/engineering'],
        }),
      });

      const mutateRes = await request(app)
        .post(
          `/api/backstage-backend-gamification/reminders/${reminder.id}/${action}`,
        )
        .set('authorization', mockCredentials.user.header(userRef));

      expect(mutateRes.status).toBe(204);

      const listRes = await request(app)
        .get('/api/backstage-backend-gamification/reminders')
        .set('authorization', mockCredentials.user.header(userRef));

      expect(listRes.status).toBe(200);
      expect(listRes.body.reminders).toEqual([]);
    },
  );

  it('returns the reminder response shape declared in OpenAPI', async () => {
    const knex = await initDb();
    const userRef = 'user:default/alice';
    const quest = await createQuest(knex, 'OpenAPI Reminder Quest', 'user');
    await createReminder(knex, {
      questId: quest.id,
      targetSubjectRef: userRef,
      targetSubjectType: 'user',
      ruleKey: 'openapi-shape',
      reasonPayload: { inactiveDays: 10, latestActivityAt: '2026-04-01' },
    });

    const { app } = makeApp({
      knex,
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/reminders')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['reminders']);
    expect(res.body.reminders).toHaveLength(1);
    expect(Object.keys(res.body.reminders[0]).sort()).toEqual(
      [
        'id',
        'quest_id',
        'quest_title',
        'target_subject_ref',
        'target_subject_type',
        'rule_key',
        'rule_kind',
        'reason_payload',
        'viewer_state',
        'status',
        'created_at',
        'updated_at',
        'last_generated_at',
      ].sort(),
    );
    expect(res.body.reminders[0]).toMatchObject({
      quest_id: quest.id,
      quest_title: 'OpenAPI Reminder Quest',
      target_subject_ref: userRef,
      target_subject_type: 'user',
      rule_key: 'openapi-shape',
      rule_kind: 'activity',
      reason_payload: {
        inactiveDays: 10,
        latestActivityAt: '2026-04-01',
      },
      viewer_state: 'active',
      status: 'active',
    });
    expect(typeof res.body.reminders[0].created_at).toBe('string');
    expect(typeof res.body.reminders[0].updated_at).toBe('string');
    expect(typeof res.body.reminders[0].last_generated_at).toBe('string');
  });
});
