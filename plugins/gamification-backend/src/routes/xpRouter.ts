import Router from 'express-promise-router';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError } from '@backstage/errors';
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

    let subjectRef = requested;

    if (requested) {
      if (credentials.principal.type === 'user') {
        const info = await userInfo.getUserInfo(credentials);
        const allowedSubjectRefs = new Set(
          [
            credentials.principal.userEntityRef,
            ...info.ownershipEntityRefs,
          ].map(ref => ref.toLocaleLowerCase('en-US')),
        );

        if (!allowedSubjectRefs.has(requested.toLocaleLowerCase('en-US'))) {
          throw new NotAllowedError(
            'You can only view XP for yourself or your ownership groups',
          );
        }
      }
    } else {
      subjectRef = (await userInfo.getUserInfo(credentials)).userEntityRef;
    }

    const status = await xpService.getStatus(subjectRef);
    res.json(status);
  });

  return router;
}
