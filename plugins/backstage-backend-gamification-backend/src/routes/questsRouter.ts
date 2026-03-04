import {
  HttpAuthService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { questCreationSchema } from '../schemas/quests/questCreationSchema';
import { QuestsService } from '../services/questsService';
import { questEditSchema } from '../schemas/quests/questEditSchema';
import { questEventSchema } from '../schemas/quests/questEventSchema';

export function QuestsRouter({
  httpAuth,
  questsService,
  config,
}: {
  httpAuth: HttpAuthService;
  questsService: QuestsService;
  config: RootConfigService;
}): express.Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = questCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

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

    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

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

    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

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
      eventKey: parsed.data.eventKey,
      actor: parsed.data.actor,
      callerSubject: principal.subject,
      opts: { credentials },
    });

    res.status(200).json(result);
  });

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;

    const quests = await questsService.getQuests(search, { credentials });

    res.status(200).json(quests);
  });

  router.get('/me', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });

    const principal = credentials.principal;
    if (principal.type !== 'user') {
      throw new InputError('Only user credentials are allowed');
    }

    const userRef = principal.userEntityRef;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;

    const quests = await questsService.getQuestsWithProgress(
      userRef,
      {
        credentials,
      },
      search,
    );

    res.status(200).json(quests);
  });

  return router;
}
