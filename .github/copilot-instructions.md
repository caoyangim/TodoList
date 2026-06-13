# TodoFlow Copilot Instructions

生成或修改代码前先阅读仓库根目录的 `AGENTS.md`。

关键约束：

- 前端只通过 REST API 访问业务数据。
- SQL 和事务只能位于 `src/server`。
- `better-sqlite3` 是实际运行时；`prisma/schema.prisma` 仅供模型参考。
- SOP 执行必须保持模板快照、两层父子结构、必选/可选和父节点自动聚合规则。
- 数据库字段变化必须兼容已有 SQLite 文件。
- 修改完成后运行 lint、typecheck、test；页面或路由变化还要运行 build。

详细说明以 `AGENTS.md` 和 `docs/` 为准。
