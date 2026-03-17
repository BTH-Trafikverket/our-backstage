# AGENTS.md

## Scope

- This file applies to the whole repository.
- Main application code lives under `our-backstage/`.
- Custom project work is primarily in:
  - `our-backstage/plugins/gamification`
  - `our-backstage/plugins/gamification-backend`

## Working Style

- Be direct, concise, and practical.
- Prefer making the change over discussing the change at length.
- Preserve existing project structure and conventions unless there is a clear reason to improve them.
- Do not introduce unnecessary abstractions, wrappers, or helper layers.
- Read the relevant files before editing; do not guess how the code works.

## Priorities

1. Correctness
2. Data consistency
3. Auth and authorization correctness
4. Maintainability
5. Performance
6. UI polish

## Backstage Conventions

- Use discovery-based backend URLs from the frontend.
- Keep auth and authorization decisions on the backend whenever possible.
- Avoid duplicating backend business rules in the frontend.
- Keep config-driven behavior in config, not hardcoded literals.
- When changing API behavior, keep routes, services, schemas, frontend callers, and tests aligned.

## Backend Expectations

- When changing backend behavior, inspect the route, service, repository, schema, migration, and tests together.
- Keep database constraints, Zod validation, and API contract behavior consistent.
- Prefer transactional correctness over cleverness.
- Prefer batched queries over repeated per-item queries.
- Do not leave dead paths where schema accepts data but service logic cannot handle it.
- If external events are processed, prioritize idempotency and replay safety.

## Frontend Expectations

- Preserve the current UI patterns unless explicitly asked to redesign.
- Keep forms, validation messages, and backend constraints aligned.
- Avoid unnecessary fetches, repeated identity lookups, and duplicated state.
- Favor simple, readable state and request flow over premature optimization.
- First try to use backstage components for the frontend UI, I want you to explicity search and really look around and try to find if backstage has that component u wanna introduce in its docs. If you are sure it is not found, then fall back to using material UI components for that component.

## Testing and Validation

- Run targeted tests for the touched area whenever practical.
- Run lint for touched packages when practical.
- If changing migrations, database constraints, or triggers, update or add database-backed tests when possible.
- If changing schemas or API contracts, update tests and generated/openapi artifacts if the repo expects them to stay in sync.
- Before you are done with the changes always run "yarn gamification:verify"

## Editing Rules

- Make focused changes.
- Do not reformat unrelated code.
- Do not rename files, functions, or identifiers without a reason tied to the task.
- Do not remove user-written changes unless explicitly asked.
- Prefer additive, low-risk fixes over broad rewrites.

## Review Checklist

- Is frontend behavior consistent with backend behavior?
- Are validation, database constraints, and API docs consistent?
- Are there duplicated rules that should be centralized?
- Is the query/data-access path efficient enough for the feature?
- Are tests covering the real behavior that changed?

## Repository Notes

- `our-backstage/app-config.yaml` contains relevant gamification config such as admin groups and allowed callers.
- The backend plugin may rely on migrations and seed behavior at startup; check migrations before changing persistent behavior.
- For gamification changes, inspect both quests and badges flows because behavior is often mirrored across them.
