import Router from 'express-promise-router';
import type { Knex } from 'knex';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { XpRepository } from '../repositories/xpRepository';
import { XpService } from '../services/xpService';

export function XpRouter(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  knex: Knex;
}) {
  const { httpAuth, userInfo, knex } = options;

  const repo = new XpRepository(knex);
  const service = new XpService(repo, 100);

  const router = Router();

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const requested =
      typeof req.query.userRef === 'string' ? req.query.userRef.trim() : '';

    let userRef: string;

    if (requested) {
      userRef = requested;
    } else {
      const info = await userInfo.getUserInfo(credentials);
      userRef = info.userEntityRef;
    }

    const status = await service.getStatus(userRef);
    res.json(status);
  });

  return router;
}
