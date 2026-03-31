# Our backstage app

Our own version of Backstage where we can test the plugin locally.

## Prerequisites

- Node.js (22 or 24)
- Yarn (Berry) / Corepack enabled
- GitHub CLI (`gh`) installed and authenticated
- Docker if you want to run the app database locally or run backend integration tests

## First-time setup

1. Install dependencies:

```sh
yarn install
```

2. Install secrets

```sh
./scripts/setup-dev.sh
```

3. start backstage

```sh
yarn start
```

## Docker development

If you want the full app in containers with hot reload from your local checkout:

```sh
docker compose up --build
```

This starts:

- `backstage` on `http://localhost:3000`
- backend API on `http://localhost:7007`
- `postgres` on `localhost:5432`
- `pgadmin` on `http://localhost:5050`

Notes:

- The repo is bind-mounted into the `backstage` container, so source changes reload without rebuilding the image.
- Container `node_modules` live in Docker volumes, so the container does not overwrite your host dependencies.
- The first `docker compose up --build` will spend a while installing dependencies inside Docker-managed volumes before Backstage starts.
- If `3000` or `7007` are already in use, stop your local `yarn start` process before running Compose.
- `pgadmin` uses `bth@trafikverket.se` / `admin`

## Gamification quality checks

- `pre-commit` only checks staged files under `plugins/gamification` and `plugins/gamification-backend`. It runs Prettier write, Prettier check, and strict ESLint with autofix for fixable issues.
- `pre-push` only runs `yarn gamification:verify` when the pushed refs touch gamification code or its test harness; unrelated pushes skip it.
- `yarn test:e2e` starts its own Dockerized Backstage, Postgres, and Playwright stack with `app-config.e2e.yaml`; you do not need to run `yarn start:e2e` first.
- The first `yarn test:e2e` run installs dependencies into dedicated Docker volumes. Later runs reuse those volumes, so they should avoid the cold-start install cost unless dependencies change.
- In CI, `yarn test:e2e` reuses the runner's existing `node_modules` through a CI-only compose override instead of reinstalling dependencies inside the e2e containers.
- The e2e backend runs in a slimmed-down mode that keeps the auth, catalog, permission, and gamification pieces needed by the tests, while skipping unrelated plugin startup work.
- `yarn gamification:verify` now prewarms the e2e Backstage/Postgres stack in the background while the frontend and backend suites run, then waits only if startup is still in progress before launching Playwright.
- `yarn test:e2e` leaves the stopped e2e containers in place after completion; they are reused on the next run. If you want to remove them, run `docker compose -p backstage-e2e -f docker-compose.e2e.yml down`.
- `yarn gamification:verify` now prints per-step timings so it is easier to see whether time is going into checks, unit tests, or e2e startup.
- `yarn start:e2e` is only for manually running the app outside Docker with the e2e config.

Useful commands:

```sh
# Sync the catalog API entity from the authoritative backend OpenAPI file
yarn gamification:openapi:sync

# Full local verification for the gamification plugin, including Docker e2e (same command used in CI and pre-push)
yarn gamification:verify

# Run only the frontend plugin tests
yarn gamification:test:frontend

# Run only the backend plugin tests against a temporary Postgres container on a random host port
yarn gamification:test:backend

# Run the full gamification plugin test suite
yarn gamification:test
```

Backend integration tests no longer require a manually started `docker-compose` Postgres instance or a fixed local `localhost:5432` database. `yarn gamification:test:backend` starts a disposable Postgres container with Docker, publishes Postgres on a random host port, points the existing backend integration tests at it, and tears it down afterward.
