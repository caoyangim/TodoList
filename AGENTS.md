# TodoFlow Agent Guide

本文件是 AI 编码代理和新开发会话的首要入口。修改代码前应先阅读本文件，
再按任务需要阅读 `docs/` 中的专题文档。

## 项目概览

TodoFlow 是轻量多账号、自托管的 Todo 与版本化 SOP 管理工具。

核心流程：

```text
Todo：创建 → 编辑 → 完成/恢复 → 删除

SOP：维护模板 → 创建版本化执行实例 → 执行叶子节点
     → 自动聚合父节点 → 完成所有必选节点
```

项目采用同仓库前后端分层：

```text
React Client Components
        ↓ fetch
Next.js REST Route Handlers
        ↓
Service 业务层
        ↓
better-sqlite3
        ↓
本地 SQLite 文件
```

## 当前技术事实

- Node.js 24 LTS，npm 11。
- Next.js 15 App Router、React 19、TypeScript strict。
- Tailwind CSS 4 提供基础能力，主要视觉规则集中在 `src/app/globals.css`。
- Zod 负责共享输入校验。
- `better-sqlite3` 是当前实际数据库访问层。
- `prisma/schema.prisma` 仅是模型参考，不是运行时来源，也没有 Prisma migration。
- Vitest 覆盖核心 Service 规则。
- 当前支持管理员预创建账号、90 天滑动会话、用户数据隔离和浅色主题。

## 必须遵守的架构边界

1. 前端不得直接导入 `src/server`、数据库对象或 SQLite 类型。
2. 前端业务数据必须通过 `/api` REST 接口读写。
3. Route Handler 只处理 HTTP、JSON、状态码和错误转换。
4. 业务规则、事务和数据库操作放在 `src/server/services`。
5. 请求 schema 与 DTO 放在 `src/shared`，不得向前端暴露数据库行结构。
6. 新数据库字段必须同时更新：
   - `src/server/db.ts`
   - `src/shared/types/models.ts`
   - 对应 Service 查询和写入
   - `prisma/schema.prisma` 参考模型
   - 相关测试和文档
7. 数据库兼容升级使用 `ensureColumn` 或明确的幂等 SQL，不能删除用户已有数据。
8. 执行实例必须保存模板快照，运行时不得动态读取模板节点内容。

## 重要业务规则

- SOP 只支持两层结构：顶层节点与直接子节点。
- 有子节点的节点是父节点，不能手动完成。
- 父节点仅在全部直接子节点完成后自动完成。
- 叶子节点可标记为必选或可选。
- 存在必选叶子节点时，全部必选叶子完成即代表 SOP 完成。
- 没有必选叶子节点时，必须完成全部叶子节点。
- 进度按全部叶子节点计算，因此 SOP 可以在进度低于 100% 时完成。
- 撤销完成状态前必须向用户二次确认。
- `completedAt` 表示当前是否完成，撤销时清空。
- `firstCompletedAt` 记录首次完成时间，之后永不清空。
- `lastModifiedAt` 在勾选或撤销时更新。
- 当首次完成与上次修改相同时，UI 不显示“上次修改”。
- 已产生执行实例的模板禁止删除。
- 同一模板下版本号唯一。

完整规则见 `docs/BUSINESS_RULES.md`。

## 关键目录

```text
src/app/                 页面与 REST Route Handlers
src/components/          跨功能基础组件
src/features/            Todo、模板、执行的前端功能组件
src/server/              数据库、HTTP 错误和 Service 业务层
src/shared/              前后端共享 schema、DTO、API client
tests/                   核心业务测试
prisma/schema.prisma     数据模型参考
docs/                    当前实现文档
data/                    本地数据库，Git 忽略
```

详细模块说明见 `docs/ARCHITECTURE.md`。

## 开发与验证

```powershell
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

完成代码修改后至少运行：

```powershell
npm run lint
npm run typecheck
npm test
```

涉及页面、路由或构建配置时还必须运行：

```powershell
npm run build
```

不要并行执行 `next build` 与依赖 `.next/types` 的 `typecheck`，两者可能同时改写
`.next` 缓存并产生虚假的缺失文件错误。遇到这种情况，删除 `.next` 后按
`build → typecheck` 顺序重试。

## 编码规范

- 保持 TypeScript strict，不使用无理由的 `any`。
- 使用 `@/` 路径别名。
- REST JSON 字段使用 camelCase，时间使用 ISO 8601 UTC 字符串。
- API 成功响应统一为 `{ data }`。
- API 错误统一为 `{ error: { code, message, fields? } }`。
- 可预期业务错误使用 `AppError`，不要向客户端暴露调用栈或数据库路径。
- 多表写入和状态聚合必须放在 SQLite 事务中。
- UI 文案使用中文；代码标识符使用英文。
- 延续简约的 Todoist 风格，不引入新的 UI 框架或全局状态库。
- 优先扩展现有组件和样式，避免为单个使用点创建抽象。
- 所有备注功能统一使用 `NoteContentDto` 与 `RichNoteEditor`，必须支持富文本、
  安全链接和粘贴图片。

## 修改检查清单

### 修改 REST 接口

- 更新 Zod schema、DTO、Route Handler、Service。
- 保持统一响应与状态码。
- 更新 `docs/API.md`。
- 增加成功、校验失败和业务冲突测试。

### 修改 SOP 节点

- 同时考虑模板节点与执行快照节点。
- 保证历史实例不受模板编辑影响。
- 重新检查父节点聚合、必选完成判定和进度算法。
- 覆盖勾选、撤销、首次完成和修改时间测试。

### 修改数据库

- 不直接覆盖或删除 `data/todoflow.db`。
- 新字段必须为旧数据提供默认值或回填逻辑。
- 初始化 SQL 与兼容升级 SQL都应可重复执行。
- 更新 `prisma/schema.prisma`，但不要假设 Prisma CLI 可用。

## 明确非目标

除非用户明确要求，否则不要主动加入：

- 公开注册、OAuth、邮件找回密码或跨用户数据共享。
- 公网部署、CORS 和独立后端服务。
- 深色主题、拖拽排序、复杂动画。
- 搜索、分页、标签、通知和第三方集成。
- 通用 repository/mapper 层或微服务拆分。
- Prisma Client 迁移。

## 文档优先级

出现冲突时按以下顺序判断：

1. 当前代码和自动化测试。
2. `AGENTS.md` 与 `docs/`。
3. `README.md`。
4. `TodoFlow_开发计划书_V1.0.md`，该文件保留为早期规划历史。
