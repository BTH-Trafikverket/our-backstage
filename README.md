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
- GitHub CLI (`gh`) authenticated for the repo, if you need the shared dev secrets
- Playwright Chromium for E2E tests: `yarn exec playwright install chromium`

## Environment Setup

Install the shared local secrets, if you have access:

```sh
./scripts/setup-secrets.sh
```

That script downloads and installs:

- `.env.local`
- `.secrets/app.pem`

The local app reads `.env.local` through `dotenvx`. The important database
settings are `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
For the Docker Postgres service these are normally:

```sh
DB_HOST=localhost
DB_PORT=5432
DB_USER=backstage
DB_PASSWORD=backstage
DB_NAME=backstage
```

## Start Required Containers

For normal local development, run Postgres in Docker and run Backstage on your
host machine:

```sh
docker compose up -d postgres
```

Optional database UI:

```sh
docker compose up -d pgadmin
```

You can also run the full dev app in Docker:

```sh
docker compose up --build
```

The full Compose app bind-mounts the repo and installs dependencies into Docker
volumes. It is convenient, but usually slower than running only Postgres in
Docker.

## Install Dependencies

```sh
yarn install
```

## Migrations And Seeds

No separate migration command is needed for normal local development.

When the backend starts, `plugins/gamification-backend/src/database.ts` runs the
gamification Knex migrations from `plugins/gamification-backend/migrations`.
Seeds are also applied on startup when `gamification.seed.enabled` is `true` in
`app-config.yaml`. The local config enables seeds and leaves `reset` as `false`.

## Start Locally

Start Postgres first:

```sh
docker compose up -d postgres
```

Then start Backstage:

```sh
yarn start
```

For the isolated E2E app, use:

```sh
yarn start:e2e
```

`yarn start:e2e` starts Backstage on separate ports and creates the
`backstage_e2e` database automatically if it does not exist.

## Useful Local URLs

- App: http://localhost:3000
- Backend: http://localhost:7007
- Gamification: http://localhost:3000/gamification
- Gamification API: http://localhost:7007/api/gamification
- PgAdmin: http://localhost:5050
- E2E app: http://localhost:3001
- E2E backend: http://localhost:7008

PgAdmin credentials from `docker-compose.yaml`:

- Email: `bth@trafikverket.se`
- Password: `admin`

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
keep Docker Postgres running and start the isolated app with `yarn start:e2e` in
another terminal before running the verify command.

Backend integration tests use local Postgres. The configured Postgres user needs
permission to create temporary databases.

## Troubleshooting

- **Ports already in use:** stop any existing `yarn start` or Compose process
  using ports `3000`, `7007`, `5432`, or `5050`.
- **Backend cannot connect to Postgres:** run `docker compose up -d postgres`
  and confirm `.env.local` points at `localhost:5432` for host-based development.
- **Backend tests fail before running tests:** the Postgres user likely needs
  `CREATEDB` or superuser privileges.
- **E2E tests cannot find the app:** start `yarn start:e2e` first, or make sure
  the normal app is running on `3000/7007`.
- **Secrets are missing:** run `./scripts/setup-secrets.sh` and make sure `gh`
  is authenticated with access to `BTH-Trafikverket/our-backstage`.
- **Full Docker startup is slow:** use only `docker compose up -d postgres` and
  run `yarn start` on the host for faster feedback.
