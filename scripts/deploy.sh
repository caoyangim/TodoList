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
      echo "部署失败，正在恢复上一版本构建..." >&2
      rm -rf .next
      mv "$PREVIOUS_BUILD" .next
    fi
  fi
  if [[ $APP_STOPPED -eq 1 ]]; then
    pm2 restart "$PM2_APP" --update-env >/dev/null || true
  fi
  exit "$exit_code"
}

echo "▸ 正在从 origin/${BRANCH} 部署 TodoFlow..."
echo "▸ 检查工作区状态..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "服务器工作区有未提交更改，拒绝部署。" >&2
  exit 1
fi

echo "▸ 拉取最新代码..."
git pull --ff-only origin "$BRANCH"
echo "▸ 安装依赖..."
npm ci
echo "▸ 代码检查..."
npm run lint
echo "▸ 类型检查..."
npm run typecheck
echo "▸ 运行测试..."
npm test

echo "▸ 创建备份目录..."
mkdir -p backups
echo "▸ 停止应用..."
pm2 stop "$PM2_APP"
APP_STOPPED=1
trap restore_service EXIT

archive="backups/todoflow-data-$(date +%Y%m%d-%H%M%S).tar.gz"
echo "▸ 备份数据库..."
tar -czf "$archive" data
echo "数据库备份已创建：$archive"

echo "▸ 构建新版本..."
export NEXT_PUBLIC_GIT_COMMIT="$(git rev-parse --short HEAD)"
export NEXT_PUBLIC_BUILD_TIME="$(date -u +"%Y-%m-%d %H:%M UTC")"
if [[ -d .next ]]; then
  PREVIOUS_BUILD=".next.previous-$(date +%s)"
  mv .next "$PREVIOUS_BUILD"
fi

npm run build

if [[ -n "$PREVIOUS_BUILD" && -d "$PREVIOUS_BUILD" ]]; then
  rm -rf "$PREVIOUS_BUILD"
  PREVIOUS_BUILD=""
fi

echo "▸ 启动应用..."
pm2 restart "$PM2_APP" --update-env
APP_STOPPED=0
trap - EXIT

sleep 5

echo "▸ 健康检查..."
for i in $(seq 1 10); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  echo "等待应用就绪...（$i/10）"
  sleep 3
done

if ! curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "健康检查失败（已重试 10 次）" >&2
  exit 1
fi

echo "TodoFlow 部署完成。"
pm2 status "$PM2_APP"
