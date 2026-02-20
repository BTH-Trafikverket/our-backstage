import Router from 'express-promise-router';
import type { Knex } from 'knex';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { XpRepository } from '../repositories/xpRepository';
import { XpService } from '../services/xpService';

function isValidUserEntityRef(ref: string) {
  return /^user:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ref);
}

export function createXpRouter(options: {
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

    if (!isValidUserEntityRef(userRef)) {
      res
        .status(400)
        .json({ error: 'userRef must look like user:<namespace>/<name>' });
      return;
    }

    const status = await service.getStatus(userRef);
    res.json(status);
  });

  return router;
}
