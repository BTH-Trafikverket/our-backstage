#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT_NAME="backstage-e2e"
COMPOSE_FILE="docker-compose.e2e.yml"

mkdir -p tmp/e2e/report tmp/e2e/results

cleanup() {
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE" \
    down --remove-orphans
}

trap cleanup EXIT

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  up --build --abort-on-container-exit --exit-code-from playwright
