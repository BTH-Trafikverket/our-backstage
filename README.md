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

Notes:

- The repo is bind-mounted into the `backstage` container, so source changes reload without rebuilding the image.
- Container `node_modules` live in Docker volumes, so the container does not overwrite your host dependencies.
- The first `docker compose up --build` will spend a while installing dependencies inside Docker-managed volumes before Backstage starts.
- If `3000` or `7007` are already in use, stop your local `yarn start` process before running Compose.
- `pgadmin` is still available, but only when explicitly requested:

```sh
docker compose --profile tools up --build
```

## Gamification quality checks

- `pre-commit` only checks staged files under `plugins/gamification` and `plugins/gamification-backend`. It runs Prettier write, Prettier check, and strict ESLint with autofix for fixable issues.
- `pre-push` runs the full gamification plugin verification pipeline before the push completes.

Useful commands:

```sh
# Sync the catalog API entity from the authoritative backend OpenAPI file
yarn gamification:openapi:sync

# Full local verification for the gamification plugin (same command used in CI and pre-push)
yarn gamification:verify

# Run only the frontend plugin tests
yarn gamification:test:frontend

# Run only the backend plugin tests against a temporary Postgres container on a random host port
yarn gamification:test:backend

# Run the full gamification plugin test suite
yarn gamification:test
```

Backend integration tests no longer require a manually started `docker-compose` Postgres instance or a fixed local `localhost:5432` database. `yarn gamification:test:backend` starts a disposable Postgres container with Docker, publishes Postgres on a random host port, points the existing backend integration tests at it, and tears it down afterward.
