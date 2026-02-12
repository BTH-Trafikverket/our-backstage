#!/usr/bin/env bash
set -euo pipefail

REPO="BTH-Trafikverket/our-backstage"
WORKFLOW="dev-secrets-bundle.yml"
ARTIFACT="dev-secrets-bundle"

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required. Install it first."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required."; exit 1; }

# Ensure authenticated
if ! gh auth status >/dev/null 2>&1; then
  echo "Logging in to GitHub CLI..."
  gh auth login
fi

echo "Triggering workflow (may require environment approval)..."
gh workflow run "$WORKFLOW" -R "$REPO" >/dev/null

sleep 2

RUN_ID="$(gh run list -R "$REPO" --workflow "$WORKFLOW" --limit 1 --json databaseId -q '.[0].databaseId')"

echo "Waiting for run $RUN_ID to complete..."
gh run watch "$RUN_ID" -R "$REPO" --exit-status

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading artifact..."
gh run download "$RUN_ID" -R "$REPO" -n "$ARTIFACT" -D "$TMP_DIR"

# Find files even if gh created a subfolder
ENV_FILE="$(find "$TMP_DIR" -type f -name ".env.local" -print -quit)"
PEM_FILE="$(find "$TMP_DIR" -type f -name "app.pem" -print -quit)"

if [[ -z "${ENV_FILE:-}" ]]; then
  echo "ERROR: .env.local not found in downloaded artifact."
  echo "Downloaded files:"
  find "$TMP_DIR" -maxdepth 5 -type f -print
  exit 1
fi

if [[ -z "${PEM_FILE:-}" ]]; then
  echo "ERROR: app.pem not found in downloaded artifact."
  echo "Downloaded files:"
  find "$TMP_DIR" -maxdepth 5 -type f -print
  exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$PROJECT_ROOT/.secrets"

cp "$ENV_FILE" "$PROJECT_ROOT/.env.local"
cp "$PEM_FILE" "$PROJECT_ROOT/.secrets/app.pem"
chmod 600 "$PROJECT_ROOT/.secrets/app.pem" || true

echo ""
echo "✅ Installed:"
echo "  - $PROJECT_ROOT/.env.local"
echo "  - $PROJECT_ROOT/.secrets/app.pem"
echo ""
echo "Next: load .env.local (envx/dotenv/direnv) and run Backstage."
