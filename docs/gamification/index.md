# Gamification

The gamification plugin adds quests, badges, XP, leaderboards, reminders, and webhook delivery to this Backstage instance.

The runtime path is:

```text
frontend page -> /api/gamification route -> service -> repository -> Postgres tables/triggers
```

The backend owns authorization, validation, lifecycle rules, and database consistency. The frontend should call the backend through Backstage discovery and should not duplicate business rules.

## Source Map

| Area                        | Source                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend plugin             | [plugins/gamification/src](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src)                                                         |
| Backend plugin registration | [plugins/gamification-backend/src/plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts)                     |
| Backend router assembly     | [plugins/gamification-backend/src/router.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/router.ts)                     |
| Routes                      | [plugins/gamification-backend/src/routes](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/routes)                           |
| Services                    | [plugins/gamification-backend/src/services](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/services)                       |
| Repositories                | [plugins/gamification-backend/src/repositories](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/repositories)               |
| Validation schemas          | [plugins/gamification-backend/src/schemas](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/schemas)                         |
| Database migrations         | [plugins/gamification-backend/migrations](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/migrations)                           |
| Authoritative OpenAPI       | [plugins/gamification-backend/src/schema/openapi.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schema/openapi.yaml) |

## High Priority Docs

- [Auth and Config](auth-config.md) documents who can call what and which config keys control runtime behavior.
- [Data Model](data-model.md) documents the tables, constraints, triggers, and persisted state.
- [API Contracts](api-contracts.md) maps backend routes to schemas, authorization, and OpenAPI.
- [Lifecycle and Invariants](lifecycle-invariants.md) documents quest, badge, XP, idempotency, webhook, and worker behavior.
- [Delivery History](delivery-history.md) explains why completed GitHub Project work exists and what outcome shipped.

## Workflow Docs

- [Frontend Workflows](frontend-workflows.md) documents user/admin UI flows and discovery-based backend calls.
- [Webhooks](webhooks.md) documents webhook management, scheduling, delivery, and target policy.
- [Reminders](reminders.md) documents reminder creation, visibility, dismissal, disablement, and notifications.
- [Leaderboard](leaderboard.md) documents user/team XP ranking and time windows.
- [Catalog-Linked Quests](catalog-linked-quests.md) documents catalog rules and automated team quest evaluation.

## Maintenance Docs

- [Maintenance Reference](maintenance-reference.md) maps smaller frontend/backend files, test helpers, and local verification commands.
