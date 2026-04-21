#!/usr/bin/env bash
set -euo pipefail

NULL_SHA="0000000000000000000000000000000000000000"
RELEVANT_FILES=(
  "package.json"
  "yarn.lock"
  ".yarnrc.yml"
  "playwright.config.ts"
  "app-config.e2e.yaml"
  ".github/workflows/pr-tests.yml"
)
RELEVANT_PREFIXES=(
  "plugins/gamification/"
  "plugins/gamification-backend/"
  "packages/app/"
  "packages/backend/"
  "catalog/apis/gamification-api.yaml"
  "scripts/gamification-verify.sh"
  "scripts/gamification-pre-push.sh"
  "scripts/run-gamification-backend-tests.mjs"
  "scripts/run-local-e2e.mjs"
  "scripts/start-local-e2e.mjs"
  "scripts/run-gamification-eslint.mjs"
  "scripts/sync-gamification-openapi.mjs"
)

is_relevant_file() {
  local file="$1"
  local relevant_file
  local relevant_prefix

  for relevant_file in "${RELEVANT_FILES[@]}"; do
    if [ "$file" = "$relevant_file" ]; then
      return 0
    fi
  done

  for relevant_prefix in "${RELEVANT_PREFIXES[@]}"; do
    if [[ "$file" == "$relevant_prefix"* ]]; then
      return 0
    fi
  done

  return 1
}

resolve_default_base() {
  if git rev-parse --verify --quiet "@{upstream}" >/dev/null 2>&1; then
    git merge-base HEAD "@{upstream}"
    return
  fi

  if git rev-parse --verify --quiet "refs/remotes/origin/main" >/dev/null; then
    git merge-base HEAD "refs/remotes/origin/main"
    return
  fi

  if git rev-parse --verify --quiet "refs/heads/main" >/dev/null; then
    git merge-base HEAD "refs/heads/main"
    return
  fi

  git rev-list --max-parents=0 HEAD | tail -n 1
}

resolve_range_for_push() {
  local local_sha="$1"
  local remote_sha="$2"
  local base_sha

  if [ "$remote_sha" != "$NULL_SHA" ]; then
    printf '%s..%s\n' "$remote_sha" "$local_sha"
    return
  fi

  base_sha="$(resolve_default_base)"
  printf '%s..%s\n' "$base_sha" "$local_sha"
}

collect_changed_files() {
  local range="$1"
  git diff --name-only --diff-filter=ACMR "$range"
}

should_run_verify=false
read_from_hook=false

while read -r _local_ref local_sha _remote_ref remote_sha; do
  if [ -z "${local_sha:-}" ] || [ "$local_sha" = "$NULL_SHA" ]; then
    continue
  fi

  read_from_hook=true

  while IFS= read -r changed_file; do
    if [ -n "$changed_file" ] && is_relevant_file "$changed_file"; then
      should_run_verify=true
      break 2
    fi
  done < <(collect_changed_files "$(resolve_range_for_push "$local_sha" "${remote_sha:-$NULL_SHA}")")
done

if [ "$read_from_hook" = false ]; then
  while IFS= read -r changed_file; do
    if [ -n "$changed_file" ] && is_relevant_file "$changed_file"; then
      should_run_verify=true
      break
    fi
  done < <(collect_changed_files "$(resolve_default_base)..HEAD")
fi

if [ "$should_run_verify" = false ]; then
  echo "No gamification-related changes in this push. Skipping gamification:verify."
  exit 0
fi

echo "Gamification-related changes detected. Running gamification:verify..."
yarn gamification:verify
