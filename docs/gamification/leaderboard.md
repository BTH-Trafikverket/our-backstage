# Leaderboard

The leaderboard ranks subjects by XP awarded in `xp_awards`.

## Why This Exists

The leaderboard was added so users can compare individual and team XP progress using the same XP records already produced by quests and badges. It is an aggregate gamification view, not a separate analytics subsystem.

## Frontend

Source:

- [LeaderboardPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/LeaderboardPage/LeaderboardPage.tsx)
- [LeaderboardToolbar.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/LeaderboardPage/LeaderboardToolbar.tsx)

The page supports:

- Individual and team rankings.
- Weekly, monthly, and all-time ranges.
- Search by displayed subject name.
- Client-side sort by rank, name, or points.
- Client-side pagination with page size clamped from 3 to 25.

The frontend fetches all backend pages using `limit=100`, then applies search, sort, and visible pagination locally.

This local filtering approach was chosen after a completed pagination bug: filtering only the current backend page could show empty UI pages even when matching results existed on later backend pages.

## Backend

Source:

- [leaderboardRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/leaderboardRouter.ts)
- [LeaderboardService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/leaderboardService.ts)
- [LeaderboardRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/leaderboardRepository.ts)

Route:

- `GET /leaderboard`

Query params:

- `subjectType`: `user`, `group`, or `team`; `team` is normalized to `group`.
- `timeRange`: `weekly`, `monthly`, or `alltime`.
- `page`: positive integer, default `1`.
- `limit`: positive integer, max `100`, default `25`.

Auth:

- User or service credentials are accepted.
- Leaderboard results are aggregate rankings and are not restricted to a specific viewer.

Current boundary: this is a global authenticated ranking view. It does not currently apply self-only or owned-team-only filtering.

## Ranking Rules

Repository behavior:

- Reads from `xp_awards`.
- Filters subject refs by prefix: `user:` for individual rankings and `group:` for team rankings.
- Groups by `subject_ref`.
- Orders by total XP descending, then subject ref ascending.
- Computes rank from backend page offset.

## Time Windows

Source:

- [LeaderboardService time window logic](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/leaderboardService.ts)
- [leaderboardService.test.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/__tests__/leaderboardService.test.ts)

Time ranges:

- `alltime` does not filter by award date.
- `monthly` starts at local midnight on the first day of the current month and ends at local midnight on the first day of the next month.
- `weekly` starts at local Monday midnight and ends at the next local Monday midnight.

The timezone comes from `gamification.leaderboard.timeZone`, defaulting to `Europe/Stockholm`.
