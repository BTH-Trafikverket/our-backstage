# Operations

This page covers the parts of gamification that affect local development, TechDocs publishing, config, testing, and production behavior.

## Runtime Config

The typed config contract lives in [plugins/gamification-backend/config.d.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/config.d.ts). Local values live in [app-config.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/app-config.yaml), with e2e overrides in [app-config.e2e.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/app-config.e2e.yaml).

The config that most often changes behavior:

| Key                                        | Why it matters                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `gamification.admin.groups`                | Catalog group refs allowed to manage quests, badges, and webhooks.                                |
| `gamification.quests.allowedCallers`       | Service principals allowed to post quest events and run catalog-linked quests.                    |
| `gamification.badges.imageUpload.*`        | Badge image byte and pixel limits.                                                                |
| `gamification.leaderboard.timeZone`        | Weekly and monthly leaderboard window boundaries.                                                 |
| `gamification.webhooks.timeZone`           | Scheduled webhook period boundaries.                                                              |
| `gamification.webhooks.delivery.*`         | Delivery enablement, retries, claim TTL, timeout, allowed hosts, HTTP, and private target policy. |
| `gamification.webhooks.scheduling.enabled` | Scheduled webhook worker enablement.                                                              |
| `gamification.reminders.*`                 | Reminder worker enablement, evaluation interval, and activity rules.                              |
| `gamification.catalogLinked.*`             | Catalog-linked quest worker enablement and scan interval.                                         |
| `gamification.actorResolution.providers`   | Provider annotation lookups used to resolve quest event actors.                                   |
| `gamification.seed.*`                      | Optional local or demo seed behavior.                                                             |

Production seeds are skipped unless `GAMIFICATION_ALLOW_PRODUCTION_SEEDS=true` is set.

## TechDocs Publishing

The app is wired to show TechDocs:

- [packages/app/src/App.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/packages/app/src/App.tsx) mounts the TechDocs reader.
- [catalog-info.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/catalog-info.yaml) points TechDocs at this repo with `backstage.io/techdocs-ref: dir:.`.
- [packages/backend/src/index.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/packages/backend/src/index.ts) registers the TechDocs backend plugin.

Normal local app config uses external TechDocs building with S3 publishing:

- [app-config.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/app-config.yaml) sets `techdocs.builder: external` and `publisher.type: awsS3`.
- [.github/workflows/techdocs.yml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/.github/workflows/techdocs.yml) generates and publishes TechDocs on pushes to `main`.
- Local e2e config uses local builder and publisher so tests do not depend on S3.

If you start the project locally and the docs are missing, the usual cause is that the S3-published TechDocs site has not been generated for the current branch content yet. Local `yarn start` reads from the configured publisher; it does not automatically publish fresh docs to S3.

## Verification Commands

Run commands from the repo root.

```bash
# Full verification required before finishing gamification changes
yarn gamification:verify

# Sync generated catalog API entity from backend OpenAPI
yarn gamification:openapi:sync

# Check OpenAPI generation without writing
yarn gamification:openapi:check

# Frontend plugin tests
yarn gamification:test:frontend

# Backend plugin tests
yarn gamification:test:backend

# Isolated local E2E app
yarn start:e2e

# Playwright E2E against isolated or running dev app
yarn test:e2e
```

The full verification script is [scripts/gamification-verify.sh](https://github.com/BTH-Trafikverket/our-backstage/blob/main/scripts/gamification-verify.sh). It runs OpenAPI check, gamification Prettier, ESLint, frontend tests, backend tests, and E2E tests.

## Test Strategy

Add tests where the risk is introduced:

- Route authorization or status-code behavior: route tests.
- Service business rules: service tests.
- SQL shape, persistence, filtering, or idempotency: repository tests.
- Migrations, constraints, or triggers: database-backed tests.
- User-visible frontend behavior: component tests, with Playwright only for workflows that need the app shell.
- Cross-page behavior: E2E only when unit or component tests cannot cover the risk.

Test code anchors:

- [Frontend components](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components)
- [Backend tests](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/__tests__)
- [Postgres 18 harness](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/tests/helpers/postgres18TestHarness.ts)
- [Gamification E2E](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/e2e-tests)

## Troubleshooting

| Symptom                                  | Check                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TechDocs page is missing locally         | Confirm docs were published to S3 for the current catalog entity. Use e2e local config when testing generated docs without S3. |
| Admin tab is hidden                      | Confirm the user's ownership refs include a group configured in `gamification.admin.groups`.                                   |
| Service quest events return unauthorized | Confirm the service principal is listed in `gamification.quests.allowedCallers`.                                               |
| Webhook target validation fails          | Check `allowedHosts`, `allowHttp`, `allowPrivateTargets`, and timeout config.                                                  |
| Reminder demo data is missing            | Enable local seeds and use the non-production force-reminder action from the test page.                                        |
| Catalog-linked quest does not progress   | Confirm the quest is team-scoped, uses catalog mode, and has valid linked config.                                              |
