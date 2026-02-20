import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { questCreationSchema } from './schemas/schemaBarrel';

export async function createRouter({
  httpAuth,
}: {
  httpAuth: HttpAuthService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  router.post('/quests', async (req, res) => {
    const parsed = questCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await (parsed.data,
    {
      credentials: await httpAuth.credentials(req, { allow: ['user'] }),
    });

    res.status(201).json(result);
  });

  return router;
}
