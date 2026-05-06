# Auth and Config

The backend enforces gamification authorization. Frontend code should render useful admin/user states, but it must not be the authority for access control.

## Admin Access

Admin access is granted to users whose ownership entity refs include one of the refs configured in `gamification.admin.groups`.

Implementation:

- [adminAccess.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/adminAccess.ts)
- [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)
- [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)

Rules:

- Admin-only management routes accept credentials, then require a user principal.
- Service credentials are not admin credentials.
- Group matching is case-insensitive.
- `/quests/admin-status` returns `{ isAdmin }` for UI state and does not grant permissions by itself.

Admin-only surfaces:

- Quest create, update, archive/list-admin, development test helpers, and manual catalog-linked quest runs by a user.
- Badge create, update, archive/list-admin, get-by-id, and badge image upload.
- Webhook create, update, delete, list, and event metadata.

## Service Callers

Quest event ingestion is service-auth only and gated by `gamification.quests.allowedCallers`.

Implementation:

- [QuestsRouter `/events`](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [questEventSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questEventSchema.ts)
- [QuestsService actor resolution](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)

Rules:

- `/quests/events` only allows service credentials.
- The service principal subject must be listed in `gamification.quests.allowedCallers`.
- The event body must include `eventId`, `questId`, and either `subjectRef` or an `actor`.
- User quest events can resolve actor data to a catalog user. Team quest events require a group entity ref.
- `/quests/catalog/run` allows either an allowed service caller or an admin user.

## User and Ownership Reads

Some read routes allow users or service credentials, but subject access is still checked.

Implementation:

- [xpRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/xpRouter.ts)
- [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)
- [leaderboardRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/leaderboardRouter.ts)
- [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)

Rules:

- `/xp` accepts user or service credentials.
- `/badges/progress` accepts user or service credentials.
- Service callers must provide `subjectRef` where the route requires a subject.
- User callers may only read their own user ref or their ownership group refs.
- `/quests/me` is user-only and returns progress for the user plus ownership groups.
- `/leaderboard` accepts user or service credentials and returns ranked XP data.

## Runtime Config

The typed config contract lives in [config.d.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/config.d.ts). Local values live in [app-config.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/app-config.yaml), with e2e overrides in [app-config.e2e.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/app-config.e2e.yaml).

| Key                                                  | Purpose                                                                        | Default                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| `gamification.admin.groups`                          | Catalog group refs allowed to manage quests, badges, and webhooks.             | `[]`                       |
| `gamification.quests.allowedCallers`                 | Service principals allowed to post quest events and run catalog-linked quests. | `[]`                       |
| `gamification.badges.imageUpload.maxBytes`           | Badge image upload size limit.                                                 | `1048576`                  |
| `gamification.badges.imageUpload.maxPixels`          | Badge image source pixel limit before Sharp processing rejects it.             | `16777216`                 |
| `gamification.leaderboard.timeZone`                  | Timezone for weekly/monthly leaderboard windows.                               | `Europe/Stockholm`         |
| `gamification.webhooks.timeZone`                     | Timezone for scheduled webhook periods.                                        | `Europe/Stockholm`         |
| `gamification.webhooks.scheduleScanIntervalMs`       | Scheduled webhook scan interval.                                               | `60000`                    |
| `gamification.webhooks.delivery.enabled`             | Starts or disables the domain event delivery worker.                           | `true`                     |
| `gamification.webhooks.delivery.pollIntervalMs`      | Fallback polling interval for delivery.                                        | `600000`                   |
| `gamification.webhooks.delivery.batchSize`           | Max claimed domain events per batch.                                           | `25`                       |
| `gamification.webhooks.delivery.maxAttempts`         | Max delivery attempts before dead-lettering.                                   | `10`                       |
| `gamification.webhooks.delivery.claimTtlMs`          | Age after which claimed events can be reclaimed.                               | `60000`                    |
| `gamification.webhooks.delivery.requestTimeoutMs`    | Outbound webhook request timeout.                                              | `10000`                    |
| `gamification.webhooks.delivery.allowedHosts`        | Optional outbound host allowlist.                                              | unset                      |
| `gamification.webhooks.delivery.allowHttp`           | Allows plain HTTP webhook targets.                                             | `false`                    |
| `gamification.webhooks.delivery.allowPrivateTargets` | Allows localhost/private literal IP webhook targets.                           | `false`                    |
| `gamification.webhooks.scheduling.enabled`           | Starts or disables scheduled webhook scans.                                    | `true`                     |
| `gamification.reminders.enabled`                     | Starts or disables reminder evaluation.                                        | `true`                     |
| `gamification.reminders.evaluationIntervalMs`        | Reminder evaluation interval.                                                  | `3600000`                  |
| `gamification.reminders.rules`                       | Config-driven inactivity reminder rules.                                       | `[]`                       |
| `gamification.catalogLinked.enabled`                 | Starts or disables catalog-linked quest evaluation.                            | `true`                     |
| `gamification.catalogLinked.scanIntervalMs`          | Catalog-linked quest scan interval.                                            | `900000`                   |
| `gamification.actorResolution.providers`             | Provider-specific annotation lookups for actor resolution.                     | GitHub defaults in service |
| `gamification.seed.enabled`                          | Applies bundled seed data at plugin startup.                                   | `false`                    |
| `gamification.seed.reset`                            | Clears gamification data before applying seeds.                                | `false`                    |

Production seeds are skipped even when enabled unless `GAMIFICATION_ALLOW_PRODUCTION_SEEDS=true` is set.
