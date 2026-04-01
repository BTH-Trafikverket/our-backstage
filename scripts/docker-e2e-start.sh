#!/usr/bin/env bash
set -euo pipefail

cd /workspace

YARN_CMD=(node .yarn/releases/yarn-4.4.1.cjs)
DEPENDENCY_MODE="${E2E_DEPENDENCY_MODE:-volume}"
STAMP_FILE="/var/lib/e2e/install-hash"
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
REQUIRED_NONEMPTY_DEPENDENCY_DIRS=(
  node_modules
  packages/app/node_modules
  packages/backend/node_modules
)

have_host_dependencies() {
  local dependency_dir
  for dependency_dir in "${REQUIRED_NONEMPTY_DEPENDENCY_DIRS[@]}"; do
    if [ ! -d "$dependency_dir" ] || [ -z "$(ls -A "$dependency_dir" 2>/dev/null)" ]; then
      echo "Missing required dependency directory for CI E2E mode: $dependency_dir" >&2
      return 1
    fi
  done
}

CURRENT_HASH="$(
  sha256sum "${HASH_INPUTS[@]}" \
    | sha256sum \
    | awk '{ print $1 }'
)"

mkdir -p "$(dirname "$STAMP_FILE")"

if [ "$DEPENDENCY_MODE" = "host" ]; then
  have_host_dependencies
  echo "Using host-provided E2E dependencies..."
else
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
fi

exec "${YARN_CMD[@]}" start:e2e:docker
