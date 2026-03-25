#!/usr/bin/env bash
set -euo pipefail

# Run from anywhere inside the repo
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$REPO_ROOT" ]; then
  echo "Not inside a Git repository."
  exit 1
fi

cd "$REPO_ROOT"

TEMPLATE_PATH=".github/commit-template.txt"

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "Missing $TEMPLATE_PATH"
  exit 1
fi

if ! command -v code >/dev/null 2>&1; then
  echo "'code' command not found."
  echo "Open VS Code and run: Shell Command: Install 'code' command in PATH"
  exit 1
fi

git config --local commit.template "$TEMPLATE_PATH"
git config --local core.editor "code --wait"

echo "Local Git setup complete."
echo "commit.template = $(git config --local --get commit.template)"
echo "core.editor     = $(git config --local --get core.editor)"
