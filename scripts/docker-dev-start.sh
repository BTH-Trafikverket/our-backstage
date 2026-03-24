#!/usr/bin/env bash
set -euo pipefail

cd /workspace

YARN_CMD=(node .yarn/releases/yarn-4.4.1.cjs)

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "Installing dependencies into container volumes..."
else
  echo "Refreshing dependencies..."
fi

"${YARN_CMD[@]}" install --immutable
exec "${YARN_CMD[@]}" start:raw
