# Feature Guide

This guide describes the product behavior that exists now. It focuses on why each feature exists and the constraints a contributor needs before changing it.

## Quests And XP

Quests are the primary way gamification turns work into progress. Admins define the quest, audience, target count, completion policy, XP reward, and whether progress is event-driven or catalog-linked.

Delivered behavior:

- Quests target either `user:` subjects or `group:` subjects.
- `ONE_TIME` quests award once after the target count is reached.
- `REPEATABLE` quests can use cooldown days before another completion can award XP.
- Deleting a quest archives it. A quest used by badge criteria can be blocked from deletion because it would invalidate badge definitions.
- User progress is shown through `/quests/me` for the current user plus owned teams.
- External progress enters through service-authenticated quest events, not an unauthenticated public endpoint.

XP is a ledger, not a manually edited total. Quest completions and earned badges write XP award rows, and subject level state is derived from those awards. This is why fixes that touch XP usually need route, service, repository, trigger, and test coverage together.

Related code:

- [Quests page](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/QuestsPage)
- [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [questsService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)
- [xpRepository.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/xpRepository.ts)

## Badges

Badges turn related quest completions into visible achievements. They exist because some accomplishments are better represented as a collection of progress rather than one quest.

Delivered behavior:

- Admins create, edit, archive, search, filter, and paginate badges.
- Badges target either users or teams and their criteria must match that subject type.
- Criteria reference quests and target counts.
- `ONE_TIME` quest criteria are constrained to `target_count: 1`.
- Badge earning is persisted in `badge_criteria_completion` and `earned_badges`.
- Badge XP is awarded when the badge is first earned.
- Badge images can be selected or uploaded, with backend image processing and config-driven limits.

Related code:

- [Badges page](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/BadgesPage)
- [badgesRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/badgesRouter.ts)
- [badgesService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/badgesService.ts)
- [imageService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/imageService.ts)

## Leaderboard

The leaderboard gives users and teams an aggregate ranking based on the XP already awarded by quests and badges. It is not a separate analytics subsystem.

Delivered behavior:

- The ranking supports individual users and teams.
- Time ranges are weekly, monthly, and all time.
- Ties are stable because total XP is ordered before subject ref.
- Weekly and monthly windows use the configured leaderboard timezone.
- Authenticated users and services can read the global aggregate view.
- The frontend fetches backend pages with `limit=100`, then applies local search, sorting, and visible pagination.

The global aggregate boundary is intentional in the current implementation. Do not document it as self-only or owned-team-only unless the backend is changed first.

Related code:

- [Leaderboard page](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/LeaderboardPage)
- [leaderboardRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/leaderboardRouter.ts)
- [leaderboardService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/leaderboardService.ts)

## Webhooks And Progress Summaries

Webhook work started from a need for monthly progress updates, but the shipped design is broader than a Slack-specific report. Admins manage reusable webhook subscriptions, and scheduled progress summaries use the same delivery path as immediate gamification events.

Delivered behavior:

- Webhook trigger families include quest completion, level-up, badge earned, and scheduled daily, weekly, and monthly runs.
- Outbound targets are validated by the same target policy used during delivery.
- Delivery is durable: events are queued, claimed, retried, marked processed, or dead-lettered.
- Scheduled summaries are keyed by webhook, event, and period so a period runs once.
- Monthly payloads summarize the closed reporting window: quests completed, badges earned, XP awarded, top users, and top teams.

Current boundary: progress summaries are webhook payloads. They are not a Slack-only integration and they are not a reporting dashboard.

Related code:

- [Webhooks page](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src/components/WebhooksPage)
- [webhookRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/webhookRouter.ts)
- [domainEventWorker.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/domainEventWorker.ts)
- [scheduledWebhooksService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/scheduledWebhooksService.ts)

## Reminders

Reminders turn stale gamification activity into actionable prompts. They deliberately use gamification history that already exists instead of adding a separate GitHub activity ingestion system.

Delivered behavior:

- Reminder records are scoped to target subjects and have per-viewer dismiss or disable state.
- Activity-based reminder rules currently use `quest_event_receipts`.
- Activity reminders are user-scoped in the current evaluator.
- Repeatable quest reminders respect both cooldown and inactivity windows.
- Duplicate notification protection is the persisted delivery-window ledger.
- Local demos use seed data and a non-production force action.

There is no global singleton worker lease in the shipped reminder implementation. The idempotency boundary is the reminder notification delivery ledger.

Related code:

- [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)
- [reminderEvaluationService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderEvaluationService.ts)
- [reminderNotificationService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderNotificationService.ts)

## Catalog-Linked Quests

Catalog-linked quests connect Backstage catalog quality to team progress. The motivating example was missing TechDocs, but the shipped model supports a broader set of catalog metadata checks.

Delivered behavior:

- Catalog quests are team-scoped and require `quest_mode: catalog`.
- A quest must define `linked_config.catalog_condition` or `linked_config.catalog_rule`.
- Built-in checks include missing TechDocs, owner, description, tags, lifecycle, required annotation, missing relation, and missing dependency metadata.
- The worker evaluates team-owned catalog entities and advances team quest progress.
- Manual runs use `POST /quests/catalog/run`.
- The runner converts catalog evaluation into normal quest events, so existing idempotency, completion policy, and XP rules still apply.

Current boundary: early planning mentioned user and team linked completions, but the implementation that shipped evaluates team-owned catalog entities and progresses team quests.

Related code:

- [catalogRules.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogRules.ts)
- [catalogLinkedQuestWorker.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogLinkedQuestWorker.ts)
- [catalogService.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogService.ts)
