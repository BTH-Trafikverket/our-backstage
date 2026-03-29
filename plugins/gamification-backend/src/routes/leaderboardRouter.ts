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

function parsePagination(req: { query: Record<string, unknown> }) {
  const pageQuery =
    typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
  const limitQuery =
    typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 25;

  return {
    page: Number.isFinite(pageQuery) && pageQuery > 0 ? pageQuery : 1,
    limit: Number.isFinite(limitQuery) && limitQuery > 0 ? limitQuery : 25,
  };
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
    const { page, limit } = parsePagination(req);

    const leaderboard = await leaderboardService.getLeaderboard({
      subjectType,
      page,
      limit,
    });
    res.status(200).json(leaderboard);
  });

  return router;
}
