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

import { BadgesRouter } from './routes/badgesRouter';
import { QuestsRouter } from './routes/questsRouter';
import { BadgesRepository } from './repositories/badgesRepository';
import { QuestsRepository } from './repositories/questsRepository';
import { BadgesService } from './services/badgesService';
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
  const badgesRepo = new BadgesRepository(knex);

  const catalogClient = new CatalogClient({ discoveryApi: discovery });

  const badgesService = new BadgesService({ badgesRepo, questsRepo });

  const questsService = new QuestsService({
    questsRepo,
    catalogClient,
    auth,
    badgesService,
  });

  const xpRepo = new XpRepository(knex);
  const xpService = new XpService(xpRepo, 100);

  router.use(
    '/badges',
    BadgesRouter({
      httpAuth,
      userInfo,
      badgesService,
      config,
    }),
  );

  router.use(
    '/quests',
    QuestsRouter({
      httpAuth,
      userInfo,
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
