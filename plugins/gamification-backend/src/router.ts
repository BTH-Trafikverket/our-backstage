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
import { XpRepository } from './repositories/xpRepository';
import { XpService } from './services/xpService';

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

  const xpRepo = new XpRepository(knex);
  const xpService = new XpService(xpRepo, 100);

  router.use(
    '/quests',
    QuestsRouter({
      httpAuth,
      questsService,
      config,
    }),
  );

  router.use(
    '/xp',
    XpRouter({
      httpAuth,
      userInfo,
      xpService,
    }),
  );

  return router;
}
