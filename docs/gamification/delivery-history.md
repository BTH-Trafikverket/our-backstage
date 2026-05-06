# Delivery History

This appendix maps completed GitHub Project work to the product and engineering outcomes now present in the gamification plugin. It is intentionally outcome-oriented: when an issue checklist and the final implementation differ, this page describes the implementation that actually exists now.

Use this page for traceability after reading the main docs. It is not the primary guide for understanding or changing the system.

Reviewed source: [Project planning board](https://github.com/orgs/BTH-Trafikverket/projects/1), status `Done`, for [BTH-Trafikverket/our-backstage](https://github.com/BTH-Trafikverket/our-backstage).

## Foundation

The project started by setting up the Backstage repo, defining the first architecture shape, and adding the quality gates needed to keep later plugin work stable.

Delivered outcome:

- Backstage app and plugin workspace with TechDocs, repo tooling, formatting, linting, and local development flow.
- English naming and gamification plugin naming cleanup.
- OpenAPI generation and catalog API publishing for the gamification backend.
- Local-first Playwright and verification workflow for gamification changes.
- Git templates and development workflow support.

Completed issues: [#38](https://github.com/BTH-Trafikverket/our-backstage/issues/38), [#39](https://github.com/BTH-Trafikverket/our-backstage/issues/39), [#40](https://github.com/BTH-Trafikverket/our-backstage/issues/40), [#41](https://github.com/BTH-Trafikverket/our-backstage/issues/41), [#42](https://github.com/BTH-Trafikverket/our-backstage/issues/42), [#68](https://github.com/BTH-Trafikverket/our-backstage/issues/68), [#91](https://github.com/BTH-Trafikverket/our-backstage/issues/91), [#98](https://github.com/BTH-Trafikverket/our-backstage/issues/98), [#100](https://github.com/BTH-Trafikverket/our-backstage/issues/100), [#103](https://github.com/BTH-Trafikverket/our-backstage/issues/103), [#104](https://github.com/BTH-Trafikverket/our-backstage/issues/104), [#155](https://github.com/BTH-Trafikverket/our-backstage/issues/155), [#156](https://github.com/BTH-Trafikverket/our-backstage/issues/156), [#157](https://github.com/BTH-Trafikverket/our-backstage/issues/157), [#158](https://github.com/BTH-Trafikverket/our-backstage/issues/158), [#160](https://github.com/BTH-Trafikverket/our-backstage/issues/160), [#161](https://github.com/BTH-Trafikverket/our-backstage/issues/161), [#163](https://github.com/BTH-Trafikverket/our-backstage/issues/163).

## XP And Subject Progress

XP was introduced to make quest and badge activity visible as progress for both individuals and teams.

Delivered outcome:

- XP is awarded to a generic Backstage subject ref, so both `user:` and `group:` subjects can earn XP.
- XP awards are ledger rows, and level state is derived from those awards.
- Quest progress and XP awarding are persisted in Postgres rather than kept as frontend-only state.
- Entity cards expose XP and badge progress on catalog pages.

Current boundaries:

- Subject privacy still depends on route-level authorization. User callers are scoped to self and ownership groups; service callers are currently broader on some read routes until the open service-principal restriction work is completed.

Completed issues: [#45](https://github.com/BTH-Trafikverket/our-backstage/issues/45), [#46](https://github.com/BTH-Trafikverket/our-backstage/issues/46), [#52](https://github.com/BTH-Trafikverket/our-backstage/issues/52), [#53](https://github.com/BTH-Trafikverket/our-backstage/issues/53), [#54](https://github.com/BTH-Trafikverket/our-backstage/issues/54), [#58](https://github.com/BTH-Trafikverket/our-backstage/issues/58), [#59](https://github.com/BTH-Trafikverket/our-backstage/issues/59), [#60](https://github.com/BTH-Trafikverket/our-backstage/issues/60), [#61](https://github.com/BTH-Trafikverket/our-backstage/issues/61), [#62](https://github.com/BTH-Trafikverket/our-backstage/issues/62), [#117](https://github.com/BTH-Trafikverket/our-backstage/issues/117).

## Quest Management And Event Ingestion

Quest management exists so admins can define work that earns XP, and event ingestion exists so external systems can safely advance progress.

Delivered outcome:

- Admin quest create, edit, archive, list, search, filter, sort, and pagination flows.
- User quest progress view across the authenticated user and owned teams.
- Team-scoped quests using `group:` subject refs.
- Completion policies for one-time and repeatable quests, including cooldown enforcement.
- Service-authenticated quest event ingestion with allowed callers.
- Actor-to-user resolution for user quest events.
- Idempotency keyed to the logical completion boundary, so one external event can validly advance multiple quests or subjects while exact replay remains suppressed.

Current boundaries:

- The old generic "public post endpoint" idea became a service-auth route, not an unauthenticated public endpoint.
- Quest deletion is archive-oriented; badge criteria can block quest deletion where deleting would invalidate badge definitions.

Completed issues: [#47](https://github.com/BTH-Trafikverket/our-backstage/issues/47), [#63](https://github.com/BTH-Trafikverket/our-backstage/issues/63), [#64](https://github.com/BTH-Trafikverket/our-backstage/issues/64), [#65](https://github.com/BTH-Trafikverket/our-backstage/issues/65), [#66](https://github.com/BTH-Trafikverket/our-backstage/issues/66), [#67](https://github.com/BTH-Trafikverket/our-backstage/issues/67), [#69](https://github.com/BTH-Trafikverket/our-backstage/issues/69), [#70](https://github.com/BTH-Trafikverket/our-backstage/issues/70), [#72](https://github.com/BTH-Trafikverket/our-backstage/issues/72), [#89](https://github.com/BTH-Trafikverket/our-backstage/issues/89), [#92](https://github.com/BTH-Trafikverket/our-backstage/issues/92), [#93](https://github.com/BTH-Trafikverket/our-backstage/issues/93), [#94](https://github.com/BTH-Trafikverket/our-backstage/issues/94), [#95](https://github.com/BTH-Trafikverket/our-backstage/issues/95), [#140](https://github.com/BTH-Trafikverket/our-backstage/issues/140), [#224](https://github.com/BTH-Trafikverket/our-backstage/issues/224).

## Badges

Badges were added to turn groups of quest completions into visible achievements with their own XP reward.

Delivered outcome:

- Admin badge create, edit, archive, list, search, filter, sort, and pagination flows.
- Badge criteria that require completing selected quests a configured number of times.
- Badge runtime state persisted as `badge_criteria_completion` and `earned_badges`.
- Badge XP awards are written when a badge is earned.
- Badges support both user and team subjects.
- Badge detail and progress views show requirements and current progress.
- Badge images can be selected or uploaded, with a default icon when no custom image is chosen.

Current boundaries:

- Badge earning is trigger-backed persisted state, not a live recomputation from quest progress on every read.
- Badge archive is the lifecycle model; docs should not describe badge delete as a physical delete.

Completed issues: [#48](https://github.com/BTH-Trafikverket/our-backstage/issues/48), [#49](https://github.com/BTH-Trafikverket/our-backstage/issues/49), [#73](https://github.com/BTH-Trafikverket/our-backstage/issues/73), [#74](https://github.com/BTH-Trafikverket/our-backstage/issues/74), [#75](https://github.com/BTH-Trafikverket/our-backstage/issues/75), [#76](https://github.com/BTH-Trafikverket/our-backstage/issues/76), [#78](https://github.com/BTH-Trafikverket/our-backstage/issues/78), [#79](https://github.com/BTH-Trafikverket/our-backstage/issues/79), [#80](https://github.com/BTH-Trafikverket/our-backstage/issues/80), [#90](https://github.com/BTH-Trafikverket/our-backstage/issues/90), [#123](https://github.com/BTH-Trafikverket/our-backstage/issues/123), [#148](https://github.com/BTH-Trafikverket/our-backstage/issues/148), [#154](https://github.com/BTH-Trafikverket/our-backstage/issues/154), [#164](https://github.com/BTH-Trafikverket/our-backstage/issues/164).

## Leaderboard

The leaderboard was added so users and teams can compare XP progress without introducing a separate reporting system.

Delivered outcome:

- Separate individual and team rankings.
- Rankings are based on existing XP awards.
- Tie-breaker is deterministic by subject ref after total XP.
- Weekly, monthly, and all-time windows.
- Frontend search, sort, loading, empty, error, and pagination states.
- Frontend fetches all backend pages before local search and pagination so filtering does not produce empty pages from already-paginated backend data.

Current boundaries:

- The leaderboard is a global aggregate view for authenticated callers, not a private self-only view.

Completed issues: [#44](https://github.com/BTH-Trafikverket/our-backstage/issues/44), [#55](https://github.com/BTH-Trafikverket/our-backstage/issues/55), [#56](https://github.com/BTH-Trafikverket/our-backstage/issues/56), [#57](https://github.com/BTH-Trafikverket/our-backstage/issues/57), [#152](https://github.com/BTH-Trafikverket/our-backstage/issues/152), [#183](https://github.com/BTH-Trafikverket/our-backstage/issues/183).

## Webhooks And Progress Digests

Webhook work replaced a narrow Slack-style idea with a reusable outbound delivery interface for gamification events and scheduled progress summaries.

Delivered outcome:

- Admin-managed webhook subscriptions.
- Trigger events for quest completion, level-up, badge earned, and scheduled daily, weekly, and monthly runs.
- Durable domain-event queue with retry, claim TTL, processed state, and dead-letter state.
- Scheduled run ledger so each webhook period is executed once.
- Monthly progress payloads derived from XP awards, quest completion events, badge earned events, and top user/team rankings.
- Badge-earned events reuse the same webhook delivery path.
- Webhook create/edit validates targets with the same policy used by delivery.

Current boundaries:

- Scheduled digest delivery is webhook-based, not Slack-specific.
- Scheduled payloads are summary payloads for the closed reporting window, not a separate reporting dashboard.

Completed issues: [#50](https://github.com/BTH-Trafikverket/our-backstage/issues/50), [#81](https://github.com/BTH-Trafikverket/our-backstage/issues/81), [#82](https://github.com/BTH-Trafikverket/our-backstage/issues/82), [#83](https://github.com/BTH-Trafikverket/our-backstage/issues/83), [#84](https://github.com/BTH-Trafikverket/our-backstage/issues/84), [#85](https://github.com/BTH-Trafikverket/our-backstage/issues/85), [#151](https://github.com/BTH-Trafikverket/our-backstage/issues/151), [#170](https://github.com/BTH-Trafikverket/our-backstage/issues/170), [#180](https://github.com/BTH-Trafikverket/our-backstage/issues/180), [#230](https://github.com/BTH-Trafikverket/our-backstage/issues/230).

## Reminders

Reminder work was added to turn inactivity in gamification history into actionable prompts without adding a separate GitHub activity ingestion system.

Delivered outcome:

- Reminder storage with target subject scope and per-viewer state.
- Activity-based reminder evaluation from `quest_event_receipts`.
- Scheduled reminder evaluation worker.
- Reminder notification delivery reservation so repeated evaluations do not repeatedly notify for the same reminder window.
- Cooldown-aware reminder eligibility.
- Development seed data and a non-production force-reminder action for demos and local testing.

Current boundaries:

- Activity-rule evaluation currently supports user-scoped quests. Team reminder behavior is only safe where the current service explicitly allows viewer access to ownership groups.
- The duplicate-notification fix is implemented through a persisted notification delivery ledger. There is not a global DB-backed singleton lease for the reminder worker in the current implementation.

Completed issues: [#193](https://github.com/BTH-Trafikverket/our-backstage/issues/193), [#194](https://github.com/BTH-Trafikverket/our-backstage/issues/194), [#198](https://github.com/BTH-Trafikverket/our-backstage/issues/198), [#200](https://github.com/BTH-Trafikverket/our-backstage/issues/200), [#201](https://github.com/BTH-Trafikverket/our-backstage/issues/201), [#216](https://github.com/BTH-Trafikverket/our-backstage/issues/216), [#217](https://github.com/BTH-Trafikverket/our-backstage/issues/217), [#223](https://github.com/BTH-Trafikverket/our-backstage/issues/223).

## Catalog-Linked Quests

Catalog-linked quests were added to connect team-owned catalog quality signals, starting with TechDocs coverage, to gamification progress.

Delivered outcome:

- Catalog evaluator for team-owned entities.
- Missing TechDocs, ownership, description, tags, lifecycle, annotation, relation, and dependency metadata checks.
- Backend quest contract for linked config.
- Admin UI for event-driven versus catalog quests.
- Automatic runner that converts catalog evaluation results into normal quest events, so existing completion policy and XP behavior still apply.
- Scheduled worker and manual run endpoint for catalog-linked checks.

Current boundaries:

- Although early runner scope mentioned both user and team subjects, the current shipped runner evaluates team-owned catalog entities and progresses team-scoped quests.
- Catalog evaluations distinguish passing, not passing, and unknown results so transient or missing catalog data does not silently complete a quest.

Completed issues: [#195](https://github.com/BTH-Trafikverket/our-backstage/issues/195), [#196](https://github.com/BTH-Trafikverket/our-backstage/issues/196), [#202](https://github.com/BTH-Trafikverket/our-backstage/issues/202), [#203](https://github.com/BTH-Trafikverket/our-backstage/issues/203), [#204](https://github.com/BTH-Trafikverket/our-backstage/issues/204), [#205](https://github.com/BTH-Trafikverket/our-backstage/issues/205).

## Authorization And Cleanup

Several completed items were not new features, but they changed the shape of the implementation enough that docs should reflect them.

Delivered outcome:

- Backend authorization added to management routes.
- Hardcoded frontend backend URLs removed in favor of discovery.
- Config schema drift fixed.
- `target_count` terminology replaced older interval wording.
- Subject-ref bugs fixed so team/user references stay consistent.

Completed issues: [#99](https://github.com/BTH-Trafikverket/our-backstage/issues/99), [#102](https://github.com/BTH-Trafikverket/our-backstage/issues/102), [#103](https://github.com/BTH-Trafikverket/our-backstage/issues/103), [#117](https://github.com/BTH-Trafikverket/our-backstage/issues/117).
