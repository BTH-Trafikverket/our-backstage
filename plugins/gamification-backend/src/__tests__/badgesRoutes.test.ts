import express from 'express';
import request from 'supertest';
import type { UserInfoService } from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { BadgesRouter } from '../routes/badgesRouter';

describe('badges routes auth and errors', () => {
  const adminGroup = 'group:default/admin';
  const badgePayload = {
    title: 'Contributor',
    description: 'Awarded for shipping code',
    subject_type: 'user' as const,
    criterias: [{ quest_id: 'quest-1', target_count: 3 }],
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
        },
      },
    });

    const badgesService = {
      createBadge: jest.fn(async (data: unknown) => ({
        id: 'badge-1',
        archived_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
        ...((data as object) ?? {}),
      })),
      getBadges: jest.fn(async () => ({
        data: [
          {
            id: 'badge-1',
            title: 'Contributor',
            description: 'Awarded for shipping code',
            subject_type: 'user' as const,
            criterias: [{ quest_id: 'quest-1', target_count: 3 }],
            archived_at: null,
            created_at: new Date('2026-01-01T00:00:00Z'),
            updated_at: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      })),
      getBadgeById: jest.fn(async (id: string) => ({
        id,
        title: 'Contributor',
        description: 'Awarded for shipping code',
        subject_type: 'user' as const,
        criterias: [{ quest_id: 'quest-1', target_count: 3 }],
        archived_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      })),
      getBadgeProgress: jest.fn(async (subjectRefs: string[]) => ({
        subjectRefs,
        badges: [
          {
            id: 'badge-1',
            title: 'Contributor',
            description: 'Awarded for shipping code',
            subject_type: 'user' as const,
            criterias: [
              {
                quest_id: 'quest-1',
                quest_title: 'Review PRs',
                target_count: 3,
                completion_policy: 'REPEATABLE',
                progress: { current: 3, target: 3, percent: 100, done: true },
                quest_progress: {
                  current: 0,
                  target: 1,
                  percent: 0,
                  done: false,
                },
              },
            ],
            isEarned: true,
            earnedAt: new Date('2026-01-03T00:00:00Z'),
            progressSubjectRef: 'user:default/mock',
            progress: {
              completedRequirements: 1,
              totalRequirements: 1,
              percent: 100,
            },
            archived_at: null,
            created_at: new Date('2026-01-01T00:00:00Z'),
            updated_at: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      })),
      updateBadge: jest.fn(async (id: string, data: unknown) => ({
        id,
        title: 'Contributor',
        description: 'Awarded for shipping code',
        subject_type: 'user' as const,
        criterias: [{ quest_id: 'quest-1', target_count: 3 }],
        archived_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-02T00:00:00Z'),
        ...((data as object) ?? {}),
      })),
      deleteBadge: jest.fn(async () => true),
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/badges',
      BadgesRouter({
        httpAuth,
        userInfo,
        badgesService: badgesService as any,
        config,
      }),
    );
    app.use(mockErrorHandler());

    return { app, badgesService };
  }

  test.each([
    ['get', '/badges', undefined],
    ['get', '/badges/badge-1', undefined],
    ['post', '/badges', badgePayload],
    ['patch', '/badges/badge-1', { title: 'Updated Badge' }],
    ['delete', '/badges/badge-1', undefined],
  ] as const)(
    'returns 403 for non-admin users on %s %s',
    async (method, path, body) => {
      const userRef = 'user:default/alice';
      const userInfo = mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      });
      const { app, badgesService } = makeApp({ userInfo });

      const req = request(app)
        [method](path)
        .set('authorization', mockCredentials.user.header(userRef));
      if (body) {
        req.send(body);
      }

      const res = await req;

      expect(res.status).toBe(403);
      expect(res.body?.error?.name).toBe('NotAllowedError');
      expect(badgesService.createBadge).not.toHaveBeenCalled();
      expect(badgesService.getBadges).not.toHaveBeenCalled();
      expect(badgesService.getBadgeById).not.toHaveBeenCalled();
      expect(badgesService.updateBadge).not.toHaveBeenCalled();
      expect(badgesService.deleteBadge).not.toHaveBeenCalled();
    },
  );

  it('returns 403 for service credentials on admin badge routes', async () => {
    const { app, badgesService } = makeApp();

    const res = await request(app)
      .post('/badges')
      .set('authorization', mockCredentials.service.header())
      .send(badgePayload);

    expect(res.status).toBe(403);
    expect(res.body?.error?.name).toBe('NotAllowedError');
    expect(badgesService.createBadge).not.toHaveBeenCalled();
  });

  it('allows users to fetch badge progress for a subject without admin access', async () => {
    const userRef = 'user:default/alice';
    const { app, badgesService } = makeApp({
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/badges/progress')
      .query({ subjectRef: 'group:default/engineering' })
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(badgesService.getBadgeProgress).toHaveBeenCalledWith(
      ['group:default/engineering'],
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
        page: 1,
        limit: 10,
      },
    );
  });

  it('requires subjectRef for service credentials on badge progress route', async () => {
    const { app, badgesService } = makeApp();

    const res = await request(app)
      .get('/badges/progress')
      .set('authorization', mockCredentials.service.header());

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(badgesService.getBadgeProgress).not.toHaveBeenCalled();
  });

  it('uses the authenticated user when subjectRef is omitted on badge progress route', async () => {
    const userRef = 'user:default/alice';
    const { app, badgesService } = makeApp({
      userInfo: mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      }),
    });

    const res = await request(app)
      .get('/badges/progress')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(badgesService.getBadgeProgress).toHaveBeenCalledWith(
      [userRef, 'group:default/engineering'],
      {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            type: 'user',
            userEntityRef: userRef,
          }),
        }),
        page: 1,
        limit: 10,
      },
    );
  });

  it('allows admin users to create badges', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, badgesService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/badges')
      .set('authorization', mockCredentials.user.header(userRef))
      .send(badgePayload);

    expect(res.status).toBe(201);
    expect(badgesService.createBadge).toHaveBeenCalledWith(badgePayload, {
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
    });
  });

  it('allows admin users to list and fetch badges', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, badgesService } = makeApp({ userInfo });

    const listRes = await request(app)
      .get('/badges')
      .set('authorization', mockCredentials.user.header(userRef));
    const getRes = await request(app)
      .get('/badges/badge-1')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(listRes.status).toBe(200);
    expect(getRes.status).toBe(200);
    expect(badgesService.getBadges).toHaveBeenCalledWith(undefined, {
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
      page: 1,
      limit: 10,
    });
    expect(badgesService.getBadgeById).toHaveBeenCalledWith('badge-1', {
      credentials: expect.objectContaining({
        principal: expect.objectContaining({
          type: 'user',
          userEntityRef: userRef,
        }),
      }),
    });
  });

  it('allows admin users to update and archive badges', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, badgesService } = makeApp({ userInfo });

    const updateRes = await request(app)
      .patch('/badges/badge-1')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ title: 'Updated Badge' });
    const archiveRes = await request(app)
      .delete('/badges/badge-1')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(updateRes.status).toBe(200);
    expect(archiveRes.status).toBe(204);
    expect(badgesService.updateBadge).toHaveBeenCalled();
    expect(badgesService.deleteBadge).toHaveBeenCalled();
  });

  it('returns 400 for invalid badge payloads', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, badgesService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/badges')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ title: '', criterias: [] });

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(badgesService.createBadge).not.toHaveBeenCalled();
  });

  it('returns 404 when a badge is missing', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, badgesService } = makeApp({ userInfo });

    (badgesService.getBadgeById as jest.Mock).mockResolvedValueOnce(undefined);
    (badgesService.updateBadge as jest.Mock).mockResolvedValueOnce(undefined);
    (badgesService.deleteBadge as jest.Mock).mockResolvedValueOnce(false);

    const getRes = await request(app)
      .get('/badges/missing-badge')
      .set('authorization', mockCredentials.user.header(userRef));
    const patchRes = await request(app)
      .patch('/badges/missing-badge')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({ title: 'Updated Badge' });
    const deleteRes = await request(app)
      .delete('/badges/missing-badge')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(getRes.status).toBe(404);
    expect(patchRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
    expect(getRes.body?.error?.name).toBe('NotFoundError');
    expect(patchRes.body?.error?.name).toBe('NotFoundError');
    expect(deleteRes.body?.error?.name).toBe('NotFoundError');
  });
});
