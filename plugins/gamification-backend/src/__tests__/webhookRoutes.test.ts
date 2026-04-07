import express from 'express';
import request from 'supertest';
import type { UserInfoService } from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { WebhookRouter } from '../routes/webhookRouter';

describe('webhook routes auth', () => {
  const adminGroup = 'group:default/admin';

  const createWebhookPayload = {
    title: 'Production Webhook',
    description: 'Sends quest updates to an external system',
    url: 'https://example.com/webhooks/gamification',
    event: 'quest.completed',
    payload: {
      timeout: 5000,
      retries: 3,
    },
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

    const webhookService = {
      createWebhook: jest.fn(async (data: any) => ({
        id: '6f7f43df-e673-477f-aa99-0f7db82c1b58',
        title: data.title,
        description: data.description,
        url: data.url,
        events: [data.event],
        payload: data.payload,
        created_at: '2026-03-31T08:00:00.000Z',
        updated_at: '2026-03-31T08:00:00.000Z',
      })),
      getWebhooks: jest.fn(async () => ({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      })),
      getWebhookEventMetadata: jest.fn(async (event: string) => ({
        event,
        labels: ['username', 'quest_title', 'total_xp', 'xp_reward'],
        template: {
          content:
            '{{username}} completed {{quest_title}} and earned {{xp_reward}} XP.',
        },
      })),
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/webhooks',
      WebhookRouter({
        httpAuth,
        userInfo,
        webhookService: webhookService as any,
        config,
      }),
    );
    app.use(mockErrorHandler());

    return { app, webhookService };
  }

  test.each([
    ['get', '/webhooks', undefined],
    ['post', '/webhooks', createWebhookPayload],
  ] as const)(
    'returns 403 for non-admin users on %s %s',
    async (method, path, body) => {
      const userRef = 'user:default/alice';
      const userInfo = mockServices.userInfo({
        ownershipEntityRefs: [userRef, 'group:default/engineering'],
      });
      const { app, webhookService } = makeApp({ userInfo });

      const req = request(app)
        [method](path)
        .set('authorization', mockCredentials.user.header(userRef));
      if (body) {
        req.send(body);
      }

      const res = await req;

      expect(res.status).toBe(403);
      expect(res.body?.error?.name).toBe('NotAllowedError');
      expect(webhookService.createWebhook).not.toHaveBeenCalled();
      expect(webhookService.getWebhooks).not.toHaveBeenCalled();
    },
  );

  it('returns 403 for non-admin users when reading webhook event metadata', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, 'group:default/engineering'],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .get('/webhooks/events/quest.completed/metadata')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(403);
    expect(res.body?.error?.name).toBe('NotAllowedError');
    expect(webhookService.getWebhookEventMetadata).not.toHaveBeenCalled();
  });

  it('allows admin users to create webhooks', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/webhooks')
      .set('authorization', mockCredentials.user.header(userRef))
      .send(createWebhookPayload);

    expect(res.status).toBe(201);
    expect(webhookService.createWebhook).toHaveBeenCalledWith(
      createWebhookPayload,
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

  it('applies schema defaults when creating webhooks', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/webhooks')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({
        title: 'Analytics Webhook',
        url: 'https://analytics.example.com/events',
        event: 'badge.earned',
      });

    expect(res.status).toBe(201);
    expect(webhookService.createWebhook).toHaveBeenCalledWith(
      {
        title: 'Analytics Webhook',
        description: '',
        url: 'https://analytics.example.com/events',
        event: 'badge.earned',
        payload: {},
      },
      expect.any(Object),
    );
  });

  it('returns 400 for invalid webhook creation payloads', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .post('/webhooks')
      .set('authorization', mockCredentials.user.header(userRef))
      .send({
        title: '',
        url: 'not-a-url',
        event: '',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(webhookService.createWebhook).not.toHaveBeenCalled();
  });

  it('allows admin users to fetch webhook event metadata', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .get('/webhooks/events/quest.completed/metadata')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(webhookService.getWebhookEventMetadata).toHaveBeenCalledWith(
      'quest.completed',
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
      event: 'quest.completed',
      labels: ['username', 'quest_title', 'total_xp', 'xp_reward'],
      template: {
        content:
          '{{username}} completed {{quest_title}} and earned {{xp_reward}} XP.',
      },
    });
  });

  it('returns 400 for invalid webhook event metadata params', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    const res = await request(app)
      .get('/webhooks/events/%20/metadata')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(400);
    expect(res.body?.error?.name).toBe('InputError');
    expect(webhookService.getWebhookEventMetadata).not.toHaveBeenCalled();
  });

  it('returns 404 when webhook event metadata does not exist', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    (webhookService.getWebhookEventMetadata as jest.Mock).mockRejectedValue(
      new NotFoundError("Webhook trigger event 'unknown.event' not found"),
    );

    const res = await request(app)
      .get('/webhooks/events/unknown.event/metadata')
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(404);
    expect(res.body?.error?.name).toBe('NotFoundError');
  });

  it('allows admin users to list paginated webhooks', async () => {
    const userRef = 'user:default/alice';
    const userInfo = mockServices.userInfo({
      ownershipEntityRefs: [userRef, adminGroup],
    });
    const { app, webhookService } = makeApp({ userInfo });

    (webhookService.getWebhooks as jest.Mock).mockResolvedValue({
      data: [
        {
          id: '6f7f43df-e673-477f-aa99-0f7db82c1b58',
          title: 'Production Webhook',
          description: 'Sends quest updates to an external system',
          url: 'https://example.com/webhooks/gamification',
          events: ['quest.completed'],
          payload: { timeout: 5000 },
          created_at: '2026-03-31T08:00:00.000Z',
          updated_at: '2026-03-31T08:00:00.000Z',
        },
      ],
      pagination: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });

    const res = await request(app)
      .get('/webhooks')
      .query({ page: 2, limit: 5 })
      .set('authorization', mockCredentials.user.header(userRef));

    expect(res.status).toBe(200);
    expect(webhookService.getWebhooks).toHaveBeenCalledWith(
      { page: 2, limit: 5 },
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
      data: [
        {
          id: '6f7f43df-e673-477f-aa99-0f7db82c1b58',
          title: 'Production Webhook',
          description: 'Sends quest updates to an external system',
          url: 'https://example.com/webhooks/gamification',
          events: ['quest.completed'],
          payload: { timeout: 5000 },
          created_at: '2026-03-31T08:00:00.000Z',
          updated_at: '2026-03-31T08:00:00.000Z',
        },
      ],
      pagination: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });
  });
});
