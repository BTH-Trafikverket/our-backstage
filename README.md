# Our backstage app

Our own version of Backstage where we can test the plugin locally.

## Prerequisites

- Node.js (22 or 24)
- Yarn (Berry) / Corepack enabled
- GitHub CLI (`gh`) installed and authenticated
- Docker (recommended) if you run Postgres via `docker-compose`

## First-time setup

1) Install dependencies:

```sh
yarn install
```

2) Install secrets

```sh
./scripts/setup-dev.sh
```

3) start backstage
```sh
yarn start
```
