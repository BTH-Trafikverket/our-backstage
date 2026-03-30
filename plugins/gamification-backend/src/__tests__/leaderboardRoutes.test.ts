import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { createRouter } from '../router';
import { createPostgres18TestHarness } from '../../tests/helpers/postgres18TestHarness';

const { describePostgres18, initDb } = createPostgres18TestHarness(__dirname);

describePostgres18('leaderboard routes', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeApp(knex: Knex) {
    const httpAuth = mockServices.httpAuth();
    const userInfo = mockServices.userInfo();
    const config = mockServices.rootConfig();
    const auth = mockServices.auth();
    const discovery = mockServices.discovery();

    const app = express();
    app.use(
      '/api/backstage-backend-gamification',
      createRouter({
        httpAuth,
        userInfo,
        knex,
        config,
        auth,
        discovery,
      }),
    );
    app.use(mockErrorHandler());

    return { app };
  }

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
        source: 'leaderboard_route_test',
        ...(createdAt ? { created_at: createdAt } : {}),
      })),
    );
  }

  it('GET /leaderboard defaults to the top 25 users', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    await seedXpAwards(knex, 'user:default/alice', [100, 50]);
    await seedXpAwards(knex, 'user:default/bob', [120]);
    await seedXpAwards(knex, 'group:default/platform', [999]);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subjectType: 'user',
      timeRange: 'alltime',
      data: [
        {
          rank: 1,
          subjectRef: 'user:default/alice',
          subjectType: 'user',
          totalXp: 150,
        },
        {
          rank: 2,
          subjectRef: 'user:default/bob',
          subjectType: 'user',
          totalXp: 120,
        },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });
  });

  it('GET /leaderboard returns top groups when subjectType=group', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    await seedXpAwards(knex, 'group:default/platform', [250]);
    await seedXpAwards(knex, 'group:default/core', [400]);
    await seedXpAwards(knex, 'user:default/alice', [999]);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'group' })
      .set('authorization', mockCredentials.service.header());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subjectType: 'group',
      timeRange: 'alltime',
      data: [
        {
          rank: 1,
          subjectRef: 'group:default/core',
          subjectType: 'group',
          totalXp: 400,
        },
        {
          rank: 2,
          subjectRef: 'group:default/platform',
          subjectType: 'group',
          totalXp: 250,
        },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });
  });

  it('GET /leaderboard supports page and limit query params', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    for (let i = 1; i <= 31; i += 1) {
      const username = `user${String(i).padStart(2, '0')}`;
      await seedXpAwards(knex, `user:default/${username}`, [1000 - i]);
    }

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'user', page: 2, limit: 15 })
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 15,
      total: 31,
      totalPages: 3,
    });
    expect(res.body.data).toHaveLength(15);
    expect(res.body.timeRange).toBe('alltime');
    expect(res.body.data[0]).toEqual({
      rank: 16,
      subjectRef: 'user:default/user16',
      subjectType: 'user',
      totalXp: 984,
    });
    expect(res.body.data[14]).toEqual({
      rank: 30,
      subjectRef: 'user:default/user30',
      subjectType: 'user',
      totalXp: 970,
    });
  });

  it('GET /leaderboard accepts team as an alias for group', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    await seedXpAwards(knex, 'group:default/platform', [250]);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'team' })
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(200);
    expect(res.body.subjectType).toBe('group');
  });

  it('GET /leaderboard filters monthly results to the current month', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-03T12:00:00Z'));

    const knex = await initDb();
    const { app } = makeApp(knex);

    await seedXpAwards(
      knex,
      'user:default/april-user',
      [100],
      new Date('2026-04-02T10:00:00Z'),
    );
    await seedXpAwards(
      knex,
      'user:default/march-user',
      [250],
      new Date('2026-03-31T21:00:00Z'),
    );

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'user', timeRange: 'monthly' })
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subjectType: 'user',
      timeRange: 'monthly',
      data: [
        {
          rank: 1,
          subjectRef: 'user:default/april-user',
          subjectType: 'user',
          totalXp: 100,
        },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('GET /leaderboard filters weekly results to the current week', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-03T12:00:00Z'));

    const knex = await initDb();
    const { app } = makeApp(knex);

    await seedXpAwards(
      knex,
      'group:default/this-week',
      [120],
      new Date('2026-04-02T09:00:00Z'),
    );
    await seedXpAwards(
      knex,
      'group:default/also-this-week',
      [90],
      new Date('2026-03-31T08:00:00Z'),
    );
    await seedXpAwards(
      knex,
      'group:default/old-week',
      [500],
      new Date('2026-03-20T08:00:00Z'),
    );

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'group', timeRange: 'weekly' })
      .set('authorization', mockCredentials.service.header());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subjectType: 'group',
      timeRange: 'weekly',
      data: [
        {
          rank: 1,
          subjectRef: 'group:default/this-week',
          subjectType: 'group',
          totalXp: 120,
        },
        {
          rank: 2,
          subjectRef: 'group:default/also-this-week',
          subjectType: 'group',
          totalXp: 90,
        },
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      },
    });
  });

  it('GET /leaderboard returns 400 for invalid subjectType values', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ subjectType: 'badge' })
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(String(res.body?.error?.message ?? '')).toMatch(/subjectType/i);
  });

  it('GET /leaderboard returns 400 for invalid timeRange values', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .query({ timeRange: 'yearly' })
      .set('authorization', mockCredentials.user.header('user:default/alice'));

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(String(res.body?.error?.message ?? '')).toMatch(/timeRange/i);
  });

  it('returns 401 when credentials are explicitly missing', async () => {
    const knex = await initDb();
    const { app } = makeApp(knex);

    const res = await request(app)
      .get('/api/backstage-backend-gamification/leaderboard')
      .set('authorization', mockCredentials.none.header());

    expect(res.status).toBe(401);
    expect(res.body?.error?.name).toBe('AuthenticationError');
  });
});
