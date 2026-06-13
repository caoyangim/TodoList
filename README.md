# TodoFlow

个人使用的本地 Todo 与版本化 SOP 管理工具。

SOP 节点支持两层父子结构和必选/可选标记：

- 叶子节点可以标记为必须或可选。
- 可选节点不阻止执行实例完成。
- 父节点不能手动勾选，全部子节点完成后自动完成。
- 当前版本仅支持“父节点 → 子节点”两层结构。
- 撤销已完成节点前需要二次确认。
- 节点保留首次完成时间；每次勾选或撤销都会更新上次修改时间。

## 环境

- Node.js 24 LTS
- npm 11+

## 启动

```powershell
npm install
npm run dev
```

访问 <http://localhost:3000>。

首次启动时会自动创建 SQLite 表结构，无需单独安装 SQLite。

## 常用命令

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## 数据

数据库默认位于：

```text
data/todoflow.db
```

SQLite 使用 WAL 模式，运行期间还可能存在 `todoflow.db-wal` 和
`todoflow.db-shm`。手动备份时应先停止应用，再复制整个 `data` 目录。

恢复步骤：

1. 停止 TodoFlow。
2. 备份当前 `data` 目录。
3. 用备份文件替换 `data/todoflow.db`。
4. 重新启动应用。

## 架构

```text
React 页面 → REST API → Service → SQLite
```

- 页面只通过 `/api` 访问业务数据。
- Route Handler 负责 HTTP 参数和响应。
- Service 负责校验、事务和业务规则。
- DTO 和 Zod schema 位于 `src/shared`，不向前端暴露数据库实现。

`prisma/schema.prisma` 保留为数据模型参考。当前开发网络无法访问 Prisma CLI
所需的引擎下载地址，因此 V1 使用 `better-sqlite3` 初始化并访问同一套表结构；
REST 和 Service 边界不受影响，后续可以在数据层内替换 ORM。

## REST API

### Todo

```text
GET    /api/todos?status=pending|completed|all
POST   /api/todos
GET    /api/todos/:id
PATCH  /api/todos/:id
DELETE /api/todos/:id
PATCH  /api/todos/:id/completion
```

### SOP 模板

```text
GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PUT    /api/templates/:id
DELETE /api/templates/:id
```

模板节点字段包括 `isRequired` 和 `parentId`。`parentId` 为空表示顶层节点，
非空时必须指向同一模板内的顶层节点。

### SOP 执行

```text
GET   /api/runs
POST  /api/runs
GET   /api/runs/:id
PATCH /api/runs/:id/nodes/:nodeId/completion
```

成功响应为 `{ "data": ... }`。错误响应包含 `code`、`message` 和可选的
字段错误。时间统一使用 ISO 8601 UTC 字符串。
