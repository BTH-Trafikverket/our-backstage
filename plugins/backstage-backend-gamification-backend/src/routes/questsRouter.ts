import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { questCreationSchema } from '../schemas/quests/questCreationSchema';
import { questCompletionSchema } from '../schemas/quests/questCompletionSchema';
import { QuestsService } from '../services/questsService';
import { questEditSchema } from '../schemas/quests/questEditSchema';

export function QuestsRouter({
  httpAuth,
  questsService,
}: {
  httpAuth: HttpAuthService;
  questsService: QuestsService;
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

  router.post('/complete', async (req, res) => {
    const parsed = questCompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const progress = await questsService.completeQuest(parsed.data.quest_id, {
      credentials,
    });

    res.status(200).json(progress);
  });

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const quests = await questsService.getQuests({ credentials });

    res.status(200).json(quests);
  });

  return router;
}
