# TodoFlow 服务器部署与更新

本文适用于使用 Git、Node.js、PM2 和 Nginx 部署的 Linux 服务器。

## 1. 部署约定

- 项目目录：`/var/www/todoflow`
- Git 分支：`main`
- PM2 应用名：`todoflow`
- 应用端口：`3000`
- SQLite 数据目录：`/var/www/todoflow/data`

`.env`、`data/` 和 `backups/` 已被 Git 忽略。执行 `git pull` 不会覆盖服务器环境变量和数据库，
但不要运行会删除未跟踪文件的 `git clean -fdx`。

## 2. 首次部署

```bash
sudo mkdir -p /var/www/todoflow
sudo chown -R "$USER":"$USER" /var/www/todoflow

git clone https://github.com/caoyangim/TodoList.git /var/www/todoflow
cd /var/www/todoflow

npm ci
cp .env.example .env
mkdir -p data backups
chmod 700 data backups
```

### 编辑 `.env`

推荐使用 `nano`：

```bash
cd /var/www/todoflow
nano .env
```

写入或修改以下内容：

```dotenv
DATABASE_URL="file:./data/todoflow.db"
TODOFLOW_ADMIN_USERNAME="admin"
TODOFLOW_ADMIN_PASSWORD="请替换为6至32位的强密码"
```

在 `nano` 中：

1. 使用方向键移动光标并编辑。
2. 按 `Ctrl+O` 保存，再按 Enter 确认文件名。
3. 按 `Ctrl+X` 退出。

也可以不使用编辑器，通过命令创建 `.env`：

```bash
cd /var/www/todoflow
read -r -p "管理员用户名: " TODOFLOW_USER
read -r -s -p "管理员密码（6至32位）: " TODOFLOW_PASSWORD
printf '\n'
printf 'DATABASE_URL="file:./data/todoflow.db"\nTODOFLOW_ADMIN_USERNAME="%s"\nTODOFLOW_ADMIN_PASSWORD="%s"\n' \
  "$TODOFLOW_USER" "$TODOFLOW_PASSWORD" > .env
unset TODOFLOW_USER TODOFLOW_PASSWORD
```

这种方式输入密码时终端不会显示字符。密码不要包含换行符或双引号；推荐使用字母、数字和
`!@#%_-` 等字符。

限制环境文件权限：

```bash
chmod 600 .env
```

检查变量名是否齐全，但不在终端显示密码：

```bash
grep -E '^(DATABASE_URL|TODOFLOW_ADMIN_USERNAME)=' .env
awk -F= '/^TODOFLOW_ADMIN_PASSWORD=/{value=substr($0,index($0,"=")+1); gsub(/^"|"$/, "", value); if (length(value)>=6 && length(value)<=32) ok=1} END{exit !ok}' .env \
  && echo "管理员密码已配置"
```

以后需要修改环境变量时执行：

```bash
cd /var/www/todoflow
nano .env
pm2 restart todoflow --update-env
```

不要使用 `cat .env` 或把 `.env` 内容复制到聊天、工单和日志中，以免泄露管理员密码。

完成检查、构建并启动：

```bash
npm run lint
npm run typecheck
npm test
npm run build

pm2 start npm --name todoflow -- start
pm2 save
```

## 3. 日常发布工作流

代码合并或推送到远程仓库的 `main` 分支后，在服务器执行：

```bash
cd /var/www/todoflow
bash scripts/deploy.sh
```

脚本位于 `scripts/deploy.sh`，默认从 `origin/main` 拉取并重启 PM2 中名为 `todoflow` 的应用。
需要使用其他分支或 PM2 应用名时：

```bash
TODOFLOW_DEPLOY_BRANCH=release TODOFLOW_PM2_APP=todoflow bash scripts/deploy.sh
```

脚本内部执行的完整工作流为：

```bash
cd /var/www/todoflow &&
git pull --ff-only origin main &&
npm ci &&
npm run lint &&
npm run typecheck &&
npm test &&
npm run build &&
pm2 restart todoflow --update-env
```

命令使用 `&&` 连接，任意一步失败都会停止后续步骤。只有拉取、安装、检查、测试和构建全部成功，
PM2 才会重启应用。

如果这次发布没有修改依赖，仍建议保留 `npm ci`，确保服务器依赖与 `package-lock.json` 一致。

## 4. 发布后验证

```bash
pm2 status
pm2 logs todoflow --lines 50
curl -fsS http://127.0.0.1:3000/ > /dev/null && echo "TodoFlow is healthy"
```

使用 Nginx 反向代理时，普通代码发布不需要重启 Nginx。只有修改 Nginx 配置后才执行：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. 数据备份

数据库使用 SQLite WAL 模式。手动复制数据库前先停止应用，并备份整个 `data` 目录：

```bash
cd /var/www/todoflow
pm2 stop todoflow
mkdir -p backups
tar -czf "backups/todoflow-data-$(date +%Y%m%d-%H%M%S).tar.gz" data
pm2 start todoflow
```

检查备份文件：

```bash
ls -lh backups
```

不要把 `data/`、`.env` 或 `backups/` 提交到 Git。

## 6. 常见问题

### `git pull` 提示服务器存在本地修改

先检查修改内容：

```bash
git status
git diff
```

不要直接使用 `git reset --hard`，以免删除需要保留的服务器修改。应先确认修改来源，再决定提交、
暂存或手工恢复。

### PM2 找不到应用

首次启动：

```bash
cd /var/www/todoflow
pm2 start npm --name todoflow -- start
pm2 save
```

### 查看启动失败原因

```bash
pm2 logs todoflow --lines 100
```

重点检查 `.env`、Node.js 版本、依赖安装结果、端口占用和 `data` 目录写权限。
