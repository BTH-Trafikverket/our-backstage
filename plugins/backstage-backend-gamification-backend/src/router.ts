import {
  AuthService,
  DiscoveryService,
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import express from 'express';
import Router from 'express-promise-router';
import { QuestsRouter } from './routes/questsRouter';
import { QuestsRepository } from './repositories/questsRepository';
import { QuestsService } from './services/questsService';
import { XpRouter } from './routes/xpRouter';
import { CatalogClient } from '@backstage/catalog-client';

export function createRouter({
  httpAuth,
  userInfo,
  knex,
  config,
  auth,
  discovery,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  knex: Knex;
  config: RootConfigService;
  auth: AuthService;
  discovery: DiscoveryService;
}): express.Router {
  const router = Router();
  router.use(express.json());

  const questsRepo = new QuestsRepository(knex);

  const catalogClient = new CatalogClient({ discoveryApi: discovery });

  const questsService = new QuestsService({ questsRepo, catalogClient, auth });

  router.use(
    '/quests',
    QuestsRouter({
      httpAuth,
      questsService,
      config,
    }),
  );

  router.use('/xp', XpRouter({ httpAuth, userInfo, knex }));

  return router;
}
