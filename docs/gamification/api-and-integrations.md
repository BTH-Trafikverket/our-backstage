# API And Integrations

All gamification routes are mounted under `/api/gamification`. Route behavior is part of the public plugin contract, so OpenAPI, frontend callers, backend validation, and tests need to move together.

## OpenAPI Contract

The authoritative contract is [plugins/gamification-backend/src/schema/openapi.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schema/openapi.yaml).

The catalog API entity is generated at [catalog/apis/gamification-api.yaml](https://github.com/BTH-Trafikverket/our-backstage/blob/main/catalog/apis/gamification-api.yaml).

Run this after OpenAPI changes:

```bash
yarn gamification:openapi:sync
```

`yarn gamification:verify` fails if the generated catalog API file is out of sync.

Current contract gap: badge image routes exist in the router. If they remain a supported API surface, add them to OpenAPI instead of documenting them only in route code.

## Authorization Matrix

| Caller                    | Route families                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin user                | Quest management, badge management, badge image upload, webhook management, webhook metadata, manual catalog-linked runs, non-production quest test helpers. |
| Allowed service principal | `POST /quests/events` and `POST /quests/catalog/run`.                                                                                                        |
| Authenticated user        | `/quests/me`, `/reminders`, self or owned-team `/xp`, self or owned-team `/badges/progress`.                                                                 |
| User or service           | `/leaderboard` aggregate rankings. Some service reads are broader until open service-principal restriction work is finished.                                 |

Admin access comes from `gamification.admin.groups`. Service event ingestion comes from `gamification.quests.allowedCallers`. The frontend can show or hide admin tabs, but the backend remains the authority.

Related code:

- [adminAccess.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/adminAccess.ts)
- [config.d.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/config.d.ts)
- [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)
- [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)

## Frontend Calling Pattern

Frontend code must use Backstage discovery and fetch APIs:

```ts
const baseUrl = await discoveryApi.getBaseUrl('gamification');
const response = await fetchApi.fetch(`${baseUrl}/quests/me`);
```

Do not hardcode `/api/gamification` in new frontend code. The repo has already fixed earlier hardcoded backend URL paths, and new code should keep that boundary.

Related code:

- [packages/app/src/apis.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/packages/app/src/apis.ts)
- [QuestsPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/QuestsPage)
- [BadgesPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/BadgesPage)
- [LeaderboardPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/LeaderboardPage)
- [WebhooksPage](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/WebhooksPage)

## Quest Event Ingestion

`POST /quests/events` is the integration point for external systems that advance quest progress.

Contract boundaries:

- The caller must be an allowed service principal.
- Events must include `eventId`, `questId`, and either `subjectRef` or actor data that can resolve to a subject.
- User quest events can resolve actor data through configured provider annotation lookups.
- Team quest events require a `group:` subject ref.
- Duplicate events return a duplicate result instead of awarding progress again.

The route is intentionally service-authenticated. It should not be described or exposed as a public unauthenticated posting endpoint.

Related code:

- [questEventSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questEventSchema.ts)
- [questsService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)

## Webhook Events

Admin-managed webhooks support immediate and scheduled event families:

- `quest.completed`
- `user.leveled_up`
- `badge.earned`
- `daily`
- `weekly`
- `monthly`

Outbound target policy is config-driven. By default the backend is restrictive: plain HTTP and private literal IP targets are disabled unless explicitly allowed. The UI can surface a reachability warning when the backend returns an overridable `409`, but the backend policy is still the authority.

Scheduled webhook payloads summarize a closed reporting window and are sent through the same domain-event delivery path as immediate events.

Related code:

- [webhookTargetPolicy.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookTargetPolicy.ts)
- [webhookEventMetadata.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/webhookEventMetadata.ts)
- [scheduledWebhookPeriod.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhookPeriod.ts)
- [monthlyProgressPeriod.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/monthlyProgressPeriod.ts)

## Catalog-Linked Runs

`POST /quests/catalog/run` evaluates catalog-linked quests manually. It accepts admin users or allowed service principals.

Contract boundaries:

- Omitting `teamRef` runs all teams.
- Providing `teamRef` runs one team and it must be a `group:` entity ref.
- The worker and the manual route both progress quests through deterministic normal quest events.
- Results include evaluated quests, skipped quests, matching entities, triggered events, duplicate events, blocked events, and unknown evaluation reasons.

Related code:

- [catalogRules.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogRules.ts)
- [catalogLinkedQuestWorker.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogLinkedQuestWorker.ts)
