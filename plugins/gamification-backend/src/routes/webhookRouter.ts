import {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { webhookCreationSchema } from '../schemas/webhooks/webhookCreationSchema';
import { WebhookService } from '../services/webhookService';
import { createRequireAdminCredentials } from './adminAccess';

export function WebhookRouter({
  httpAuth,
  userInfo,
  webhookService,
  config,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  webhookService: WebhookService;
  config: RootConfigService;
}): express.Router {
  const router = Router();

  const requireAdminCredentials = createRequireAdminCredentials({
    httpAuth,
    userInfo,
    config,
    deniedMessage: 'Only admin users can manage webhooks',
  });

  const parsePagination = (req: express.Request) => {
    const pageQuery =
      typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limitQuery =
      typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;

    return {
      page: Number.isFinite(pageQuery) && pageQuery > 0 ? pageQuery : 1,
      limit: Number.isFinite(limitQuery) && limitQuery > 0 ? limitQuery : 10,
    };
  };

  router.post('/', async (req, res) => {
    const parsed = webhookCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);
    const created = await webhookService.createWebhook(parsed.data, {
      credentials,
    });

    res.status(201).json(created);
  });

  router.get('/', async (req, res) => {
    const credentials = await requireAdminCredentials(req);
    const { page, limit } = parsePagination(req);
    const webhooks = await webhookService.getWebhooks(
      { page, limit },
      { credentials },
    );

    res.status(200).json(webhooks);
  });

  return router;
}
