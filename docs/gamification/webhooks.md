# Webhooks

Webhooks let admins deliver gamification events to external targets. The system has two delivery paths:

- Domain events created by quest and badge runtime triggers.
- Scheduled daily, weekly, and monthly webhook events.

## Why This Exists

The project originally needed monthly progress updates, but the implementation deliberately avoided a Slack-specific integration. The delivered shape is a reusable webhook interface that can send scheduled progress summaries and immediate gamification events through the same delivery path.

## Admin UI

Source:

- [WebhooksPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/WebhooksPage/WebhooksPage.tsx)
- [WebhookFormDialog.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/WebhooksPage/WebhookFormDialog.tsx)
- [WebhookTable.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/WebhooksPage/WebhookTable.tsx)
- [WebhookReachabilityDialog.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/WebhooksPage/WebhookReachabilityDialog.tsx)

The UI supports:

- Paginated webhook listing.
- Create, edit, delete, and detail viewing.
- Event metadata preview when creating a webhook.
- JSON payload highlighting.
- Reachability warning override when the backend returns a `409` warning with `canOverride: true`.

The Webhooks tab is only visible for admins, but backend admin authorization is still the source of truth.

## Backend Management

Source:

- [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)
- [WebhookService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookService.ts)
- [WebhookRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/webhookRepository.ts)
- [webhookCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/webhooks/webhookCreationSchema.ts)
- [webhookEditSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/webhooks/webhookEditSchema.ts)

Management routes are admin-only:

- `GET /webhooks`
- `POST /webhooks`
- `GET /webhooks/events/{event}/metadata`
- `PATCH /webhooks/{id}`
- `DELETE /webhooks/{id}`

Supported trigger events are stored in `webhook_trigger_events`.

Current event families:

- `quest.completed`
- `user.leveled_up`
- `badge.earned`
- `daily`
- `weekly`
- `monthly`

## Delivery Queue

Source:

- [DomainEventWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/domainEventWorker.ts)
- [DomainEventsRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/domainEventsRepository.ts)
- [domain_events migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/018_create_domain_events_table.ts)

Delivery behavior:

- Domain events are persisted before delivery.
- A worker claims pending events in batches.
- Claimed events can be reclaimed after `claimTtlMs`.
- Successful deliveries mark events as processed.
- Failed deliveries increment attempts and are retried.
- Events are dead-lettered after `maxAttempts`.
- LISTEN/NOTIFY wakes the worker quickly; polling remains the recovery path.

## Target Policy

Source:

- [webhookTargetPolicy.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookTargetPolicy.ts)
- [config.d.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/config.d.ts)

Config controls:

- `gamification.webhooks.delivery.allowedHosts`
- `gamification.webhooks.delivery.allowHttp`
- `gamification.webhooks.delivery.allowPrivateTargets`
- `gamification.webhooks.delivery.requestTimeoutMs`

Default policy is restrictive: plain HTTP and private literal IP targets are disabled unless explicitly allowed.

## Scheduled Webhooks

Source:

- [ScheduledWebhooksService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhooksService.ts)
- [ScheduledWebhooksWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhooksWorker.ts)
- [scheduledWebhookPeriod.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhookPeriod.ts)
- [ScheduledWebhookSummaryRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/scheduledWebhookSummaryRepository.ts)
- [events_ran migration](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/018_create_events_ran_table_and_add_scheduled_webhook_events.ts)

Scheduled events:

- `daily`
- `weekly`
- `monthly`

For each scheduled webhook, the worker resolves the current period in `gamification.webhooks.timeZone`, locks the webhook/period, checks `events_ran`, records the run, and enqueues one domain event with a summary payload.

The subject ref for scheduled webhook domain events is `system:default/gamification-scheduler`.

The scheduled summary payload is based on the closed reporting window and includes:

- quests completed
- badges earned
- XP awarded
- top users
- top teams

This is the current implementation of monthly progress updates. It is not a separate reporting dashboard, and it is not tied to Slack.
