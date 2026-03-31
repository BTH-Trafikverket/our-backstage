#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT_NAME="backstage-e2e"
WAIT_TIMEOUT_SECONDS="${E2E_WAIT_TIMEOUT_SECONDS:-240}"
COMPOSE_FILES=(-f docker-compose.e2e.yml)
MODE="${1:-full}"

if [ "${CI:-}" = "true" ]; then
  COMPOSE_FILES+=(-f docker-compose.e2e.ci.yml)
fi

mkdir -p tmp/e2e/report tmp/e2e/results

timestamp() {
  date +%s
}

log_duration() {
  local label="$1"
  local started_at="$2"
  local finished_at
  finished_at="$(timestamp)"
  echo "$label completed in $((finished_at - started_at))s"
}

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" "${COMPOSE_FILES[@]}" "$@"
}

cleanup() {
  compose stop playwright backstage-e2e postgres-e2e >/dev/null 2>&1 || true
}

prewarm() {
  echo "Using E2E compose files: ${COMPOSE_FILES[*]}"
  startup_started_at="$(timestamp)"
  compose up -d --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" postgres-e2e backstage-e2e
  log_duration "E2E environment startup" "$startup_started_at"
}

run_playwright() {
  echo "Using E2E compose files: ${COMPOSE_FILES[*]}"
  playwright_started_at="$(timestamp)"
  set +e
  compose up --abort-on-container-exit --exit-code-from playwright playwright
  status="$?"
  set -e
  log_duration "Playwright run" "$playwright_started_at"
  return "$status"
}

case "$MODE" in
  full)
    trap cleanup EXIT
    prewarm
    run_playwright
    ;;
  prewarm)
    prewarm
    ;;
  playwright-only)
    run_playwright
    ;;
  stop)
    cleanup
    ;;
  *)
    echo "Usage: $0 [full|prewarm|playwright-only|stop]" >&2
    exit 1
    ;;
esac
