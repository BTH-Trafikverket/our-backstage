import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  questCreationSchema,
  QuestCreationInput,
} from '../schemas/schemaBarrel';

type CreateQuestFn = (
  data: QuestCreationInput,
  opts: { credentials: any },
) => Promise<any>;

export function createQuestsRouter({
  httpAuth,
  createQuest,
  questService,
}: {
  httpAuth: HttpAuthService;
  createQuest: CreateQuestFn;
  questService: any;
}): express.Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = questCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await createQuest(parsed.data, {
      credentials: await httpAuth.credentials(req, {
        allow: ['user', 'service'],
      }),
    });

    res.status(201).json(result);
  });

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const quests = await questService.getQuests({ credentials });

    res.status(200).json(quests);
  });

  return router;
}
