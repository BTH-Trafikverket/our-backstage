#!/usr/bin/env bash
set -euo pipefail

E2E_PREWARM_PID=""
E2E_PREWARM_STARTED=false

timestamp() {
  date +%s
}

run_step() {
  local label="$1"
  shift

  local started_at finished_at
  started_at="$(timestamp)"
  echo "==> $label"
  "$@"
  finished_at="$(timestamp)"
  echo "<== $label completed in $((finished_at - started_at))s"
}

start_e2e_prewarm() {
  echo "==> Starting E2E environment prewarm in background"
  bash scripts/test-e2e-docker.sh prewarm &
  E2E_PREWARM_PID="$!"
  E2E_PREWARM_STARTED=true
}

wait_for_e2e_prewarm() {
  if [ -z "$E2E_PREWARM_PID" ]; then
    return 0
  fi

  echo "==> Waiting for E2E environment prewarm"
  wait "$E2E_PREWARM_PID"
  E2E_PREWARM_PID=""
}

cleanup() {
  if [ -n "$E2E_PREWARM_PID" ] && kill -0 "$E2E_PREWARM_PID" >/dev/null 2>&1; then
    kill "$E2E_PREWARM_PID" >/dev/null 2>&1 || true
    wait "$E2E_PREWARM_PID" >/dev/null 2>&1 || true
  fi

  if [ "$E2E_PREWARM_STARTED" = true ]; then
    bash scripts/test-e2e-docker.sh stop >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

verify_started_at="$(timestamp)"

run_step "Gamification OpenAPI check" yarn gamification:openapi:check
run_step "Gamification Prettier check" yarn gamification:prettier:check
run_step "Gamification ESLint" yarn gamification:lint
start_e2e_prewarm
run_step "Gamification frontend tests" yarn gamification:test:frontend
run_step "Gamification backend tests" yarn gamification:test:backend
wait_for_e2e_prewarm
run_step "Gamification E2E tests" bash scripts/test-e2e-docker.sh playwright-only

verify_finished_at="$(timestamp)"
echo "<== gamification:verify completed in $((verify_finished_at - verify_started_at))s"
