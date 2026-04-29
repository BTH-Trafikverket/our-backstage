import { mockServices } from '@backstage/backend-test-utils';
import { createRouter } from '../router';
import { WebhookRouter } from '../routes/webhookRouter';

jest.mock('../routes/webhookRouter', () => {
  const express = require('express');

  return {
    WebhookRouter: jest.fn(() => express.Router()),
  };
});

describe('createRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs the CRUD webhook service with the delivery policy and timeout config', () => {
    createRouter({
      httpAuth: mockServices.httpAuth(),
      userInfo: mockServices.userInfo(),
      knex: {} as any,
      config: mockServices.rootConfig({
        data: {
          gamification: {
            webhooks: {
              delivery: {
                requestTimeoutMs: 6543,
                allowedHosts: ['hooks.example.com'],
                allowHttp: true,
                allowPrivateTargets: true,
              },
            },
          },
        },
      }),
      auth: mockServices.auth(),
      discovery: mockServices.discovery(),
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as any,
    });

    const webhookService = (WebhookRouter as jest.Mock).mock.calls[0][0]
      .webhookService;

    expect((webhookService as any).requestTimeoutMs).toBe(6543);
    expect((webhookService as any).targetPolicy.allowHttp).toBe(true);
    expect((webhookService as any).targetPolicy.allowPrivateTargets).toBe(true);
    expect((webhookService as any).targetPolicy.allowedHosts).toEqual(
      new Set(['hooks.example.com']),
    );
  });
});
