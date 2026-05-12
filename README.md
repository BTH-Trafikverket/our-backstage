# Our Backstage App

This repository contains the BTH-Trafikverket Backstage app plus custom
gamification plugins. It is a Yarn workspace Backstage project with the main
frontend app in `packages/app`, backend in `packages/backend`, and custom
gamification code in:

- `plugins/gamification` - frontend plugin
- `plugins/gamification-backend` - backend plugin, migrations, seeds, API

The gamification backend is registered from `packages/backend/src/index.ts` and
runs at `/api/gamification`.

## Prerequisites

- Node.js 22 or 24
- Corepack/Yarn Berry. This repo uses `yarn@4.4.1`.
- Docker with Docker Compose
- Playwright Chromium for E2E tests: `yarn exec playwright install chromium`

## Install Dependencies

```sh
yarn install
```

## Start Locally

```sh
docker compose up
```

The Compose stack starts Backstage, Postgres, and pgAdmin.

PgAdmin login:

- Email: `bth@trafikverket.se`
- Password: `admin`

Postgres server credentials for pgAdmin:

- Host: `postgres`
- Port: `5432`
- Database: `backstage`
- Username: `backstage`
- Password: `backstage`

## Migrations And Seeds

No separate migration command is needed for normal local development. When the
backend starts, `plugins/gamification-backend/src/database.ts` runs the
gamification Knex migrations from `plugins/gamification-backend/migrations`.

Seeds are applied on startup when `gamification.seed.enabled` is `true` in
`app-config.yaml`. The local config enables seeds and leaves `reset` as `false`.

For the isolated E2E app:

```sh
yarn start:e2e
```

`yarn start:e2e` starts Backstage on separate ports and creates the
`backstage_e2e` database automatically if it does not exist.

## Tests And Verification

Useful commands from `package.json`:

```sh
# Full required gamification verification
yarn gamification:verify

# Gamification checks split out
yarn gamification:openapi:check
yarn gamification:prettier:check
yarn gamification:lint
yarn gamification:test:frontend
yarn gamification:test:backend
yarn test:e2e

# Broader repo tests/lint
yarn test
yarn test:ci
yarn lint
yarn lint:all
```

`yarn gamification:verify` runs OpenAPI sync check, Prettier check, ESLint,
frontend tests, backend database tests, and E2E tests. For local verification,
start the isolated app with `yarn start:e2e` in another terminal before running
the verify command.

Backend integration tests use local Postgres. The configured Postgres user needs
permission to create temporary databases.
