# Lifecycle and Invariants

This page documents the behavior that must stay true when changing gamification code.

## Startup

Startup is owned by [plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts).

Order:

1. Initialize the plugin database.
2. Apply migrations.
3. Optionally apply seeds.
4. Build and mount the router.
5. Start enabled workers.

Workers:

- `DomainEventWorker` delivers queued domain events to matching webhooks.
- `ScheduledWebhooksWorker` scans for due daily, weekly, and monthly webhook runs.
- `ReminderEvaluationWorker` evaluates configured inactivity reminder rules when rules exist.
- `CatalogLinkedQuestWorker` scans catalog-linked quests.

## Quest Lifecycle

Implementation:

- [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [QuestsService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)
- [QuestsRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/questsRepository.ts)
- [questCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questCreationSchema.ts)

Rules:

- Quests target either `user` or `team` subjects.
- `ONE_TIME` quests clear cooldown and block progress after the target has been reached.
- `REPEATABLE` quests can use `cooldown_days`; progress is blocked until the cooldown window ends after the last XP award.
- `event_driven` quests progress through `/quests/events`.
- `catalog` quests require `linked_config.catalog_condition` or `linked_config.catalog_rule`.
- User quests require `user:` subject refs.
- Team quests require `group:` subject refs.
- Deleting a quest archives it; a quest used by badge criteria cannot be deleted.

## Quest Events and Idempotency

Implementation:

- [questEventSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questEventSchema.ts)
- [QuestsService.handleQuestEvent](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)
- [quest_event_receipts migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/007_create_quest_event_receipts_table.ts)
- [event receipt rekey migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/025_rekey_quest_event_receipts_idempotency.ts)

Rules:

- Event ingestion is service-only.
- `eventId` is required and participates in idempotency.
- A duplicate event returns a duplicate result instead of incrementing progress again.
- Events must resolve to a valid subject either directly through `subjectRef` or through actor resolution.
- Actor resolution defaults include GitHub annotation lookups and can be extended through config.

## Badge Lifecycle

Implementation:

- [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)
- [BadgesService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/badgesService.ts)
- [BadgesRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/badgesRepository.ts)
- [badgeCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/badges/badgeCreationSchema.ts)

Rules:

- Badges target either `user` or `team` subjects.
- Badges require at least one criterion.
- A quest can appear only once in a badge's criteria.
- Criteria quests must exist and match the badge subject type.
- Criteria that reference `ONE_TIME` quests must use `target_count: 1`.
- Deleting a badge archives it.
- Badge images are processed by the backend and limited by config.

## XP Lifecycle

Implementation:

- [xpRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/xpRouter.ts)
- [XpService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/xpService.ts)
- [XpRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/xpRepository.ts)
- [quest triggers](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/011_create_quest_triggers.ts)
- [badge triggers](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/012_create_badge_triggers.ts)
- [subject XP state](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/019_create_subject_xp_state_table.ts)

Rules:

- XP awards are ledger rows in `xp_awards`.
- Quest XP is awarded by trigger when completion count reaches the quest target.
- Badge XP is awarded by trigger when a badge is first earned.
- XP award uniqueness prevents repeated awards for the same quest completion count or badge.
- `subject_xp_state` is derived from `xp_awards`; do not treat it as the source of truth.
- Level windows are computed in the database from total XP.

## Webhook Delivery

Implementation:

- [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)
- [WebhookService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookService.ts)
- [DomainEventWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/domainEventWorker.ts)
- [Webhook target policy](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookTargetPolicy.ts)
- [domain_events migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/018_create_domain_events_table.ts)

Rules:

- Webhooks are admin-managed.
- Target reachability can return a `409` warning that the UI may override when allowed.
- Outbound delivery follows the configured target policy: allowed hosts, HTTP allowance, private target allowance, and timeout.
- Domain events are claimed in batches and retried.
- Events can be reclaimed after claim TTL.
- Events are marked processed on success and dead-lettered after max attempts.
- LISTEN/NOTIFY is the fast path; polling is the recovery path.

## Scheduled Webhooks

Implementation:

- [ScheduledWebhooksService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhooksService.ts)
- [ScheduledWebhooksWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhooksWorker.ts)
- [scheduledWebhookPeriod.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhookPeriod.ts)
- [events_ran migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/018_create_events_ran_table_and_add_scheduled_webhook_events.ts)

Rules:

- Supported scheduled events are `daily`, `weekly`, and `monthly`.
- Period boundaries use the configured IANA timezone.
- `events_ran` is the idempotency ledger.
- A scheduled webhook and period should only be executed once.

## Monthly Period Contract

Implementation:

- [monthlyProgressPeriod.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/monthlyProgressPeriod.ts)
- [monthlyProgressPeriod.test.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/__tests__/monthlyProgressPeriod.test.ts)

Rules:

- Default execution targets the previous fully completed calendar month.
- Month boundaries are evaluated in the selected IANA timezone.
- `Europe/Stockholm` is the default timezone.
- Manual reruns of an explicit `YYYY-MM` month must resolve to the same period every time.
- The stable rerun key is `monthly-progress:<timeZone>:<YYYY-MM>`.

## Change Checklist

When changing high-priority behavior:

- Update route, service, repository, schema, migration, OpenAPI, and tests together.
- Keep database constraints and Zod validation consistent.
- Keep backend authorization as the source of truth.
- Preserve idempotency for external events, scheduled runs, notifications, and webhook delivery.
- Run targeted tests for the changed behavior.
- Run `yarn gamification:verify` before finishing.
