// xpRoutes.test.ts
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

import { createRouter } from '../router';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('xp routes', () => {
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

    return { app, httpAuth, userInfo };
  }

  async function seedXpForSubject(
    knex: Knex,
    subjectRef: string,
    totalXp: number,
  ) {
    // One quest is enough; we insert multiple ledger rows with different
    // awarded_on_completion_count to reach the total.
    const questId = randomUUID();

    await knex('quests').insert({
      id: questId,
      title: `Quest-${randomUUID()}`,
      description: '',
      target_count: 1,
      xp_reward: 1,
    });

    const a = Math.floor(totalXp / 3);
    const b = Math.floor(totalXp / 3);
    const c = totalXp - a - b;

    await knex('xp_ledger').insert([
      {
        id: randomUUID(),
        subject_ref: subjectRef,
        quest_id: questId,
        awarded_on_completion_count: 1,
        xp_amount: a,
        source: 'test_seed',
      },
      {
        id: randomUUID(),
        subject_ref: subjectRef,
        quest_id: questId,
        awarded_on_completion_count: 2,
        xp_amount: b,
        source: 'test_seed',
      },
      {
        id: randomUUID(),
        subject_ref: subjectRef,
        quest_id: questId,
        awarded_on_completion_count: 3,
        xp_amount: c,
        source: 'test_seed',
      },
    ]);
  }

  it('returns 401 when credentials are missing/none', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    // Note: mockServices.httpAuth treats requests WITHOUT credentials as the default mock user.
    // To simulate "Missing credentials" we explicitly send the "none" auth header.
    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .set('authorization', mockCredentials.none.header());

    expect(res.status).toBe(401);
    expect(res.body?.error?.name).toBe('AuthenticationError');
    expect(String(res.body?.error?.message ?? '')).toMatch(
      /Missing credentials/i,
    );
  });

  it('GET /xp uses the logged-in user when subjectRef is not provided', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    const userRef = 'user:local/alice';
    await seedXpForSubject(knex, userRef, 65);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);

    // Match the payload shape you showed working locally
    expect(res.body).toMatchObject({
      subjectRef: userRef,
      totalXp: 65,
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpIntoLevel: 65,
      xpToNextLevel: 35,
      progress: 0.65,
    });
  });

  it('GET /xp allows service credentials when subjectRef is provided (does not call userInfo)', async () => {
    const knex = await initDb();

    const userInfo = {
      getUserInfo: jest.fn(async () => {
        throw new Error(
          'userInfo.getUserInfo should NOT be called when userRef is provided',
        );
      }),
    } as unknown as UserInfoService;

    const { app } = makeApp({ knex, userInfo });

    const subjectRef = 'group:default/platform';
    await seedXpForSubject(knex, subjectRef, 65);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .query({ subjectRef })
      .set('authorization', mockCredentials.service.header());

    expect(res.status).toBe(200);
    expect(res.body.subjectRef).toBe(subjectRef);
    expect(res.body.totalXp).toBe(65);

    expect(userInfo.getUserInfo).not.toHaveBeenCalled();
  });

  it('GET /xp returns 400 when service credentials omit subjectRef', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .set('authorization', mockCredentials.service.header());

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(String(res.body?.error?.message ?? '')).toMatch(
      /subjectRef is required/i,
    );
  });

  it('returns 0 totalXp for a valid user with no ledger rows', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    const userRef = 'user:local/nobody';

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      subjectRef: userRef,
      totalXp: 0,
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpIntoLevel: 0,
      xpToNextLevel: 100,
      progress: 0,
    });
  });
});
