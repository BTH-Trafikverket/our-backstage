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

## Gamification quality checks

- `pre-commit` only checks staged files under `plugins/gamification` and `plugins/gamification-backend`. It runs Prettier write, Prettier check, and strict ESLint with autofix for fixable issues.
- `pre-push` runs the full gamification plugin verification pipeline before the push completes.

Useful commands:

```sh
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
