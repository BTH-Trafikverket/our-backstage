## Gamification Backend

This backend plugin is mounted at `/api/gamification` and exposes three route groups:

- `/quests`
- `/badges`
- `/xp`

The runtime flow is:

`HTTP request -> route -> service -> repository -> Postgres tables/triggers`

Routes handle auth and request validation, services contain business rules, repositories perform the database work, and Postgres triggers keep XP awards and badge runtime state in sync.

## Startup

`src/plugin.ts`:

1. Initializes the plugin database connection
2. Applies migrations
3. Optionally runs seeds if `gamification.seed.enabled` is true
4. Mounts the router

Seeds are disabled by default and are skipped in production unless `GAMIFICATION_ALLOW_PRODUCTION_SEEDS=true` is set explicitly.

## Main tables

Core quest data:

- `quests`
- `quest_progress`
- `xp_awards`
- `quest_event_receipts`

Core badge data:

- `badges`
- `badge_criteria`
- `badge_criteria_completion`
- `earned_badges`

## Current quest model

Quests use:

- `target_count`
- `xp_reward`
- `subject_type`
- `completion_policy`
- `cooldown_days`

Quest progress is updated by the TypeScript layer. XP awards are written by database triggers into `xp_awards`.

`/quests/events` is service-auth only and idempotent through `quest_event_receipts`.

## Current badge model

Badges have:

- `xp_reward`
- `subject_type`
- one or more `badge_criteria`

Badge runtime state is maintained in Postgres:

- criteria completion is persisted in `badge_criteria_completion`
- earned badges are persisted in `earned_badges`
- badge XP awards are written to `xp_awards`

## Auth model

- Quest and badge management routes are admin-only
- `/quests/events` only accepts allowed service principals
- `/badges/progress` and `/xp` allow user or service credentials, with `subjectRef` required for service callers where applicable

Admin access is configured through `gamification.admin.groups`.
Allowed event callers are configured through `gamification.quests.allowedCallers`.

## OpenAPI

The authoritative API contract is:

- `plugins/gamification-backend/src/schema/openapi.yaml`

The catalog API entity is generated from that file:

- `catalog/apis/gamification-api.yaml`

Use:

- `yarn gamification:openapi:sync`

and `yarn gamification:verify` will fail if the generated catalog API file is out of sync.
