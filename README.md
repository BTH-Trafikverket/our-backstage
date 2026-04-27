# Our backstage app

Our own version of Backstage where we can test the plugin locally.

## Prerequisites

- Node.js (22 or 24)
- Yarn (Berry) / Corepack enabled
- GitHub CLI (`gh`) installed and authenticated
- PostgreSQL running in Docker and reachable with the credentials in `.env.local`
- Playwright Chromium installed locally: `yarn exec playwright install chromium`
- Docker for Postgres. Run Backstage and Playwright on your host machine for faster feedback.

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

For the normal local workflow, run only Postgres in Docker:

```sh
docker compose up -d postgres
```

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
- Backend integration tests use your existing local Postgres cluster. The configured Postgres user must be able to create temporary databases for the test harness.
- `yarn test:e2e` runs Playwright on your machine against whichever app is already running. Prefer `yarn start:e2e` on the host for e2e runs; full `docker compose up` is useful for container development but is slower for Playwright because Backstage, file watching, and dependency startup all run through Docker.
- In the normal development app, the sign-in page now exposes both `Guest` and `GitHub`, so the Playwright flows can use guest auth against the dev stack.
- `yarn gamification:verify` uses that same running app for its E2E step. For local verification, start the lighter e2e app with `yarn start:e2e`, then run verify with `PLAYWRIGHT_URL=http://localhost:3001 PLAYWRIGHT_BACKEND_URL=http://localhost:7008 yarn gamification:verify`.
- `yarn start:e2e` starts a lighter isolated app on `http://localhost:3001` and `http://localhost:7008` using the `backstage_e2e` database in the same Docker Postgres instance. It creates that database automatically if it does not already exist.
- The e2e backend runs in a slimmed-down mode that keeps the auth, catalog, permission, and gamification pieces needed by the tests, while skipping unrelated plugin startup work.
- `yarn gamification:verify` streams each check's normal output and prints per-step timings.

Optional E2E env overrides:

```sh
APP_BASE_URL_E2E=http://localhost:3001
BACKEND_BASE_URL_E2E=http://localhost:7008
BACKEND_PORT_E2E=7008
CORS_ORIGIN_E2E=http://localhost:3001
DB_HOST_E2E=localhost
DB_PORT_E2E=5432
DB_USER_E2E=backstage
DB_PASSWORD_E2E=backstage
DB_NAME_E2E=backstage_e2e

# Explicit Playwright target override
PLAYWRIGHT_URL=http://localhost:3001
PLAYWRIGHT_BACKEND_URL=http://localhost:7008
```

Useful commands:

```sh
# Sync the catalog API entity from the authoritative backend OpenAPI file
yarn gamification:openapi:sync

# Full local verification for the gamification plugin against your local Postgres and running dev app
yarn gamification:verify

# Run only the frontend plugin tests
yarn gamification:test:frontend

# Run only the backend plugin tests against your local Postgres
yarn gamification:test:backend

# Run Playwright against the running dev app or docker-compose app
yarn test:e2e

# Start the Docker Postgres service used by local checks
docker compose up -d postgres

# Isolated E2E app on host ports with a separate database in Docker Postgres
yarn start:e2e

# Run the full gamification plugin test suite
yarn gamification:test
```
