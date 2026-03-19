import {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { questCreationSchema } from '../schemas/quests/questCreationSchema';
import { QuestsService } from '../services/questsService';
import { questEditSchema } from '../schemas/quests/questEditSchema';
import { questEventSchema } from '../schemas/quests/questEventSchema';
import {
  createReadAdminAccess,
  createRequireAdminCredentials,
} from './adminAccess';

export function QuestsRouter({
  httpAuth,
  userInfo,
  questsService,
  config,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  questsService: QuestsService;
  config: RootConfigService;
}): express.Router {
  const router = Router();
  const requireAdminCredentials = createRequireAdminCredentials({
    httpAuth,
    userInfo,
    config,
    deniedMessage: 'Only admin users can manage quests',
  });
  const readAdminAccess = createReadAdminAccess({
    httpAuth,
    userInfo,
    config,
  });

  router.get('/admin-status', async (req, res) => {
    const { isAdmin } = await readAdminAccess(req);
    res.status(200).json({ isAdmin });
  });

  router.post('/', async (req, res) => {
    const parsed = questCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);

    const result = await questsService.createQuest(parsed.data, {
      credentials,
    });

    res.status(201).json(result);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing quest id');
    }

    const parsed = questEditSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await requireAdminCredentials(req);

    const updated = await questsService.editQuest(id, parsed.data, {
      credentials,
    });

    if (!updated) {
      throw new NotFoundError('Quest not found');
    }

    res.status(200).json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing quest id');
    }

    const credentials = await requireAdminCredentials(req);

    const deleted = await questsService.deleteQuest(id, { credentials });
    if (!deleted) {
      throw new NotFoundError('Quest not found');
    }

    res.status(204).send();
  });

  router.post('/events', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['service'] });

    const principal = credentials.principal;
    if (principal.type !== 'service') {
      throw new InputError('Only service credentials are allowed');
    }

    const allowed =
      config.getOptionalStringArray('gamification.quests.allowedCallers') ?? [];

    if (!allowed.includes(principal.subject)) {
      throw new NotFoundError('Caller not allowed');
    }

    const parsed = questEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await questsService.handleQuestEvent({
      eventId: parsed.data.eventId,
      questId: parsed.data.questId,
      subjectRef: parsed.data.subjectRef,
      actor: parsed.data.actor,
      callerSubject: principal.subject,
      opts: { credentials },
    });

    res.status(200).json(result);
  });

  router.get('/', async (req, res) => {
    const credentials = await requireAdminCredentials(req);

    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const audienceQuery =
      typeof req.query.audience === 'string' ? req.query.audience : undefined;
    const sortByQuery =
      typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const orderQuery =
      typeof req.query.order === 'string' ? req.query.order : undefined;
    const pageQuery =
      typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limitQuery =
      typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;

    const audience =
      audienceQuery === 'individual' || audienceQuery === 'team'
        ? audienceQuery
        : 'all';
    const sortBy =
      sortByQuery === 'title' || sortByQuery === 'xp_reward'
        ? sortByQuery
        : 'created_at';
    const order = orderQuery === 'asc' ? 'asc' : 'desc';
    const page = Number.isFinite(pageQuery) && pageQuery > 0 ? pageQuery : 1;
    const limit =
      Number.isFinite(limitQuery) && limitQuery > 0 ? limitQuery : 10;

    const quests = await questsService.getQuests(
      {
        searchTitle: search,
        audience,
        sortBy,
        order,
        includeArchived: true,
        page,
        limit,
      },
      { credentials },
    );

    res.status(200).json(quests);
  });

  router.get('/me', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });

    const principal = credentials.principal;
    if (principal.type !== 'user') {
      throw new InputError('Only user credentials are allowed');
    }

    const userRef = principal.userEntityRef;
    const info = await userInfo.getUserInfo(credentials);
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const audienceQuery =
      typeof req.query.audience === 'string' ? req.query.audience : undefined;
    const statusQuery =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const team =
      typeof req.query.team === 'string' ? req.query.team : undefined;
    const sortByQuery =
      typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const orderQuery =
      typeof req.query.order === 'string' ? req.query.order : undefined;
    const pageQuery =
      typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limitQuery =
      typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;

    const audience =
      audienceQuery === 'individual' || audienceQuery === 'team'
        ? audienceQuery
        : 'all';
    const status =
      statusQuery === 'completed' || statusQuery === 'all'
        ? statusQuery
        : 'active';
    const sortBy =
      sortByQuery === 'title' || sortByQuery === 'xp_reward'
        ? sortByQuery
        : 'created_at';
    const order = orderQuery === 'asc' ? 'asc' : 'desc';
    const page = Number.isFinite(pageQuery) && pageQuery > 0 ? pageQuery : 1;
    const limit =
      Number.isFinite(limitQuery) && limitQuery > 0 ? limitQuery : 10;

    const result = await questsService.getQuestsWithProgress(
      userRef,
      info.ownershipEntityRefs,
      {
        credentials,
      },
      {
        searchTitle: search,
        audience,
        status,
        teamRef: team,
        sortBy,
        order,
        page,
        limit,
      },
    );

    res.status(200).json(result);
  });

  return router;
}
