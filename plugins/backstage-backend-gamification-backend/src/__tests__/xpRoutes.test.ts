// xpRoutes.test.ts
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  TestDatabases,
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import type { UserInfoService } from '@backstage/backend-plugin-api';

import { createRouter } from '../router';

describe('xp routes', () => {
  // Auto-derive the TestDatabases Postgres connection string from your existing DB_* env vars.
  // Must happen BEFORE TestDatabases.create().
  if (!process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

    const isLocal =
      DB_HOST === 'localhost' ||
      DB_HOST === '127.0.0.1' ||
      DB_HOST === 'postgres';

    if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && isLocal) {
      process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
    }
  }

  // Backstage standard: create this synchronously inside describe.
  const databases = TestDatabases.create({ ids: ['POSTGRES_18'] });

  if (!databases.supports('POSTGRES_18')) {
    it('skipped: set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD (or BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) to run Postgres route tests', () => {
      // noop
    });
    return;
  }

  const migrationsDir = path.resolve(__dirname, '../../migrations');

  async function initDb(): Promise<Knex> {
    // Each init() gives a fresh empty logical DB on Postgres.
    const knex = await databases.init('POSTGRES_18');
    await knex.migrate.latest({ directory: migrationsDir });
    return knex;
  }

  function makeApp(opts: { knex: Knex; userInfo?: UserInfoService }) {
    const httpAuth = mockServices.httpAuth();
    const userInfo = opts.userInfo ?? mockServices.userInfo();

    const app = express();
    app.use(
      '/api/backstage-backend-gamification',
      createRouter({ httpAuth, userInfo, knex: opts.knex }),
    );
    app.use(mockErrorHandler());

    return { app, httpAuth, userInfo };
  }

  async function seedXpForUser(knex: Knex, userRef: string, totalXp: number) {
    // One quest is enough; we insert multiple ledger rows with different
    // awarded_on_completion_count to reach the total.
    const questId = randomUUID();

    await knex('quests').insert({
      id: questId,
      title: `Quest-${randomUUID()}`,
      description: '',
      interval: 1,
      xp_reward: 1,
    });

    const a = Math.floor(totalXp / 3);
    const b = Math.floor(totalXp / 3);
    const c = totalXp - a - b;

    await knex('xp_ledger').insert([
      {
        id: randomUUID(),
        user_ref: userRef,
        quest_id: questId,
        awarded_on_completion_count: 1,
        xp_amount: a,
        source: 'test_seed',
      },
      {
        id: randomUUID(),
        user_ref: userRef,
        quest_id: questId,
        awarded_on_completion_count: 2,
        xp_amount: b,
        source: 'test_seed',
      },
      {
        id: randomUUID(),
        user_ref: userRef,
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

  it('GET /xp uses the logged-in user when userRef is not provided', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    const userRef = 'user:local/alice';
    await seedXpForUser(knex, userRef, 65);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);

    // Match the payload shape you showed working locally
    expect(res.body).toMatchObject({
      userRef,
      totalXp: 65,
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpIntoLevel: 65,
      xpToNextLevel: 35,
      progress: 0.65,
    });
  });

  it('GET /xp allows service credentials when userRef is provided (does not call userInfo)', async () => {
    const knex = await initDb();

    const userInfo = {
      getUserInfo: jest.fn(async () => {
        throw new Error(
          'userInfo.getUserInfo should NOT be called when userRef is provided',
        );
      }),
    } as unknown as UserInfoService;

    const { app } = makeApp({ knex, userInfo });

    const userRef = 'user:local/alice';
    await seedXpForUser(knex, userRef, 65);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .query({ userRef })
      .set('authorization', mockCredentials.service.header('postman'));

    expect(res.status).toBe(200);
    expect(res.body.userRef).toBe(userRef);
    expect(res.body.totalXp).toBe(65);

    expect(userInfo.getUserInfo).not.toHaveBeenCalled();
  });

  it('returns 400 when userRef is invalid', async () => {
    const knex = await initDb();
    const { app } = makeApp({ knex });

    const res = await request(app)
      .get('/api/backstage-backend-gamification/xp')
      .query({ userRef: 'not-a-user-ref' })
      .set('authorization', mockCredentials.service.header('postman'));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'userRef must look like user:<namespace>/<name>',
    });
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
      userRef,
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
