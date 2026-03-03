## Overview: What this backend plugin is and how it works
This is a **Backstage backend plugin** (the package has `backstage.role: "backend-plugin"` and `pluginId: "backstage-backend-gamification"`). It is mounted under the Backstage API, for example:

- `/api/backstage-backend-gamification`

It exposes endpoints for:
- **Quests** (create/update/delete/list + “my quests”)
- **XP/Level** (user XP status)
- **Events** (external systems can trigger quest progress via POST)

The backend follows a consistent flow:

**HTTP request → Route → Service → Repository → Postgres (tables + triggers)**

Routes validate/authenticate requests, services contain business logic, repositories perform DB queries, and Postgres triggers handle some key logic automatically.

---

## Key files and where things happen
Important parts of the codebase:

- `src/plugin.ts`  
  Registers the plugin, initializes DB, runs migrations and optional seeds, and mounts the router.

- `src/router.ts`  
  Wires everything together (creates repositories/services and attaches routes).

- `src/routes/questsRouter.ts`  
  Quest endpoints + the external event endpoint.

- `src/routes/xpRouter.ts`  
  XP/level endpoint.

- `src/services/questsService.ts`  
  Quest business logic + external event handling.

- `src/services/xpService.ts`  
  Computes level/progress from total XP.

- `src/repositories/*.ts`  
  Pure DB access via Knex.

- `migrations/*.ts`  
  Creates tables and **Postgres triggers** (core system behavior).

- `seeds/*.ts`  
  Demo data (only run if enabled via config).

- `src/__tests__/*.test.ts`  
  Tests demonstrating expected behavior.

---

## Startup behavior (what happens when the backend boots)
In `src/plugin.ts` the plugin:
1. Gets a **database client** from Backstage core `database`.
2. Runs **Knex migrations** (`knex.migrate.latest()`), creating tables and triggers.
3. Optionally runs **seeds** if enabled (e.g. `gamification.seed.enabled`, `gamification.seed.reset`).
4. Mounts the router, making the endpoints available.

---

## Database model: tables and relationships
There are five core tables:

### `quests`
Quest definition:
- `id (uuid)`
- `title` (unique)
- `description`
- `interval` (>= 1) → XP is awarded every N completions
- `xp_reward` (> 0)
- timestamps

### `quest_progress`
One row per (user, quest) tracking progress:
- `user_ref` (e.g. `user:default/alice`)
- `quest_id` (FK → `quests.id`)
- `completion_count` (>= 0)
- **primary key:** (`user_ref`, `quest_id`)

### `xp_ledger`
Append-only XP accounting:
- `user_ref`
- `quest_id` (FK)
- `awarded_on_completion_count`
- `xp_amount`
- `source`
- **unique constraint:** (`user_ref`, `quest_id`, `awarded_on_completion_count`)  
  Prevents awarding XP twice for the same milestone.

### `quest_event_triggers`
Maps an external event type to a quest:
- `event_key` (e.g. `github.pull_request.merged`)
- `quest_id`
- `increment_by`
- `enabled`
- **unique:** (`event_key`, `quest_id`)

### `quest_event_receipts`
Deduplication receipts for incoming events:
- `event_id` (PRIMARY KEY)
- `event_key`, `user_ref`, `caller_subject`, `received_at`

---

## Core behavior: XP is awarded by a Postgres trigger
A Postgres trigger function is created in the migrations and runs:

**AFTER INSERT/UPDATE of `completion_count` on `quest_progress`**

Logic (high level):
- If completion did not increase → do nothing
- Fetch `interval` and `xp_reward` from `quests`
- If `completion_count % interval == 0` → insert a row into `xp_ledger`
- If the row already exists → ignore (unique constraint + `ON CONFLICT DO NOTHING`)

**Result:** TypeScript code mainly increments `completion_count`. XP awarding happens automatically in the database.

---

## Endpoints: what they do

### Quests
- `POST /quests`  
  Creates a quest (validated via Zod), inserts into `quests`.

- `PATCH /quests/:id`  
  Updates a quest.

- `DELETE /quests/:id`  
  Deletes a quest (FK/CASCADE behavior depends on constraints).

- `GET /quests`  
  Lists all quests.

- `GET /quests/me`  
  Requires user credentials. Uses the logged-in user’s `userRef`, joins with `quest_progress`, and returns quests + completion count + “next milestone” info.

### External events (triggers from other systems)
- `POST /quests/events` ✅  
  Allows external systems (e.g. GitHub/CI/IdP) to trigger quest progress.

Flow:
1. Requires **service credentials** (not regular user credentials).
2. Checks an allowlist in config (`gamification.quests.allowedCallers`). If caller is not allowed → responds with NotFound.
3. Validates request body via Zod (`eventKey`, `eventId`, `actor`).
4. Resolves `actor` to a Backstage user:
   - If `actor.entityRef` is provided → use it directly
   - Otherwise (e.g. GitHub actor) → query Backstage Catalog via `@backstage/catalog-client` using annotations (e.g. GitHub user-id/login) and build `user_ref`
5. Looks up a trigger in `quest_event_triggers` for the given `eventKey`.
6. Dedupes using `quest_event_receipts`:
   - If the same `eventId` was already processed → mark as duplicate and do not increment progress
7. If not a duplicate → increment `quest_progress.completion_count` by `increment_by`.
8. The DB trigger may then write XP into `xp_ledger` if a milestone was reached.

### XP/Level
- `GET /xp` (optionally accepts `userRef` as query param)  
  Sums XP from `xp_ledger` and computes level using:
  - `baseXp = 100`
  - `level = floor(sqrt(totalXp / baseXp)) + 1`

Returns total XP, level, and progress toward the next level.

---

## Tools, libraries, and Backstage building blocks used

### Backstage core / plugin framework
- `@backstage/backend-plugin-api`  
  Plugin registration and core services (logger, config, database, auth).

- `@backstage/backend-defaults`  
  Dev/standalone backend setup (`dev/index.ts` via `createBackend()`).

- `@backstage/errors`  
  Standard error types (e.g. `NotFoundError`) mapped to HTTP responses.

### HTTP layer
- `express`  
  Routing/server layer.

- `express-promise-router`  
  Enables clean `async` route handlers without manual error wrapping.

### Validation
- `zod`  
  Schemas for validating request bodies (quests, events, etc.).

### Database
- `knex`  
  Query builder + migrations + optional seeds.

- `pg`  
  PostgreSQL driver used by Knex.

- Postgres triggers (defined in migrations)  
  Automatically awards XP when progress reaches milestones.

### Catalog / identity mapping
- `@backstage/catalog-client`  
  Looks up users in the Backstage Catalog (e.g. mapping GitHub login/id → Backstage user).

- `@backstage/catalog-model`  
  Helpers for entity refs (stringifying/parsing entity references).

### Auth in dev/test
- `@backstage/backend-test-utils`  
  Mocks auth/httpAuth in dev/test (`mockServices.auth.factory()`, etc.).

- `supertest`  
  HTTP testing against the Express app.

### Build and lint
- `@backstage/cli`  
  Standard Backstage build/test/lint/start toolchain.

- ESLint config via Backstage (`eslint-factory`).

### Config/schema
- `config.d.ts` is used as the config schema (declared in `package.json`).  
  It documents keys like `gamification.admin.groups`.  
  Note: additional config keys are used in code (e.g. seed and allowlist settings) and should ideally also be documented in `config.d.ts` for completeness.
