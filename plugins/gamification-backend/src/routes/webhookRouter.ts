import {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { webhookCreationSchema } from '../schemas/webhooks/webhookCreationSchema';
import { webhookEditSchema } from '../schemas/webhooks/webhookEditSchema';
import { webhookEventMetadataParamsSchema } from '../schemas/webhooks/webhookEventMetadataSchema';
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

  router.get('/events/:event/metadata', async (req, res) => {
    const parsed = webhookEventMetadataParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);
    const metadata = await webhookService.getWebhookEventMetadata(
      parsed.data.event,
      { credentials },
    );

    res.status(200).json(metadata);
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

  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing webhook id');
    }

    const parsed = webhookEditSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);
    const updated = await webhookService.editWebhook(id, parsed.data, {
      credentials,
    });

    if (!updated) {
      throw new NotFoundError('Webhook not found');
    }

    res.status(200).json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing webhook id');
    }

    const credentials = await requireAdminCredentials(req);
    const deleted = await webhookService.deleteWebhook(id, { credentials });

    if (!deleted) {
      throw new NotFoundError('Webhook not found');
    }

    res.status(204).send();
  });

  return router;
}
