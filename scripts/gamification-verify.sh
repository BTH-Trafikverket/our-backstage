#!/usr/bin/env bash
set -euo pipefail

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

verify_started_at="$(timestamp)"

run_step "Gamification OpenAPI check" yarn gamification:openapi:check
run_step "Gamification Prettier check" yarn gamification:prettier:check
run_step "Gamification ESLint" yarn gamification:lint
run_step "Gamification frontend tests" yarn gamification:test:frontend
run_step "Gamification backend tests" yarn gamification:test:backend
run_step "Gamification E2E tests" yarn test:e2e

verify_finished_at="$(timestamp)"
echo "<== gamification:verify completed in $((verify_finished_at - verify_started_at))s"
