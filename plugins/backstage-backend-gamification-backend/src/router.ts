import {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import express from 'express';
import Router from 'express-promise-router';
import { createQuestsRouter } from './routes/questsRouter';
import { QuestsRepository } from './repositories/questsRepository';
import { QuestsService } from './services/questsService';
import { createXpRouter } from './routes/xpRouter';

export function createRouter({
  httpAuth,
  userInfo,
  knex,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  knex: Knex;
}): express.Router {
  const router = Router();
  router.use(express.json());

  const questsRepo = new QuestsRepository(knex);
  const questsService = new QuestsService({ questsRepo });

  router.use(
    '/quests',
    createQuestsRouter({
      httpAuth,
      createQuest: (data, opts) => questsService.createQuest(data, opts),
      questService: questsService,
    }),
  );

  router.use('/xp', createXpRouter({ httpAuth, userInfo, knex }));

  return router;
}
