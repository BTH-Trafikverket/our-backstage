import type {
  HttpAuthService,
  RootConfigService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import type express from 'express';

export function createRequireAdminCredentials(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  config: RootConfigService;
  deniedMessage: string;
}) {
  const adminGroups = new Set(
    (
      options.config.getOptionalStringArray('gamification.admin.groups') ?? []
    ).map(ref => ref.toLocaleLowerCase('en-US')),
  );

  return async (req: express.Request) => {
    const credentials = await options.httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    if (credentials.principal.type !== 'user') {
      throw new NotAllowedError(options.deniedMessage);
    }

    const info = await options.userInfo.getUserInfo(credentials);
    const hasAdminGroup = info.ownershipEntityRefs.some(ref =>
      adminGroups.has(ref.toLocaleLowerCase('en-US')),
    );

    if (!hasAdminGroup) {
      throw new NotAllowedError(options.deniedMessage);
    }

    return credentials;
  };
}
