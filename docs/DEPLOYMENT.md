# TodoFlow 发布流程

供人工运维者和 AI Agent 使用。发布前先阅读根目录 `AGENTS.md`。

## 部署信息

| 项目 | 值 |
| --- | --- |
| SSH | `ubuntu@124.222.222.224` |
| 项目目录 | `/var/www/todoflow` |
| 分支 | `main` |
| PM2 应用 | `todoflow` |
| 本地健康检查 | `http://127.0.0.1:3000/login` |
| 公网地址 | `http://124.222.222.224` |
| 数据目录 | `/var/www/todoflow/data` |
| 备份目录 | `/var/www/todoflow/backups` |

服务器使用 NVM。远程命令找不到 Node.js 或 PM2 时，使用 `bash -lc '...'`。

## 发布规则

- 不保存或输出 SSH 密码、管理员密码、Cookie 和 `.env` 内容。
- 不删除或覆盖 `.env`、`data/` 和 `backups/`。
- 不运行 `git reset --hard`、`git clean -fdx` 或强制推送。
- 服务器工作区不干净时停止发布并查明原因。
- 数据修改前必须停止应用并备份整个 `data/`。
- 发布异常时查阅 [发布异常处理](deployment-troubleshooting/README.md)。

## 标准发布

### 1. 本地验证并推送

```bash
git status -sb
npm run lint
npm run typecheck
npm test
npm run build
git push origin main
```

### 2. 服务器预检

```bash
ssh ubuntu@124.222.222.224
cd /var/www/todoflow
git status -sb
git log -1 --oneline
test -f .env
test -d data
pm2 status todoflow
```

确认分支为 `main`、工作区干净、`.env` 和 `data/` 存在。

### 3. 执行发布

```bash
cd /var/www/todoflow
bash scripts/deploy.sh
```

脚本自动完成：

1. 拉取 `origin/main`。
2. 安装锁定依赖。
3. 执行 lint、类型检查和测试。
4. 停止 PM2 并备份 SQLite 数据。
5. 构建新版本；失败时恢复旧构建。
6. 重启 PM2 并检查登录页。

### 4. 发布后验证

```bash
cd /var/www/todoflow
git status -sb
git log -1 --oneline
pm2 status todoflow
curl -sS -o /dev/null -w 'login HTTP %{http_code}\n' \
  http://127.0.0.1:3000/login
curl -sS -o /dev/null -w 'public HTTP %{http_code} redirect=%{redirect_url}\n' \
  http://124.222.222.224/
ls -lh backups | tail
```

成功标准：

- 服务器提交是目标提交，Git 工作区干净。
- lint、类型检查、测试和构建均通过。
- PM2 显示 `online`。
- 登录页返回 `200`。
- 公网根路径返回 `200`，或按预期以 `307` 跳转到 `/login`。
- 本次数据库备份存在。

## 首次部署

```bash
sudo mkdir -p /var/www/todoflow
sudo chown -R "$USER":"$USER" /var/www/todoflow
git clone https://github.com/caoyangim/TodoList.git /var/www/todoflow
cd /var/www/todoflow
npm ci
mkdir -p data backups
chmod 700 data backups
cp .env.example .env
chmod 600 .env
nano .env
```

`.env` 必须包含：

```dotenv
DATABASE_URL="file:./data/todoflow.db"
TODOFLOW_ADMIN_USERNAME="admin"
TODOFLOW_ADMIN_PASSWORD="由用户提供的6至32位强密码"
```

只检查变量是否存在，不输出值：

```bash
grep -q '^DATABASE_URL=' .env
grep -q '^TODOFLOW_ADMIN_USERNAME=' .env
grep -q '^TODOFLOW_ADMIN_PASSWORD=' .env
test "$(stat -c %a .env)" = "600"
```

首次启动：

```bash
npm run lint
npm run typecheck
npm test
npm run build
pm2 start npm --name todoflow -- start
pm2 save
```

## 发布报告

```text
目标提交：
服务器提交：
验证：lint / typecheck / tests / build
PM2 状态：
HTTP 验证：
数据备份：
数据修改：
未处理风险：
```

报告中不得包含任何密码、Cookie 或 `.env` 内容。
