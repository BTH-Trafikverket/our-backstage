import Router from 'express-promise-router';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
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
      typeof req.query.userRef === 'string' ? req.query.userRef.trim() : '';

    const userRef = requested
      ? requested
      : (await userInfo.getUserInfo(credentials)).userEntityRef;

    const status = await xpService.getStatus(userRef);
    res.json(status);
  });

  return router;
}
