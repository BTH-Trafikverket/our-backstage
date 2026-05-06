# System Design

Gamification is backend-owned by design. The frontend provides the experience, but the backend decides authorization, validates contracts, applies business rules, and persists state.

## Ownership Boundaries

| Layer           | Responsibility                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend plugin | Renders admin and user workflows, uses Backstage discovery, and avoids duplicating backend business rules.              |
| Routes          | Authenticate callers, enforce route-level authorization, parse input, and return HTTP status codes.                     |
| Services        | Enforce lifecycle rules, actor resolution, catalog evaluation, workers, target policy, and cross-repository operations. |
| Repositories    | Own SQL queries and mutations.                                                                                          |
| Database        | Own constraints, trigger-maintained runtime state, ledgers, and idempotency keys.                                       |

Key code anchors:

- [Frontend plugin](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src)
- [Backend router assembly](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/router.ts)
- [Routes](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/routes)
- [Services](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/services)
- [Repositories](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/src/repositories)
- [Migrations](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification-backend/migrations)

## Persistence Model

The database schema is part of the product contract. It stores definition state, runtime state, and delivery ledgers:

- Quest definitions and per-subject quest progress.
- Badge definitions, criteria completion, and earned badge records.
- XP awards and derived subject XP state.
- Badge image records.
- Webhook subscriptions and durable domain events.
- Scheduled webhook run ledger.
- Quest reminders, viewer reminder state, and reminder notification deliveries.

Important constraints:

- Quest and badge subject types are either `user` or `team`.
- Quest progress is keyed by subject and quest.
- XP awards represent either a quest award or a badge award, never both.
- Quest XP awards are unique by subject, quest, and completion count.
- Badge XP awards are unique by subject and badge.
- Badge criteria must reference quests with the same subject type as the badge.
- Scheduled webhook runs are unique by webhook, event name, and period.
- Domain events are unique by event name, source table, and source id.

Related code:

- [database.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/database.ts)
- [003_create_quests_table.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/003_create_quests_table.ts)
- [004_create_badges_table.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/004_create_badges_table.ts)
- [006_create_xp_awards_table.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/006_create_xp_awards_table.ts)

## Trigger-Owned State

Several important outcomes are maintained by database triggers rather than ad hoc application updates:

- Quest XP awards are created when quest progress reaches the configured target boundary.
- Badge criteria completion follows quest progress.
- Earned badges are inserted when all badge criteria are complete.
- Badge XP awards are created when a badge is first earned.
- Subject XP state is refreshed from XP awards.
- Domain events are enqueued from XP and badge runtime changes.
- Shared timestamp triggers keep update columns current.

Treat these as system invariants. If a change touches the runtime meaning of XP, quest completion, badges, or webhook events, check both TypeScript behavior and migration-trigger behavior.

Related code:

- [010_create_shared_trigger_functions.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/010_create_shared_trigger_functions.ts)
- [011_create_quest_triggers.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/011_create_quest_triggers.ts)
- [012_create_badge_triggers.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/012_create_badge_triggers.ts)
- [019_enqueue_domain_events.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/019_enqueue_domain_events.ts)

## Idempotency Boundaries

Idempotency exists at the point where duplicate input would otherwise create duplicate product outcomes:

| Boundary                  | Ledger or key                                                               |
| ------------------------- | --------------------------------------------------------------------------- |
| External quest events     | `quest_event_receipts` keyed to the logical event completion boundary.      |
| Quest XP                  | `xp_awards` uniqueness by subject, quest, and completion count.             |
| Badge XP                  | `xp_awards` uniqueness by subject and badge.                                |
| Domain events             | Unique event name, source table, and source id.                             |
| Scheduled webhooks        | `events_ran` keyed by webhook, event, and period.                           |
| Reminder notifications    | `quest_reminder_notification_deliveries` keyed by reminder delivery window. |
| Catalog-linked quest runs | Deterministic `catalog:` event ids through the normal quest event path.     |

The reminder worker does not currently use a global singleton lease. Duplicate notification prevention is handled by the persisted delivery-window ledger.

Related code:

- [007_create_quest_event_receipts_table.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/007_create_quest_event_receipts_table.ts)
- [025_rekey_quest_event_receipts_idempotency.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/025_rekey_quest_event_receipts_idempotency.ts)
- [018_create_domain_events_table.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/018_create_domain_events_table.ts)
- [025_create_quest_reminder_notification_deliveries.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/025_create_quest_reminder_notification_deliveries.ts)

## Startup And Workers

Startup is owned by [plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts). The backend initializes the plugin database, applies migrations, optionally applies seeds, builds the router, and starts enabled workers.

Workers:

- `DomainEventWorker` delivers queued domain events to matching webhooks.
- `ScheduledWebhooksWorker` scans for due scheduled webhook periods.
- `ReminderEvaluationWorker` evaluates configured inactivity reminder rules.
- `CatalogLinkedQuestWorker` evaluates team-owned catalog entities for catalog-linked quests.

Each worker can be affected by config. See [Operations](operations.md) before changing startup behavior or local development defaults.

## Safe Change Checklist

When changing gamification behavior:

- Keep route authorization, service rules, repository queries, Zod schemas, migrations, OpenAPI, frontend callers, and tests aligned.
- Keep backend authorization as the source of truth.
- Preserve the ledger or uniqueness boundary for external events, scheduled runs, webhook delivery, reminders, badge awards, and quest XP awards.
- Prefer database-backed tests when changing migrations, constraints, triggers, or persistent runtime state.
- Run targeted tests for the changed area and then `yarn gamification:verify`.
