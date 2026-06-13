# TodoFlow 开发规范

## 1. 环境准备

```powershell
node -v
npm -v
npm install
```

要求 Node.js 24 LTS。

本地环境：

```dotenv
DATABASE_URL="file:./data/todoflow.db"
```

复制 `.env.example` 为 `.env`。`.env` 和 `data/` 不提交 Git。

## 2. 开发命令

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

建议验证顺序：

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

不要并行执行 build 与 typecheck，因为 Next.js 会生成 `.next/types`。

## 3. Git 规范

分支命名：

```text
feature/<topic>
fix/<topic>
docs/<topic>
```

提交建议使用 Conventional Commits：

```text
feat(sop): add optional child nodes
fix(run): preserve first completion time
docs: add agent onboarding guide
test(run): cover parent completion aggregation
```

提交前检查：

```powershell
git status
npm run lint
npm run typecheck
npm test
```

数据库文件、环境变量、构建产物和缓存不得提交。

## 4. REST 开发规范

- Route Handler 保持薄层。
- 使用 Zod 解析所有客户端输入。
- Route Handler 捕获错误并调用 `fail(error)`。
- Service 抛出带稳定 code 的 `AppError`。
- 新接口通过 `apiRequest` 接入前端。
- 写入后重新获取服务端数据，不在前端猜测最终聚合状态。

## 5. 数据库修改规范

当前没有迁移工具，修改步骤必须完整：

1. 为全新数据库更新 `CREATE TABLE`。
2. 为已有数据库增加幂等兼容升级。
3. 必要时增加安全的数据回填。
4. 更新 Service 行类型、查询、插入和更新语句。
5. 更新共享 DTO。
6. 更新 `prisma/schema.prisma` 参考模型。
7. 使用临时测试数据库验证。
8. 使用已有真实数据库启动验证。

禁止：

- 自动删除旧列或旧表。
- 在测试中读写 `data/todoflow.db`。
- 把本地数据库加入 Git。

## 6. UI 规范

- 保持暖白背景、红色主操作和低噪声列表。
- 复用 `button`、`badge`、`list-item`、`card` 等现有类。
- 危险或不可逆操作必须确认。
- 请求期间禁用重复操作。
- 提供加载、空状态和错误提示。
- 父节点整行用于展开，不把禁用完成按钮当作展开按钮。
- 新页面必须检查 1280px 桌面和 390px 窄屏。

## 7. 测试规范

必须自动测试：

- 数据事务与快照。
- 唯一性和删除限制。
- 必选/可选完成规则。
- 父节点自动聚合。
- 首次完成和上次修改时间。

页面交互变化至少手工验证：

- 正常操作。
- 空状态。
- API 错误。
- 重复点击。
- 窄屏显示。
