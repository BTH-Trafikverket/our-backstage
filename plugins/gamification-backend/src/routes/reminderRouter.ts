import Router from 'express-promise-router';
import type {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import type { ReminderService } from '../services/reminderService';

export function ReminderRouter(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  reminderService: ReminderService;
}) {
  const { httpAuth, userInfo, reminderService } = options;
  const router = Router();

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const principal = credentials.principal;
    if (principal.type !== 'user') {
      throw new InputError('Only user credentials are allowed');
    }

    const info = await userInfo.getUserInfo(credentials);
    const reminders = await reminderService.listVisibleReminders({
      viewerSubjectRef: principal.userEntityRef,
      ownershipEntityRefs: info.ownershipEntityRefs,
    });

    res.status(200).json({ reminders });
  });

  router.post('/:id/dismiss', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing reminder id');
    }

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const principal = credentials.principal;
    if (principal.type !== 'user') {
      throw new InputError('Only user credentials are allowed');
    }

    const info = await userInfo.getUserInfo(credentials);
    await reminderService.dismissReminder(id, {
      viewerSubjectRef: principal.userEntityRef,
      ownershipEntityRefs: info.ownershipEntityRefs,
    });

    res.status(204).send();
  });

  router.post('/:id/disable', async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new InputError('Missing reminder id');
    }

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const principal = credentials.principal;
    if (principal.type !== 'user') {
      throw new InputError('Only user credentials are allowed');
    }

    const info = await userInfo.getUserInfo(credentials);
    await reminderService.disableReminder(id, {
      viewerSubjectRef: principal.userEntityRef,
      ownershipEntityRefs: info.ownershipEntityRefs,
    });

    res.status(204).send();
  });

  return router;
}
