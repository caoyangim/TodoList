#!/usr/bin/env bash

set -euo pipefail

BRANCH="${TODOFLOW_DEPLOY_BRANCH:-main}"
PM2_APP="${TODOFLOW_PM2_APP:-todoflow}"

cd "$(dirname "$0")/.."

echo "Deploying TodoFlow from origin/${BRANCH}..."
git pull --ff-only origin "$BRANCH"
npm ci
npm run lint
npm run typecheck
npm test
npm run build
pm2 restart "$PM2_APP" --update-env

echo "TodoFlow deployment completed."
pm2 status "$PM2_APP"
