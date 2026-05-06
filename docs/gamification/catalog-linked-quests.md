# Catalog-Linked Quests

Catalog-linked quests evaluate Backstage catalog entities owned by teams and award team quest progress when catalog quality conditions are met.

## Why This Exists

This work connects Backstage catalog quality signals to gamification. The first motivating example was missing TechDocs on team-owned services, but the delivered model supports a broader set of catalog metadata checks.

## Quest Definition

Source:

- [questCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questCreationSchema.ts)
- [QuestsService catalog runner](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)

A catalog-linked quest must be:

- `quest_mode: catalog`
- `subject_type: team`
- configured with `linked_config.catalog_condition` or `linked_config.catalog_rule`

Creation validation rejects catalog quests that do not provide one of those linked config fields.

The current runner is team-scoped. Earlier planning mentioned both user and team linked completions, but the shipped implementation evaluates team-owned catalog entities and progresses team subjects.

## Built-In Conditions

Source:

- [catalogRules.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogRules.ts)

Built-in `catalog_condition` values:

- `missing_techdocs`: entity lacks `backstage.io/techdocs-ref`.
- `missing_owner`: entity lacks `spec.owner`.
- `missing_description`: entity lacks `metadata.description`.
- `missing_tags`: entity lacks non-empty `metadata.tags`.

## Versioned Catalog Rules

`linked_config.catalog_rule` currently supports `version: v1`.

Rule checks:

- `missing_techdocs`
- `missing_owner`
- `missing_description`
- `missing_tags`
- `missing_lifecycle`
- `required_annotation`
- `missing_relation`
- `missing_dependency_metadata`

Versioned rules should be preferred for new rule types because they can carry structured parameters.

## Evaluation Worker

Source:

- [CatalogLinkedQuestWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogLinkedQuestWorker.ts)
- [CatalogService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/catalogService.ts)
- [plugin.ts worker setup](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts)

Worker behavior:

- Runs when `gamification.catalogLinked.enabled` is true.
- Defaults to a 15 minute scan interval.
- Gets own service credentials.
- Fetches catalog `Group` entities.
- Runs catalog-linked quests for each group ref.
- Logs per-team failures and continues with other teams.

The scan interval is configured with `gamification.catalogLinked.scanIntervalMs`.

## Manual Runs

Route:

- `POST /quests/catalog/run`

Source:

- [questsRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)
- [QuestsService.runCatalogLinkedQuestsForTeam](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)

Auth:

- Admin users may run catalog-linked quests.
- Service callers must be listed in `gamification.quests.allowedCallers`.

Body:

- Omit `teamRef` to run all teams.
- Provide `teamRef` to run one team.
- `teamRef` must be a `group:` entity ref.

## Progress Events

The runner converts catalog evaluations into normal quest events:

- Event IDs are deterministic and start with `catalog:`.
- The subject ref is the team ref.
- The caller subject is `internal:catalog-linked-runner`.
- Events flow through the same idempotency and completion-policy path as external quest events.

For missing/required-field rules, progress is awarded when the team has no matching failing entities and no unknown evaluations. For other rules, progress is awarded per matching entity.

Run results include counts for evaluated quests, skipped quests, matched entities, triggered events, duplicate events, blocked events, and unknown evaluation reasons.
