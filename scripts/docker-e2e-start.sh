#!/usr/bin/env bash
set -euo pipefail

cd /workspace

YARN_CMD=(node .yarn/releases/yarn-4.4.1.cjs)
STAMP_FILE="node_modules/.e2e-install-hash"
HASH_INPUTS=(
  package.json
  yarn.lock
  .yarnrc.yml
  .yarn/releases/yarn-4.4.1.cjs
  packages/app/package.json
  packages/backend/package.json
  plugins/gamification/package.json
  plugins/gamification-backend/package.json
)

CURRENT_HASH="$(
  sha256sum "${HASH_INPUTS[@]}" \
    | sha256sum \
    | awk '{ print $1 }'
)"

if \
  [ -d node_modules ] \
  && [ -n "$(ls -A node_modules 2>/dev/null)" ] \
  && [ -f "$STAMP_FILE" ] \
  && [ "$(cat "$STAMP_FILE")" = "$CURRENT_HASH" ]
then
  echo "Reusing cached E2E dependencies..."
else
  if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "Installing E2E dependencies into container volumes..."
  else
    echo "Refreshing E2E dependencies..."
  fi

  "${YARN_CMD[@]}" install --immutable
  printf '%s\n' "$CURRENT_HASH" > "$STAMP_FILE"
fi

exec "${YARN_CMD[@]}" start:e2e:docker
