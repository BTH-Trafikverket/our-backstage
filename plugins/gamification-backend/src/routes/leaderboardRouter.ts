import type { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import Router from 'express-promise-router';
import type { LeaderboardSubjectType } from '../repositories/leaderboardRepository';
import type { LeaderboardService } from '../services/leaderboardService';

function parseSubjectType(
  subjectTypeQuery: string | undefined,
): LeaderboardSubjectType {
  if (!subjectTypeQuery) {
    return 'user';
  }

  const normalized = subjectTypeQuery.trim().toLocaleLowerCase('en-US');
  if (!normalized || normalized === 'user') {
    return 'user';
  }

  if (normalized === 'group' || normalized === 'team') {
    return 'group';
  }

  throw new InputError('subjectType must be one of: user, group, team');
}

export function LeaderboardRouter(options: {
  httpAuth: HttpAuthService;
  leaderboardService: LeaderboardService;
}) {
  const { httpAuth, leaderboardService } = options;

  const router = Router();

  router.get('/', async (req, res) => {
    await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const subjectType = parseSubjectType(
      typeof req.query.subjectType === 'string'
        ? req.query.subjectType
        : undefined,
    );

    const leaderboard = await leaderboardService.getLeaderboard(subjectType);
    res.status(200).json(leaderboard);
  });

  return router;
}
