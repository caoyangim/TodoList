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
| GitHub 仓库 | `https://github.com/caoyangim/TodoList` |
| Gitee 镜像 | `https://gitee.com/caoyangim/TodoList` |
| Jenkins | `http://124.222.222.224:8080`（需腾讯云安全组放行 8080） |
| Node.js | v24 LTS（NVM 管理） |

服务器使用 NVM。远程命令找不到 Node.js 或 PM2 时，使用 `bash -lc '...'`。

### 仓库镜像说明

服务器在国内，GitHub 直连不稳定。日常开发推送 GitHub，服务器通过 Gitee 镜像仓库拉取代码。

- **GitHub**：日常开发、PR、代码评审。
- **Gitee**：镜像仓库，服务器 `git pull` 来源，Jenkins SCM 来源。

每次推送 GitHub 后，前往 [Gitee 镜像仓库](https://gitee.com/caoyangim/TodoList) 点击 **同步** 按钮，
或等待自动同步。Gitee 同步完成后即可触发 Jenkins 部署。

## 发布规则

- 不保存或输出 SSH 密码、管理员密码、Cookie 和 `.env` 内容。
- 不删除或覆盖 `.env`、`data/` 和 `backups/`。
- 不运行 `git reset --hard`、`git clean -fdx` 或强制推送。
- 服务器工作区不干净时停止发布并查明原因。
- 数据修改前必须停止应用并备份整个 `data/`。
- 发布异常时查阅 [发布异常处理](deployment-troubleshooting/README.md)。

---

## 自动部署（Jenkins，推荐）

### 触发方式

**手动触发**：打开 `http://124.222.222.224:8080` → TodoFlow-Deploy → **Build Now**。

**自动触发**：推送 GitHub → Gitee 同步 → Jenkins 检测到 Gitee 更新 → 自动构建。

### Pipeline 流程

Jenkins 加载 `Jenkinsfile`，执行步骤：

```
▸ 加载 NVM 环境（nvm use 24）
▸ 切换至 /var/www/todoflow
▸ 执行 scripts/deploy.sh
   ├── ▸ 检查工作区
   ├── ▸ git pull（从 Gitee 镜像）
   ├── ▸ npm ci
   ├── ▸ lint → typecheck → test
   ├── ▸ 停止 PM2
   ├── ▸ 备份 SQLite 数据
   ├── ▸ npm run build
   ├── ▸ 启动 PM2 / 等待 5 秒
   └── ▸ 健康检查（最多重试 10 次）
```

### Jenkins 初始安装

以下为服务器首次安装 Jenkins 的完整记录（已完成）：

```bash
# 安装 Java 21（Jenkins 2.568+ 要求）
sudo apt update
sudo apt install -y fontconfig openjdk-21-jre

# 添加 Jenkins 仓库
echo "deb [trusted=yes] https://pkg.jenkins.io/debian binary/" | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins

# 以 ubuntu 用户运行（访问 NVM、PM2 和项目目录）
sudo mkdir -p /etc/systemd/system/jenkins.service.d
printf '[Service]\nUser=ubuntu\nGroup=ubuntu\nEnvironment="JENKINS_HOME=/var/lib/jenkins"\n' | \
  sudo tee /etc/systemd/system/jenkins.service.d/override.conf
sudo chown -R ubuntu:ubuntu /var/lib/jenkins /var/log/jenkins /var/cache/jenkins

sudo systemctl daemon-reload
sudo systemctl enable jenkins
sudo systemctl start jenkins

# 初始密码
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

### Jenkins 必需插件

Manage Jenkins → Plugins → Available plugins，安装：

- Pipeline
- Pipeline: Stage View
- Git

### 创建 Pipeline Job

1. Jenkins Dashboard → New Item → 名称 `TodoFlow-Deploy` → **Pipeline** → OK
2. Pipeline 配置：
   - Definition: `Pipeline script from SCM`
   - SCM: Git
   - Repository URL: `https://gitee.com/caoyangim/TodoList.git`
   - Branches to build: `*/main`
   - Script Path: `Jenkinsfile`
3. Save

### PM2 安装

Jenkins 使用 Node 24（NVM），需确保 PM2 在该版本下全局安装：

```bash
bash -lc "nvm use 24 && npm install -g pm2"
```

---

## 手动部署（备选）

当 Jenkins 不可用时使用。

### 1. 本地验证并推送

```bash
git status -sb
npm run lint
npm run typecheck
npm test
npm run build
git push origin main
```

### 2. 同步 Gitee 镜像

前往 [gitee.com/caoyangim/TodoList](https://gitee.com/caoyangim/TodoList) 点击 **同步**。

### 3. 执行发布

```bash
ssh ubuntu@124.222.222.224
cd /var/www/todoflow
git pull --ff-only origin main   # origin 指向 Gitee
bash scripts/deploy.sh
```

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

### 成功标准

- 服务器提交是目标提交，Git 工作区干净。
- lint、类型检查、测试和构建均通过。
- PM2 显示 `online`。
- 登录页返回 `200`。
- 公网根路径返回 `200`，或按预期以 `307` 跳转到 `/login`。
- 本次数据库备份存在。

---

## 首次部署

```bash
# 从 Gitee 克隆（国内服务器建议用 Gitee）
sudo mkdir -p /var/www/todoflow
sudo chown -R "$USER":"$USER" /var/www/todoflow
git clone https://gitee.com/caoyangim/TodoList.git /var/www/todoflow
cd /var/www/todoflow

# 如果从 GitHub 克隆（需要 GitHub 可连通）
# git clone https://github.com/caoyangim/TodoList.git /var/www/todoflow

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

校验 `.env`（只检查变量是否存在，不输出值）：

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

---

## 环境依赖速查

| 组件 | 版本 | 备注 |
|------|------|------|
| Ubuntu | 24.04 | |
| Node.js | 24.16.0 LTS | NVM 管理，`nvm use 24` |
| npm | 11.13.0 | |
| PM2 | 7.0.1 | 全局安装于 Node 24 |
| Java | 21.0.11 | Jenkins 运行时 |
| Jenkins | 2.568 | 以 ubuntu 用户运行 |
| Nginx | 1.24.0 | 反向代理 80→3000 |

## 发布报告模版

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
