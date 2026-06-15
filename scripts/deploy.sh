#!/usr/bin/env bash

set -euo pipefail

BRANCH="${TODOFLOW_DEPLOY_BRANCH:-main}"
PM2_APP="${TODOFLOW_PM2_APP:-todoflow}"
HEALTH_URL="${TODOFLOW_HEALTH_URL:-http://127.0.0.1:3000/login}"
APP_STOPPED=0
PREVIOUS_BUILD=""

cd "$(dirname "$0")/.."

restore_service() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    if [[ -n "$PREVIOUS_BUILD" && -d "$PREVIOUS_BUILD" ]]; then
      echo "Deployment failed; restoring the previous build." >&2
      rm -rf .next
      mv "$PREVIOUS_BUILD" .next
    fi
  fi
  if [[ $APP_STOPPED -eq 1 ]]; then
    pm2 restart "$PM2_APP" --update-env >/dev/null || true
  fi
  exit "$exit_code"
}

echo "Deploying TodoFlow from origin/${BRANCH}..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy with a dirty server worktree." >&2
  exit 1
fi

git pull --ff-only origin "$BRANCH"
npm ci
npm run lint
npm run typecheck
npm test

mkdir -p backups
pm2 stop "$PM2_APP"
APP_STOPPED=1
trap restore_service EXIT

archive="backups/todoflow-data-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$archive" data
echo "Database backup created: $archive"

if [[ -d .next ]]; then
  PREVIOUS_BUILD=".next.previous-$(date +%s)"
  mv .next "$PREVIOUS_BUILD"
fi

npm run build

if [[ -n "$PREVIOUS_BUILD" && -d "$PREVIOUS_BUILD" ]]; then
  rm -rf "$PREVIOUS_BUILD"
  PREVIOUS_BUILD=""
fi

pm2 restart "$PM2_APP" --update-env
APP_STOPPED=0
trap - EXIT

for i in $(seq 1 10); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  echo "Waiting for app to be ready... ($i/10)"
  sleep 3
done

if ! curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Health check failed after 10 retries." >&2
  exit 1
fi

echo "TodoFlow deployment completed."
pm2 status "$PM2_APP"
