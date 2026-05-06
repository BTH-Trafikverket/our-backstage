# API Contracts

The authoritative API contract is [plugins/gamification-backend/src/schema/openapi.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schema/openapi.yaml).

The catalog API entity is generated at [catalog/apis/gamification-api.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/catalog/apis/gamification-api.yaml). Run:

```bash
yarn gamification:openapi:sync
```

`yarn gamification:verify` fails when the generated catalog API file is out of sync.

## Route Map

All routes are mounted under `/api/gamification`.

| Route                                   | Purpose                                                         | Auth                                                                                      | Source                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /leaderboard`                      | Paginated XP leaderboard for users or groups.                   | User or service.                                                                          | [leaderboardRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/leaderboardRouter.ts)                   |
| `GET /xp`                               | XP status for a subject.                                        | User or service; service requires `subjectRef`; user limited to self or ownership groups. | [xpRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/xpRouter.ts)                                     |
| `GET /quests/admin-status`              | UI admin state.                                                 | User or service; only user ownership can make `isAdmin=true`.                             | [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)                             |
| `GET /quests`                           | Admin quest list.                                               | Admin user.                                                                               | [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)                             |
| `POST /quests`                          | Create quest.                                                   | Admin user.                                                                               | [questCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questCreationSchema.ts)       |
| `GET /quests/me`                        | Current user's quest progress across self and ownership groups. | User.                                                                                     | [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)                             |
| `PATCH /quests/{id}`                    | Update quest.                                                   | Admin user.                                                                               | [questEditSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questEditSchema.ts)               |
| `DELETE /quests/{id}`                   | Archive quest.                                                  | Admin user.                                                                               | [QuestsService.deleteQuest](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)                |
| `POST /quests/events`                   | External event ingestion.                                       | Allowed service principal only.                                                           | [questEventSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questEventSchema.ts)             |
| `POST /quests/catalog/run`              | Manual catalog-linked quest evaluation.                         | Allowed service principal or admin user.                                                  | [catalogRules.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogRules.ts)                           |
| `GET /badges`                           | Admin badge list.                                               | Admin user.                                                                               | [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)                             |
| `POST /badges`                          | Create badge.                                                   | Admin user.                                                                               | [badgeCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/badges/badgeCreationSchema.ts)       |
| `GET /badges/progress`                  | Badge progress for current user, groups, or requested subject.  | User or service; user limited to self or ownership groups.                                | [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)                             |
| `POST /badges/badge-images`             | Upload and process a badge image.                               | Admin user.                                                                               | [imageService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/imageService.ts)                           |
| `GET /badges/badge-images`              | List processed badge images.                                    | User.                                                                                     | [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)                             |
| `GET /badges/{id}`                      | Get badge by id for admin management.                           | Admin user.                                                                               | [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)                             |
| `PATCH /badges/{id}`                    | Update badge.                                                   | Admin user.                                                                               | [badgeEditSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/badges/badgeEditSchema.ts)               |
| `DELETE /badges/{id}`                   | Archive badge.                                                  | Admin user.                                                                               | [BadgesService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/badgesService.ts)                            |
| `GET /reminders`                        | List reminders for current user and ownership groups.           | User.                                                                                     | [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)                         |
| `POST /reminders/{id}/dismiss`          | Dismiss a reminder for the current viewer.                      | User.                                                                                     | [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)                         |
| `POST /reminders/{id}/disable`          | Disable a reminder.                                             | User.                                                                                     | [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)                         |
| `GET /webhooks`                         | Admin webhook list.                                             | Admin user.                                                                               | [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)                           |
| `POST /webhooks`                        | Create webhook.                                                 | Admin user.                                                                               | [webhookCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/webhooks/webhookCreationSchema.ts) |
| `GET /webhooks/events/{event}/metadata` | Event metadata for webhook forms.                               | Admin user.                                                                               | [webhookEventMetadata.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookEventMetadata.ts)           |
| `PATCH /webhooks/{id}`                  | Update webhook.                                                 | Admin user.                                                                               | [webhookEditSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/webhooks/webhookEditSchema.ts)         |
| `DELETE /webhooks/{id}`                 | Delete webhook.                                                 | Admin user.                                                                               | [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)                           |

## Contract Rules

- Routes parse and validate request bodies with Zod schemas before calling services.
- Services enforce business rules that are not just syntactic validation.
- Repositories perform database writes and queries.
- OpenAPI must change with route behavior, request bodies, query params, response shapes, and status codes.
- Generated catalog API output must be synced after OpenAPI changes.
- Non-production `/quests/test/*` helper routes are intentionally excluded from OpenAPI.
- Badge image routes currently exist in the router and should be added to OpenAPI if they remain part of the supported API surface.

## Frontend Calling Pattern

Frontend code should discover the backend URL through Backstage APIs instead of hardcoding `/api/gamification`.

Frontend source:

- [plugins/gamification/src](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src)
- [packages/app/src/apis.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/packages/app/src/apis.ts)
