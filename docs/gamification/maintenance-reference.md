# Maintenance Reference

This page is a compact map for smaller files and day-to-day maintenance tasks. It is not intended to duplicate implementation details already covered by tests and code.

## Frontend Component Map

| Area         | Files                                                                                                                                                                                                                                                              | Notes                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Root page    | [GamificationPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/GamificationPage.tsx)                                                                                                                       | Owns tab routing, admin-status check, and local preview mode.                            |
| Quests       | [QuestsPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/QuestsPage)                                                                                                                                           | Page, toolbar, table, form dialog, delete dialog, types, and payload/table helpers.      |
| Badges       | [BadgesPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/BadgesPage)                                                                                                                                           | Page, toolbar, table, form dialog, delete dialog, badge image state, types, and helpers. |
| Leaderboard  | [LeaderboardPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/LeaderboardPage)                                                                                                                                 | Page and toolbar for ranking filters, search, sorting, and local pagination.             |
| Webhooks     | [WebhooksPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/WebhooksPage)                                                                                                                                       | Page, table, form, delete, reachability warning, JSON highlight, types, and helpers.     |
| Entity cards | [EntityXpCard](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/EntityXpCard), [EntityBadgesCard](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/EntityBadgesCard) | Read-only catalog entity cards.                                                          |
| Test page    | [TestPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/TestPage)                                                                                                                                               | Non-production support surface.                                                          |

Frontend conventions:

- Keep backend calls discovery-based with `discoveryApi.getBaseUrl('gamification')`.
- Prefer Backstage UI components for new gamification UI.
- Keep validation helpers aligned with backend Zod schemas, but keep final authorization and business rules on the backend.
- Keep table payload normalization in each page's local `utils.ts` unless there is real cross-page duplication.

## Backend File Map

| Area            | Files                                                                                                                            | Notes                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Plugin startup  | [plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts)              | Migration, seeds, router mounting, and worker startup.                                          |
| Router assembly | [router.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/router.ts)              | Wires repositories, services, and route modules.                                                |
| Routes          | [routes](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/routes)                    | Auth, request parsing, response status codes.                                                   |
| Services        | [services](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/services)                | Business rules, catalog integration, workers, target policy, reminders, and delivery logic.     |
| Repositories    | [repositories](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/repositories)        | Query and mutation boundaries. Prefer adding query methods here over embedding SQL in services. |
| Schemas         | [schemas](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/schemas)                  | Zod validation for request bodies and structured config fields.                                 |
| OpenAPI         | [openapi.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schema/openapi.yaml) | Authoritative API contract.                                                                     |
| Migrations      | [migrations](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/migrations)                | Database schema, constraints, triggers, and runtime state.                                      |
| Seeds           | [seeds](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/seeds)                          | Optional local/demo data applied at startup only when enabled.                                  |

Backend conventions:

- When a route changes, check route, service, repository, schema, OpenAPI, frontend caller, and tests together.
- When a persistent field changes, align migration constraints, Zod validation, OpenAPI, and repository mapping.
- Do not bypass trigger-owned state for XP, badge runtime, subject XP state, or domain events.

## Test Map

| Layer                    | Files                                                                                                                                                       | Purpose                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Frontend unit/component  | [plugins/gamification/src/components](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components)                      | Component behavior, table behavior, and page-specific UI helpers.                    |
| Backend unit/integration | [backend tests](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/__tests__)                                     | Route, service, repository, trigger, migration, worker, schema, and policy coverage. |
| Backend DB harness       | [postgres18TestHarness.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/tests/helpers/postgres18TestHarness.ts) | Shared Postgres 18 test database setup, migration application, and table cleanup.    |
| E2E                      | [plugins/gamification/e2e-tests](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/e2e-tests)                                | Admin CRUD, smoke tests, leaderboard flows, and guest auth helpers.                  |
| App E2E                  | [packages/app/e2e-tests](https://github.com/BTH-Trafikverket/our-backstage/tree/main/packages/app/e2e-tests)                                                | App-shell coverage used by local verification.                                       |

## Useful Commands

Run from the repo root.

```bash
# Sync generated catalog API entity from backend OpenAPI
yarn gamification:openapi:sync

# Check OpenAPI generation without writing
yarn gamification:openapi:check

# Frontend plugin tests
yarn gamification:test:frontend

# Backend plugin tests
yarn gamification:test:backend

# Full gamification verification
yarn gamification:verify

# Isolated local E2E app
yarn start:e2e

# Playwright E2E against isolated or running dev app
yarn test:e2e
```

The full verification script is [scripts/gamification-verify.sh](https://github.com/BTH-Trafikverket/our-backstage/blob/main/scripts/gamification-verify.sh). It runs OpenAPI check, gamification Prettier, ESLint, frontend tests, backend tests, and E2E tests in that order.

## Local E2E Notes

The local E2E flow is documented in the root [README](https://github.com/BTH-Trafikverket/our-backstage/blob/main/README.md).

Important defaults:

- `yarn start:e2e` uses `http://localhost:3001` and `http://localhost:7008`.
- Normal development fallback uses `http://localhost:3000` and `http://localhost:7007`.
- E2E uses guest auth against the dev stack.
- Backend integration tests require a local Postgres user that can create temporary databases.

Useful environment overrides:

- `APP_BASE_URL_E2E`
- `BACKEND_BASE_URL_E2E`
- `PLAYWRIGHT_URL`
- `PLAYWRIGHT_BACKEND_URL`
- `DB_HOST_E2E`
- `DB_PORT_E2E`
- `DB_USER_E2E`
- `DB_PASSWORD_E2E`
- `DB_NAME_E2E`

## Where To Add Tests

- Route authorization or status-code behavior: add route tests.
- Service business rules: add service tests.
- SQL shape, persistence, or filtering: add repository tests.
- Trigger behavior, constraints, or migration safety: add database-backed migration or trigger tests.
- User-visible frontend behavior: add component tests or Playwright coverage depending on risk.
- Cross-page workflows: add E2E only when unit/component tests cannot cover the behavior.
