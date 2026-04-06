import {
  AuthService,
  DiscoveryService,
  HttpAuthService,
  LoggerService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import express from 'express';
import Router from 'express-promise-router';

import { BadgesRouter } from './routes/badgesRouter';
import { LeaderboardRouter } from './routes/leaderboardRouter';
import { QuestsRouter } from './routes/questsRouter';
import { WebhookRouter } from './routes/webhookRouter';
import { BadgesRepository } from './repositories/badgesRepository';
import { LeaderboardRepository } from './repositories/leaderboardRepository';
import { QuestsRepository } from './repositories/questsRepository';
import { WebhookRepository } from './repositories/webhookRepository';
import { BadgesService } from './services/badgesService';
import { LeaderboardService } from './services/leaderboardService';
import { QuestsService } from './services/questsService';
import { WebhookService } from './services/webhookService';

import { XpRouter } from './routes/xpRouter';
import { CatalogClient } from '@backstage/catalog-client';
import { XpRepository } from './repositories/xpRepository';
import { XpService } from './services/xpService';

function readActorResolutionProviders(config: RootConfigService): Record<
  string,
  {
    idAnnotations?: string[];
    loginAnnotations?: string[];
  }
> {
  const providersConfig = config.getOptionalConfig(
    'gamification.actorResolution.providers',
  );
  if (!providersConfig) {
    return {};
  }

  const providers: Record<
    string,
    {
      idAnnotations?: string[];
      loginAnnotations?: string[];
    }
  > = {};

  for (const providerName of providersConfig.keys()) {
    const providerConfig = providersConfig.getConfig(providerName);
    providers[providerName.toLocaleLowerCase('en-US')] = {
      idAnnotations: providerConfig.getOptionalStringArray('idAnnotations'),
      loginAnnotations:
        providerConfig.getOptionalStringArray('loginAnnotations'),
    };
  }

  return providers;
}

export function createRouter({
  httpAuth,
  userInfo,
  knex,
  config,
  auth,
  discovery,
  logger,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  knex: Knex;
  config: RootConfigService;
  auth: AuthService;
  discovery: DiscoveryService;
  logger: LoggerService;
}): express.Router {
  const router = Router();
  router.use(express.json());

  const questsRepo = new QuestsRepository(knex);
  const badgesRepo = new BadgesRepository(knex);
  const webhookRepo = new WebhookRepository(knex);

  const catalogClient = new CatalogClient({ discoveryApi: discovery });
  const actorResolutionProviders = readActorResolutionProviders(config);
  const webhookService = new WebhookService({ webhookRepo, logger });

  const questsService = new QuestsService({
    questsRepo,
    catalogClient,
    auth,
    actorResolutionProviders,
  });
  const badgesService = new BadgesService({ badgesRepo, questsRepo });

  const xpRepo = new XpRepository(knex);
  const xpService = new XpService(xpRepo, 100);
  const leaderboardRepo = new LeaderboardRepository(knex);
  const leaderboardTimeZone =
    config.getOptionalString('gamification.leaderboard.timeZone') ??
    'Europe/Stockholm';
  const leaderboardService = new LeaderboardService(
    leaderboardRepo,
    25,
    100,
    () => new Date(),
    leaderboardTimeZone,
  );

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

  router.use(
    '/leaderboard',
    LeaderboardRouter({
      httpAuth,
      leaderboardService,
    }),
  );

  router.use(
    '/webhooks',
    WebhookRouter({
      httpAuth,
      userInfo,
      webhookService,
      config,
    }),
  );

  return router;
}
