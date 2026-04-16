import {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { badgeCreationSchema } from '../schemas/badges/badgeCreationSchema';
import { badgeEditSchema } from '../schemas/badges/badgeEditSchema';
import { BadgesService } from '../services/badgesService';
import { createRequireAdminCredentials } from './adminAccess';
import { processImage } from '../services/imageService';
import multer from 'multer';

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
  const maxBadgeImageBytes =
    config.getOptionalNumber('gamification.badges.imageUpload.maxBytes') ??
    1024 * 1024;
  const maxBadgeImagePixels =
    config.getOptionalNumber('gamification.badges.imageUpload.maxPixels') ??
    4096 * 4096;
  const upload = multer({
    limits: {
      files: 1,
      fileSize: maxBadgeImageBytes,
    },
  });
  const parseBadgeProgressSort = (
    sortByQuery: string | undefined,
  ):
    | 'earned_at'
    | 'created_at'
    | 'title'
    | 'xp_reward'
    | 'progress_percent' => {
    if (sortByQuery === 'progress') {
      return 'progress_percent';
    }

    if (
      sortByQuery === 'created_at' ||
      sortByQuery === 'title' ||
      sortByQuery === 'xp_reward' ||
      sortByQuery === 'progress_percent' ||
      sortByQuery === 'earned_at'
    ) {
      return sortByQuery;
    }

    return 'earned_at';
  };
  const parseBadgeAdminSort = (
    sortByQuery: string | undefined,
  ): 'created_at' | 'title' | 'xp_reward' | 'criteria_count' | 'status' => {
    if (sortByQuery === 'criteria') {
      return 'criteria_count';
    }

    if (
      sortByQuery === 'title' ||
      sortByQuery === 'xp_reward' ||
      sortByQuery === 'created_at' ||
      sortByQuery === 'criteria_count' ||
      sortByQuery === 'status'
    ) {
      return sortByQuery;
    }

    return 'created_at';
  };
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
  const requireBadgeAdminAccess: express.RequestHandler = (req, _res, next) => {
    requireAdminCredentials(req)
      .then(() => next())
      .catch(next);
  };
  const uploadBadgeImage: express.RequestHandler = (req, res, next) => {
    upload.single('image')(req, res, error => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            new InputError(
              `Badge image must be ${Math.floor(
                maxBadgeImageBytes / 1024,
              )} KB or smaller`,
            ),
          );
          return;
        }

        next(new InputError(error.message));
        return;
      }

      next(error);
    });
  };

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
      if (credentials.principal.type === 'user') {
        const info = await userInfo.getUserInfo(credentials);
        const allowedSubjectRefs = new Set(
          [
            credentials.principal.userEntityRef,
            ...info.ownershipEntityRefs,
          ].map(ref => ref.toLocaleLowerCase('en-US')),
        );

        if (!allowedSubjectRefs.has(requested.toLocaleLowerCase('en-US'))) {
          throw new NotAllowedError(
            'You can only view badge progress for yourself or your ownership groups',
          );
        }
      }

      subjectRefs = [requested];
    } else {
      const principal = credentials.principal;
      if (principal.type !== 'user') {
        throw new InputError('Only user credentials are allowed');
      }

      const info = await userInfo.getUserInfo(credentials);
      const audienceQuery =
        typeof req.query.audience === 'string' ? req.query.audience : undefined;
      const teamQuery =
        typeof req.query.team === 'string' ? req.query.team : undefined;
      const audience =
        audienceQuery === 'individual' || audienceQuery === 'team'
          ? audienceQuery
          : 'all';

      const userRef = principal.userEntityRef;
      const teamRefs = info.ownershipEntityRefs.filter(
        ref => ref !== userRef && ref.startsWith('group:'),
      );
      const selectedTeamRefs = teamQuery
        ? teamRefs.filter(
            ref =>
              ref.toLocaleLowerCase('en-US') ===
              teamQuery.toLocaleLowerCase('en-US'),
          )
        : teamRefs;

      if (audience === 'individual') {
        subjectRefs = [userRef];
      } else if (audience === 'team') {
        subjectRefs = selectedTeamRefs;
      } else {
        subjectRefs = [userRef, ...selectedTeamRefs];
      }

      subjectRefs = [...new Set(subjectRefs.filter(Boolean))];
    }

    const { page, limit } = parsePagination(req);
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const sortByQuery =
      typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const orderQuery =
      typeof req.query.order === 'string' ? req.query.order : undefined;
    const statusQuery =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const sortBy = parseBadgeProgressSort(sortByQuery);
    const order = orderQuery === 'asc' ? 'asc' : 'desc';
    const status =
      statusQuery === 'earned' || statusQuery === 'all'
        ? statusQuery
        : 'active';

    const badgeProgress = await badgesService.getBadgeProgress(subjectRefs, {
      credentials,
      searchTitle: search,
      sortBy,
      order,
      status,
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
    const sortByQuery =
      typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const orderQuery =
      typeof req.query.order === 'string' ? req.query.order : undefined;
    const { page, limit } = parsePagination(req);
    const sortBy = parseBadgeAdminSort(sortByQuery);
    const order = orderQuery === 'asc' ? 'asc' : 'desc';
    const badges = await badgesService.getBadges(search, {
      credentials,
      sortBy,
      order,
      page,
      limit,
    });

    res.status(200).json(badges);
  });

  router.post(
    '/badge-images',
    requireBadgeAdminAccess,
    uploadBadgeImage,
    async (req, res) => {
      if (!req.file) {
        throw new InputError('No file uploaded');
      }

      if (!req.file.mimetype.startsWith('image/')) {
        throw new InputError('Only image files are allowed');
      }

      const base64 = await processImage(req.file.buffer, {
        maxInputPixels: maxBadgeImagePixels,
      });

      const [image] = await badgesService.createBadgeImage(base64);

      res.status(201).json(image);
    },
  );

  router.get('/badge-images', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    const images = await badgesService.getBadgeImages();
    res.status(200).json(images);
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
