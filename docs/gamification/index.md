# Gamification

The gamification plugin adds quests, badges, XP, leaderboards, reminders, webhook delivery, and catalog quality quests to this Backstage instance.

## Reading Path

- [Feature Guide](feature-guide.md): the user-facing behaviors and the boundaries that shipped.
- [System Design](system-design.md): the backend ownership model, persistence rules, workers, and idempotency guarantees.
- [API and Integrations](api-and-integrations.md): route families, authorization, service callers, OpenAPI, webhooks, and catalog integration.
- [Operations](operations.md): config, TechDocs publishing, local verification, testing, and troubleshooting.
- [Delivery History](delivery-history.md): appendix that maps completed GitHub issues to shipped outcomes.

## Runtime Shape

The runtime path is:

```text
Backstage UI or allowed service
  -> /api/gamification
  -> route validation and auth
  -> service business rules
  -> repository persistence
  -> Postgres constraints and triggers
  -> optional workers and webhooks
```

The backend owns authorization, validation, lifecycle rules, and database consistency. The frontend renders helpful admin and user states, but it is not the authority for access control or business rules.

## Core Concepts

- Quests define progress targets that award XP to either `user:` or `group:` subjects.
- Badges combine quest criteria into visible achievements with their own XP reward.
- XP is recorded as ledger rows. Aggregated level state is derived from that ledger.
- Leaderboards rank users or teams from XP awards across weekly, monthly, or all-time windows.
- Webhooks deliver immediate gamification events and scheduled progress summaries through one outbound delivery model.
- Reminders turn stale gamification activity into user-visible prompts without adding a separate activity ingestion system.
- Catalog-linked quests evaluate team-owned catalog entities and turn quality checks into normal team quest progress.

## Code Anchors

| Area                    | Code                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Frontend plugin         | [plugins/gamification/src](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src)                 |
| Backend startup         | [plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts)              |
| Backend router assembly | [router.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/router.ts)              |
| Routes                  | [routes](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/routes)                    |
| Services                | [services](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/services)                |
| Repositories            | [repositories](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/repositories)        |
| Validation schemas      | [schemas](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/schemas)                  |
| Migrations              | [migrations](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/migrations)                |
| OpenAPI                 | [openapi.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schema/openapi.yaml) |
