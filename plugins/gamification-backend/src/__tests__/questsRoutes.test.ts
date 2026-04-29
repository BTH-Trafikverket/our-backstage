import express from 'express';
import request from 'supertest';
import type { UserInfoService } from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { ConflictError } from '@backstage/errors';
import { QuestsRouter } from '../routes/questsRouter';

jest.setTimeout(60000);

describe('quests routes auth', () => {
  const adminGroup = 'group:default/admin';
  const targetPluginId = 'gamification';

  const createQuestPayload = {
    title: 'Ship a Feature',
    description: 'Deploy a new feature to production',
    target_count: 1,
    xp_reward: 100,
    subject_type: 'user' as const,
    completion_policy: 'REPEATABLE' as const,
  };

  const testEventPayload = {
    eventId: 'evt-ui-1',
    questId: '11111111-1111-4111-8111-111111111111',
    actor: {
      provider: 'github',
      login: 'alice',
    },
  };

  function makeApp(options?: {
    userInfo?: UserInfoService;
    adminGroups?: string[];
  }) {
    const httpAuth = mockServices.httpAuth({ pluginId: targetPluginId });
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
      listGithubUsers: jest.fn(async () => [
        {
          entityRef: 'user:default/alice',
          displayName: 'Alice',
          githubLogin: 'alice',
          githubId: '1234',
          email: 'alice@example.com',
        },
      ]),
      handleQuestEvent: jest.fn(async () => ({
        duplicate: false,
        subjectRef: 'user:default/alice',
        questId: 'quest-1',
        completionCount: 1,
      })),
      runCatalogLinkedQuestsForTeam: jest.fn(async (teamRef: string) => ({
        teamRef,
        evaluatedQuests: 2,
        skippedQuests: 0,
        matchedEntities: 3,
        triggeredEvents: 3,
        duplicateEvents: 0,
        blockedEvents: 0,
        unknownEvaluations: 0,
      })),
    };
    const reminderEvaluationService = {
      evaluateConfiguredRules: jest.fn(async () => ({
        createdCount: 1,
        refreshedCount: 2,
        suppressedCount: 3,
        notificationCount: 3,
        notificationFailureCount: 0,
        skippedRuleCount: 0,
        ruleResults: [],
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
        reminderEvaluationService: reminderEvaluationService as any,
      }),
    );
    app.use(mockErrorHandler());

    return { app, questsService, reminderEvaluationService };
  }

  test.each([
    ['get', '/quests', undefined],
    ['get', '/quests/test/users', undefined],
    ['post', '/quests', createQuestPayload],
    ['post', '/quests/test/events', testEventPayload],
    ['post', '/quests/test/reminders/force', undefined],
    ['post', '/quests/catalog/run', { teamRef: 'group:default/platform' }],
    ['patch', '/quests/quest-1', { title: 'Updated Quest' }],
    ['delete', '/quests/quest-1', undefined],
  ] as const)(
    'returns 403 for non-admin users on %s %s',
    async (method, path, body) => {
      const userRef = 'user:default/alice';
      const userInfo = mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      });
      const { app, questsService, reminderEvaluationService } = makeApp({
        userInfo,
      });

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
      expect(questsService.listGithubUsers).not.toHaveBeenCalled();
      expect(questsService.handleQuestEvent).not.toHaveBeenCalled();
      expect(
        reminderEvaluationService.evaluateConfiguredRules,
      ).not.toHaveBeenCalled();
      expect(
        questsService.runCatalogLinkedQuestsForTeam,
      ).not.toHaveBeenCalled();
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
    expect(questsService.createQuest).toHaveBeenCalledWith(
      {
        ...createQuestPayload,
        quest_mode: 'event_driven',
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
  });

  it('returns 400 for invalid quest creation payloads', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/quests')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ title: '', xp_reward: -1 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(questsService.createQuest).not.toHaveBeenCalled();
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
        includeArchived: true,
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

  it('allows admin users to list GitHub catalog users for the test panel', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .get('/quests/test/users')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(questsService.listGithubUsers).toHaveBeenCalledWith({
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
    });
    expect(res.body).toEqual({
      users: [
        {
          entityRef: 'user:default/alice',
          displayName: 'Alice',
          githubLogin: 'alice',
          githubId: '1234',
          email: 'alice@example.com',
        },
      ],
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
        order: 'desc',
        page: 1,
        limit: 10,
      },
    );

    expect(res.body).toEqual({
      data: [{ id: 'quest-1', title: 'Quest 1', completion_count: 0 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('returns 400 for invalid quest patch payloads', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .patch('/quests/quest-1')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ completion_policy: 'INVALID_POLICY' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(questsService.editQuest).not.toHaveBeenCalled();
  });

  it('returns 404 when updating a quest that no longer exists', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });
    (questsService.editQuest as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app)
      .patch('/quests/missing-quest')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ title: 'Updated Quest' });

    expect(res.status).toBe(404);
    expect(res.body?.error?.name).toBe('NotFoundError');
  });

  it('returns 404 when deleting a quest that no longer exists', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });
    (questsService.deleteQuest as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .delete('/quests/missing-quest')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(404);
    expect(res.body?.error?.name).toBe('NotFoundError');
  });

  it('returns 409 when deleting a quest that is used by badge criteria', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });
    (questsService.deleteQuest as jest.Mock).mockRejectedValue(
      new ConflictError('Quest is used by badge criteria'),
    );

    const res = await request(app)
      .delete('/quests/quest-1')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(409);
    expect(res.body?.error?.name).toBe('ConflictError');
  });

  it('allows approved services to post quest events', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests/events')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:test-service'),
        }),
      )
      .send({
        eventId: 'evt-1',
        questId: '11111111-1111-4111-8111-111111111111',
        subjectRef: 'user:default/alice',
      });

    expect(res.status).toBe(200);
    expect(questsService.handleQuestEvent).toHaveBeenCalledWith({
      eventId: 'evt-1',
      questId: '11111111-1111-4111-8111-111111111111',
      subjectRef: 'user:default/alice',
      actor: undefined,
      callerSubject: 'external:test-service',
      opts: {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'service',
            subject: 'external:test-service',
          }),
        }),
      },
    });
  });

  it('allows admin users to post test quest events from the UI', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/quests/test/events')
      .set('authorization', mockCredentials.user.header(userRef))
      .send(testEventPayload);

    expect(res.status).toBe(200);
    expect(questsService.handleQuestEvent).toHaveBeenCalledWith({
      eventId: 'evt-ui-1',
      questId: '11111111-1111-4111-8111-111111111111',
      subjectRef: undefined,
      actor: {
        provider: 'github',
        login: 'alice',
      },
      callerSubject: 'internal:backstage-ui-test',
      opts: {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
      },
    });
  });

  it('allows admin users to force reminder evaluation from the test UI', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, reminderEvaluationService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/quests/test/reminders/force')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      createdCount: 1,
      refreshedCount: 2,
      suppressedCount: 3,
      notificationCount: 3,
      notificationFailureCount: 0,
      skippedRuleCount: 0,
    });
    expect(
      reminderEvaluationService.evaluateConfiguredRules,
    ).toHaveBeenCalledWith({
      force: true,
    });
  });

  it('returns 404 for services that are not in the allowed caller list', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests/events')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:other'),
        }),
      )
      .send({
        eventId: 'evt-1',
        questId: '11111111-1111-4111-8111-111111111111',
        subjectRef: 'user:default/alice',
      });

    expect(res.status).toBe(404);
    expect(res.body?.error?.name).toBe('NotFoundError');
    expect(questsService.handleQuestEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid quest event payloads', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests/events')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:test-service'),
        }),
      )
      .send({
        questId: 'not-a-uuid',
        subjectRef: 'user:default/alice',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(questsService.handleQuestEvent).not.toHaveBeenCalled();
  });

  it('allows approved services to trigger catalog runner', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests/catalog/run')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:test-service'),
        }),
      )
      .send({ teamRef: 'group:default/platform' });

    expect(res.status).toBe(200);
    expect(questsService.runCatalogLinkedQuestsForTeam).toHaveBeenCalledWith(
      'group:default/platform',
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'service',
            subject: 'external:test-service',
          }),
        }),
      },
    );
  });

  it('returns 404 for non-allowed service callers on catalog runner endpoint', async () => {
    const { app, questsService } = makeApp();

    const res = await request(app)
      .post('/quests/catalog/run')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:other'),
        }),
      )
      .send({ teamRef: 'group:default/platform' });

    expect(res.status).toBe(404);
    expect(res.body?.error?.name).toBe('NotFoundError');
    expect(questsService.runCatalogLinkedQuestsForTeam).not.toHaveBeenCalled();
  });

  it('allows admin users to trigger catalog runner', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, questsService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/quests/catalog/run')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ teamRef: 'group:default/platform' });

    expect(res.status).toBe(200);
    expect(questsService.runCatalogLinkedQuestsForTeam).toHaveBeenCalledWith(
      'group:default/platform',
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
      },
    );
  });

  it('returns duplicate quest event responses from the service', async () => {
    const { app, questsService } = makeApp();
    (questsService.handleQuestEvent as jest.Mock).mockResolvedValue({
      duplicate: true,
      blocked: false,
      subjectRef: 'user:default/alice',
      questId: '11111111-1111-4111-8111-111111111111',
    });

    const res = await request(app)
      .post('/quests/events')
      .set(
        'authorization',
        mockCredentials.service.header({
          targetPluginId,
          onBehalfOf: mockCredentials.service('external:test-service'),
        }),
      )
      .send({
        eventId: 'evt-dup',
        questId: '11111111-1111-4111-8111-111111111111',
        subjectRef: 'user:default/alice',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      duplicate: true,
      blocked: false,
      subjectRef: 'user:default/alice',
      questId: '11111111-1111-4111-8111-111111111111',
    });
  });
});
