import {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { badgeCreationSchema } from '../schemas/badges/badgeCreationSchema';
import { badgeEditSchema } from '../schemas/badges/badgeEditSchema';
import { BadgesService } from '../services/badgesService';
import { createRequireAdminCredentials } from './adminAccess';

export function BadgesRouter({
  httpAuth,
  userInfo,
  badgesService,
  config,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  badgesService: BadgesService;
  config: RootConfigService;
}): express.Router {
  const router = Router();
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
  const requireAdminCredentials = createRequireAdminCredentials({
    httpAuth,
    userInfo,
    config,
    deniedMessage: 'Only admin users can manage badges',
  });

  router.get('/progress', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const requested =
      typeof req.query.subjectRef === 'string'
        ? req.query.subjectRef.trim()
        : '';

    if (!requested && credentials.principal.type !== 'user') {
      throw new InputError(
        'subjectRef is required when using service credentials',
      );
    }

    let subjectRefs: string[];

    if (requested) {
      subjectRefs = [requested];
    } else {
      const info = await userInfo.getUserInfo(credentials);
      subjectRefs = [
        ...new Set(
          [
            credentials.principal.type === 'user'
              ? credentials.principal.userEntityRef
              : '',
            ...info.ownershipEntityRefs,
          ].filter(Boolean),
        ),
      ];
    }

    const { page, limit } = parsePagination(req);

    const badgeProgress = await badgesService.getBadgeProgress(subjectRefs, {
      credentials,
      page,
      limit,
    });

    res.status(200).json(badgeProgress);
  });

  router.post('/', async (req, res) => {
    const parsed = badgeCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);
    const created = await badgesService.createBadge(parsed.data, {
      credentials,
    });

    res.status(201).json(created);
  });

  router.get('/', async (req, res) => {
    const credentials = await requireAdminCredentials(req);
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const { page, limit } = parsePagination(req);
    const badges = await badgesService.getBadges(search, {
      credentials,
      page,
      limit,
    });

    res.status(200).json(badges);
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing badge id');
    }

    const credentials = await requireAdminCredentials(req);
    const badge = await badgesService.getBadgeById(id, { credentials });
    if (!badge) {
      throw new NotFoundError('Badge not found');
    }

    res.status(200).json(badge);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing badge id');
    }

    const parsed = badgeEditSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);
    const updated = await badgesService.updateBadge(id, parsed.data, {
      credentials,
    });
    if (!updated) {
      throw new NotFoundError('Badge not found');
    }

    res.status(200).json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing badge id');
    }

    const credentials = await requireAdminCredentials(req);
    const deleted = await badgesService.deleteBadge(id, { credentials });
    if (!deleted) {
      throw new NotFoundError('Badge not found');
    }

    res.status(204).send();
  });

  return router;
}
