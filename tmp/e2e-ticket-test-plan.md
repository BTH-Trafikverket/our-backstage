# E2E Tests To Record

## Leaderboard UI

Output file:

```text
plugins/gamification/e2e-tests/leaderboard-page.spec.ts
```

Start recording:

```sh
yarn exec playwright codegen \
  http://localhost:3001/gamification/leaderboard \
  --target=playwright-test \
  --output plugins/gamification/e2e-tests/leaderboard-page.spec.ts
```

## Admin Badge CRUD

Output file:

```text
plugins/gamification/e2e-tests/admin-badges-crud.spec.ts
```

Start recording:

```sh
yarn exec playwright codegen \
  http://localhost:3001/gamification/badges \
  --target=playwright-test \
  --output plugins/gamification/e2e-tests/admin-badges-crud.spec.ts
```
