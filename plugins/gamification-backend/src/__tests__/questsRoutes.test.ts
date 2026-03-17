import express from 'express';
import request from 'supertest';
import type { UserInfoService } from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { QuestsRouter } from '../routes/questsRouter';

describe('quests routes auth', () => {
  const adminGroup = 'group:default/admin';

  const createQuestPayload = {
    title: 'Ship a Feature',
    description: 'Deploy a new feature to production',
    target_count: 1,
    xp_reward: 100,
    subject_type: 'user' as const,
    completion_policy: 'REPEATABLE' as const,
  };

  function makeApp(options?: {
    userInfo?: UserInfoService;
    adminGroups?: string[];
  }) {
    const httpAuth = mockServices.httpAuth();
    const userInfo =
      options?.userInfo ??
      mockServices.userInfo({
        ownershipEntityRefs: ['user:default/mock', adminGroup],
      });
    const config = mockServices.rootConfig({
      data: {
        gamification: {
          admin: {
            groups: options?.adminGroups ?? [adminGroup],
          },
          quests: {
            allowedCallers: ['external:test-service'],
          },
        },
      },
    });

    const questsService = {
      createQuest: jest.fn(async (data: unknown) => ({
        id: 'quest-1',
        ...((data as object) ?? {}),
      })),
      editQuest: jest.fn(async (id: string, data: unknown) => ({
        id,
        ...((data as object) ?? {}),
      })),
      deleteQuest: jest.fn(async () => true),
      getQuests: jest.fn(async () => ({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      })),
      getQuestsWithProgress: jest.fn(async () => []),
      handleQuestEvent: jest.fn(async () => ({
        duplicate: false,
        subjectRef: 'user:default/alice',
        questId: 'quest-1',
        completionCount: 1,
      })),
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/quests',
      QuestsRouter({
        httpAuth,
        userInfo,
        questsService: questsService as any,
        config,
      }),
    );
    app.use(mockErrorHandler());

    return { app, questsService };
  }

  test.each([
    ['get', '/quests', undefined],
    ['post', '/quests', createQuestPayload],
    ['patch', '/quests/quest-1', { title: 'Updated Quest' }],
    ['delete', '/quests/quest-1', undefined],
  ] as const)(
    'returns 403 for non-admin users on %s %s',
    async (method, path, body) => {
      const userRef = 'user:default/alice';
      const userInfo = mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      });
      const { app, questsService } = makeApp({ userInfo });

      const req = request(app)
        [method](path)
        .set('authorization', mockCredentials.user.header(userRef));
      if (body) {
        req.send(body);
      }

      const res = await req;

      expect(res.status).toBe(403);
      expect(res.body?.error?.name).toBe('NotAllowedError');
      expect(questsService.createQuest).not.toHaveBeenCalled();
      expect(questsService.editQuest).not.toHaveBeenCalled();
      expect(questsService.deleteQuest).not.toHaveBeenCalled();
      expect(questsService.getQuests).not.toHaveBeenCalled();
    },
  );

  it('returns 403 for service credentials on admin routes', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests')
      .set('authorization', mockCredentials.service.header())
      .send(createQuestPayload);

    expect(res.status).toBe(403);
    expect(res.body?.error?.name).toBe('NotAllowedError');
    expect(questsService.createQuest).not.toHaveBeenCalled();
  });

  it('allows admin users to create quests', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/quests')
      .set('authorization', mockCredentials.user.header(userRef))
      .send(createQuestPayload);

    expect(res.status).toBe(201);
    expect(questsService.createQuest).toHaveBeenCalledWith(createQuestPayload, {
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
    });
  });

  it('returns admin-status=true for admin users', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app } = makeApp({ userInfo });

    const res = await request(app)
      .get('/quests/admin-status')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAdmin: true });
  });

  it('returns admin-status=false for non-admin users', async () => {
    const userRef = 'user:default/bob';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, 'group:default/engineering'],
    });
    const { app } = makeApp({ userInfo });

    const res = await request(app)
      .get('/quests/admin-status')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAdmin: false });
  });

  it('allows admin users to create quests with zero xp reward', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });
    const zeroRewardPayload = {
      ...createQuestPayload,
      xp_reward: 0,
    };

    const res = await request(app)
      .post('/quests')
      .set('authorization', mockCredentials.user.header(userRef))
      .send(zeroRewardPayload);

    expect(res.status).toBe(201);
    expect(questsService.createQuest).toHaveBeenCalledWith(zeroRewardPayload, {
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
    });
  });

  it('allows admin users to list quests with SQL-backed filters and sorting', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    (questsService.getQuests as jest.Mock).mockResolvedValue({
      data: [{ id: 'quest-1', title: 'Quest 1', subject_type: 'team' }],
      pagination: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });

    const res = await request(app)
      .get('/quests')
      .query({
        search: 'team',
        audience: 'team',
        sortBy: 'xp_reward',
        order: 'desc',
        page: 2,
        limit: 5,
      })
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(questsService.getQuests).toHaveBeenCalledWith(
      {
        searchTitle: 'team',
        audience: 'team',
        sortBy: 'xp_reward',
        order: 'desc',
        page: 2,
        limit: 5,
      },
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
      },
    );
    expect(res.body).toEqual({
      data: [{ id: 'quest-1', title: 'Quest 1', subject_type: 'team' }],
      pagination: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });
  });

  it('keeps /quests/me available to authenticated users', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, 'group:default/engineering'],
    });
    const { app, questsService } = makeApp({ userInfo });

    (questsService.getQuestsWithProgress as jest.Mock).mockResolvedValue({
      data: [{ id: 'quest-1', title: 'Quest 1', completion_count: 0 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await request(app)
      .get('/quests/me')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(questsService.getQuestsWithProgress).toHaveBeenCalledWith(
      userRef,
      [userRef, 'group:default/engineering'],
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
      },
      {
        searchTitle: undefined,
        audience: 'all',
        status: 'active',
        teamRef: undefined,
        sortBy: 'created_at',
        order: 'asc',
        page: 1,
        limit: 10,
      },
    );

    expect(res.body).toEqual({
      data: [{ id: 'quest-1', title: 'Quest 1', completion_count: 0 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });
});
