import Router from 'express-promise-router';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import type { XpService } from '../services/xpService';

export function XpRouter(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  xpService: XpService;
}) {
  const { httpAuth, userInfo, xpService } = options;

  const router = Router();

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const requested =
      typeof req.query.subjectRef === 'string'
        ? req.query.subjectRef.trim()
        : '';

    if (!requested && credentials.principal.type !== 'user') {
      throw new InputError(
        'subjectRef is required when using service credentials',
      );
    }

    const subjectRef = requested
      ? requested
      : (await userInfo.getUserInfo(credentials)).userEntityRef;

    const status = await xpService.getStatus(subjectRef);
    res.json(status);
  });

  return router;
}
