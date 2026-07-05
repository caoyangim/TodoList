# 日程模块功能规格文档

## 1. 角色定义与架构上下文

**角色**：资深全栈工程师 + UI/UX 专家。

**目标**：在 TodoFlow 中构建一个"日程与提醒系统"，含完整的前端界面、交互逻辑与后端 API。

**技术栈**：
- 前端：React 19 + Tailwind CSS 4 + Lucide React 图标库
- 后端：Next.js 15 App Router + better-sqlite3 + Zod 校验
- 共享层：`src/shared/` 存放 DTO 与 Schema，前端通过 `/api` REST 接口读写

**设计风格**：极简 SaaS 效率工具风格（Linear、Notion），浅色模式（Light Mode），高信息密度，布局清爽。

**遵循现有架构边界**（参见 `AGENTS.md`）：
- 前端不直接导入 `src/server` 或数据库对象
- Route Handler 只处理 HTTP，业务逻辑在 `src/server/services`
- 时间存储统一为 ISO 8601 UTC，前端按浏览器时区渲染
- API 响应格式 `{ data }` / `{ error: { code, message, fields? } }`
- 新增表使用 `CREATE TABLE IF NOT EXISTS`，兼容升级用 `ensureColumn`
- UI 文案使用中文，代码标识符使用英文

---

## 2. 核心概念

### 2.1 日程（Event）

一个具有**明确起止时间**的时间段，强调"跨度"。

典型场景：
- 项目评审会（周三 14:00–15:30）
- 迭代开发期（7月8日–7月12日）
- 出差（7月10日 09:00–7月12日 18:00）

### 2.2 提醒（Reminder）

一个**单一时刻**的时间点，强调"状态与时刻"，具有明确的完成/未完成状态。

典型场景：
- 提交周报（周五 17:00）
- 给客户回电话（明天 10:30）
- 续费服务器（7月15日 00:00）

### 2.3 两者对比

| 维度 | 日程 Event | 提醒 Reminder |
|---|---|---|
| 时间结构 | 时间段（开始 → 结束） | 单一时点 |
| 是否跨天 | 可以 | 不跨天 |
| 日历呈现 | 横跨日期格子的连续色条 | 单个格子内的小标签 |
| 完成状态 | 无（日程过期即过去） | 有（待完成 ↔ 已完成） |
| 重复 | 一期不做 | 支持：不重复 / 每天 / 每周 |

---

## 3. 前端数据模型

> 以下为前端视图渲染使用的接口定义。后端存储仍使用 ISO 8601 UTC，
> API 层负责 UTC ↔ 本地日期/时间字符串的转换。

```typescript
// 3.1 日程模型：代表一段【时间段】
interface EventItem {
  id: string;
  title: string;
  description?: string;       // 富文本 HTML 或纯文本
  startDate: string;          // 格式: YYYY-MM-DD
  startTime?: string;         // 格式: HH:MM，若全天则为 undefined
  endDate: string;            // 格式: YYYY-MM-DD
  endTime?: string;           // 格式: HH:MM
  isAllDay: boolean;          // 是否全天
  todoId?: string;            // 关联的 Todo ID（可选）
}

// 3.2 提醒模型：代表一个【时刻】，具有完成状态
interface ReminderItem {
  id: string;
  title: string;
  description?: string;       // 富文本 HTML 或纯文本
  dueDate: string;            // 格式: YYYY-MM-DD
  dueTime: string;            // 格式: HH:MM
  isCompleted: boolean;       // 已完成/未完成
  repeat: "none" | "daily" | "weekly";  // 重复规则
  todoId?: string;            // 关联的 Todo ID（可选）
}
```

---

## 4. UI 布局与组件层级

### 4.1 整体布局

```
┌──────────┬──────────────────────────────────────────┐
│ Sidebar  │         Main Calendar Area               │
│  260px   │         自适应剩余宽度                      │
│          │                                          │
│ + 新建   │  2026年 7月  [ < ] [ 今天 ] [ > ]  [月|周] │
│          │                                          │
│ ☑ 日程   │  Sun  Mon  Tue  Wed  Thu  Fri  Sat       │
│ ☑ 提醒   │  ┌──┬──┬──┬──┬──┬──┬──┐                 │
│          │  │  │  │  │  │  │  │  │                 │
│ 今日提醒  │  │  │  │  │  │  │  │  │                 │
│ ☐ 14:00 │  │  │  │  │  │  │  │  │                 │
│ ☑ 16:00 │  └──┴──┴──┴──┴──┴──┴──┘                 │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

背景色：`#FFFFFF`，分割线色：`#E5E7EB`（Gray-200）。

### 4.2 左侧边栏（Sidebar，宽度 260px）

**顶层 — 新建按钮：**
- 一个高亮的 `+ 新建事项` 按钮
- 背景色 `#4F46E5`（靛蓝 Indigo-600），文字白色
- 圆角 `rounded-lg`，全宽显示
- 点击触发统一创建弹窗

**中层 — 图例 / 图层控制：**
- ☑ 我的日程 — 附带蓝色方块图例 `#E0F2FE`
- ☑ 我的提醒 — 附带橙色方块图例 `#FFEDD5`
- 取消勾选时，主日历中对应类型的条目动态隐藏（Filter 逻辑）

**下层 — 今日提醒看板：**
- 标题："今日提醒"
- 过滤并聚合 `dueDate === 今天` 的所有 `ReminderItem`
- 每条左侧渲染 Checkbox，对应 `isCompleted` 状态
- 已完成项：灰色文字 + 删除线
- 点击 Checkbox 直接切换 `isCompleted` 状态（调用 API）

### 4.3 主日历区域

**顶部控制栏：**
```
[←] [2026年 7月] [→]      [ 今天 ]      [月] [周]
```
- 左侧：`<` `>` 箭头按钮切换月份，中间显示当前年月
- 中间：`今天` 按钮快速跳回当前月份
- 右侧：`月` / `周` 分段选择器（一期优先完美实现月视图）

**月视图网格（7×5 或 7×6）：**
- 星期头：周日 (Sun) – 周六 (Sat)，均匀分布 7 列
- 日期格子：每个格子内包含日期数字
- 点击格子空白处触发新建弹窗，自动带入该格日期
- 今天格子：背景色 `#EEF2FF`（Indigo-50），日期数字以靛蓝圆底白字高亮
- 非当月日期：文字灰显 `#D1D5DB`

---

## 5. 核心渲染逻辑

### 5.1 日程（EventItem）— 强调"跨度"

**单天日程（startDate === endDate）：**
- 渲染为圆角矩形条：`rounded-md px-2 py-1 text-xs mb-1`
- 背景色 `#E0F2FE`（Blue-100），文字色 `#0369A1`（Blue-700）
- 内容：`startTime` + `title`（如 `10:00 部门周会`）
- 全天日程不带时间，只显示 title

**跨天日程（startDate !== endDate）：**
- 核心算法：日程必须横跨多个连续日期格子，呈现为连续无断点的水平长条
- 起始格子：左端圆角，右端直角
- 中间经过的格子：两端直角，纯色条
- 结束格子：左端直角，右端圆角
- 颜色同单天日程：`#E0F2FE` 背景，`#0369A1` 文字
- 若跨行（跨周），在每行的对应格子上都渲染条的对应段

视觉示例（7月8日–7月10日的跨天日程）：
```
  7/8         7/9         7/10
┌─────────┬──────────┬─────────┐
│ ╭────── │ ──────── │ ────╮   │
│ │项目评审 │          │    │   │
│ ╰────── │ ──────── │ ────╯   │
└─────────┴──────────┴─────────┘
```

### 5.2 提醒（ReminderItem）— 强调"状态与时刻"

无论关联关系如何，提醒**只渲染在 `dueDate` 对应的那一个格子**里。

**未完成状态（isCompleted === false）：**
- 精简小标签，`rounded px-2 py-0.5 text-xs mb-0.5`
- 背景色 `#FFEDD5`（Orange-100），文字色 `#C2410C`（Orange-700）
- 左侧带未勾选圆圈图标 `○`（lucide `Circle`）
- 内容：`dueTime` + `title`（如 `14:00 拿快递`）

**已完成状态（isCompleted === true）：**
- 背景色变为 `#F3F4F6`（Gray-100），文字色变为 `#9CA3AF`（Gray-400）
- 文字整体添加删除线 `line-through`
- 左侧图标变为已勾选 `✓`（lucide `CheckCircle`）

**点击行为：**
- 点击提醒标签 → 切换 `isCompleted` 状态
- 点击日程色条 → 打开详情/编辑弹窗

---

## 6. 交互与弹窗逻辑

### 6.1 统一创建弹窗（Unified Creator Modal）

**触发条件：**
- 点击侧边栏 `+ 新建事项` 按钮
- 双击日历格子空白处 → 自动带入该格日期

**结构：**
- 使用项目已有 `Modal` 组件
- 顶部：分段选择器（Segmented Control）切换类型

```
┌─────────────────────────────────────┐
│           新建事项                    │
│                                     │
│   ┌──────────┬──────────┐           │
│   │   日程   │   提醒   │           │
│   └──────────┴──────────┘           │
│                                     │
│   标题：[________________]          │
│                                     │
│   [日程模式]                         │
│   开始日期：[2026-07-08] 时间：[09:00]│
│   结束日期：[2026-07-08] 时间：[10:00]│
│   [ ] 全天                          │
│                                     │
│   [提醒模式]                         │
│   提醒日期：[2026-07-08]             │
│   提醒时间：[14:00]                  │
│   重复：[不重复 ▼]                   │
│                                     │
│   备注：[________________]          │
│                                     │
│         [取消]    [保存]             │
└─────────────────────────────────────┘
```

**动态表单逻辑：**

| 字段 | 日程模式 | 提醒模式 |
|---|---|---|
| 标题 | ✓ 必填 | ✓ 必填 |
| 开始日期 | ✓ | — |
| 开始时间 | ✓（全天时隐藏） | — |
| 结束日期 | ✓ | — |
| 结束时间 | ✓（全天时隐藏） | — |
| 全天勾选框 | ✓ | — |
| 提醒日期 | — | ✓ |
| 提醒时间 | — | ✓ |
| 重复周期下拉框 | — | ✓（不重复/每天/每周） |
| 备注说明 | ✓ 选填 | ✓ 选填 |

**校验规则：**
- 标题必填，最长 200 字符
- 日程：结束日期+时间必须晚于开始日期+时间
- 全天日程：只比较日期部分
- 提醒：时间必填

**保存行为：**
- 点击保存 → 调用 `POST /api/calendar` → 刷新日历数据
- 新对象 Push 到对应数据数组中
- 关闭弹窗

### 6.2 编辑与删除

- 点击日历中的日程色条 → 弹出编辑弹窗（复用创建弹窗，预填已有数据）
- 日程/提醒均可编辑并保存
- 弹窗底部提供 `删除` 按钮（红色文字），点击后二次确认
- 删除成功后关闭弹窗并刷新日历

---

## 7. 数据库设计

### 7.1 日程表

```sql
CREATE TABLE IF NOT EXISTS CalendarEvent (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,           -- 富文本 JSON（复用 NoteContentDto 结构）
  startAt TEXT NOT NULL,      -- ISO 8601 UTC
  endAt TEXT NOT NULL,        -- ISO 8601 UTC
  isAllDay INTEGER NOT NULL DEFAULT 0,
  todoId TEXT UNIQUE REFERENCES Todo(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS CalendarEvent_userId_idx ON CalendarEvent(userId);
CREATE INDEX IF NOT EXISTS CalendarEvent_startAt_idx ON CalendarEvent(startAt);
```

### 7.2 提醒表

```sql
CREATE TABLE IF NOT EXISTS CalendarReminder (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,           -- 富文本 JSON
  dueAt TEXT NOT NULL,        -- ISO 8601 UTC
  isCompleted INTEGER NOT NULL DEFAULT 0,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK(repeat IN ('none', 'daily', 'weekly')),
  todoId TEXT UNIQUE REFERENCES Todo(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS CalendarReminder_userId_idx ON CalendarReminder(userId);
CREATE INDEX IF NOT EXISTS CalendarReminder_dueAt_idx ON CalendarReminder(dueAt);
```

> **设计决策**：日程与提醒分表存储。二者在字段结构、校验规则、渲染逻辑上差异
> 较大，分表可避免大量 nullable 字段和条件约束。API 层在查询时合并两张表结果
> 供日历视图使用。

### 7.3 兼容升级

- 使用 `CREATE TABLE IF NOT EXISTS`，不影响已有数据
- `todoId` 使用 `ensureColumn` 模式补充，确保旧版本平滑升级
- 关联 Todo 删除时 `ON DELETE SET NULL`，解除绑定但不删除日程/提醒

---

## 8. API 设计

### 8.1 查询日历数据

```text
GET /api/calendar?from=2026-07-01&to=2026-08-01
```

返回 `from` 到 `to` 范围内的日程和提醒。默认 `from` 为当月首日，`to` 为下月首日。
参数使用 `YYYY-MM-DD` 格式，服务端转换为 UTC 后查询。

响应：

```json
{
  "data": {
    "events": [
      {
        "id": "evt-1",
        "title": "项目评审会",
        "description": null,
        "startDate": "2026-07-08",
        "startTime": "14:00",
        "endDate": "2026-07-08",
        "endTime": "15:30",
        "isAllDay": false,
        "todoId": null,
        "createdAt": "2026-07-05T00:00:00.000Z",
        "updatedAt": "2026-07-05T00:00:00.000Z"
      }
    ],
    "reminders": [
      {
        "id": "rem-1",
        "title": "提交周报",
        "description": null,
        "dueDate": "2026-07-10",
        "dueTime": "17:00",
        "isCompleted": false,
        "repeat": "weekly",
        "todoId": null,
        "createdAt": "2026-07-05T00:00:00.000Z",
        "updatedAt": "2026-07-05T00:00:00.000Z"
      }
    ]
  }
}
```

### 8.2 创建日程

```text
POST /api/calendar/events
```

```json
{
  "title": "项目评审会",
  "description": null,
  "startAt": "2026-07-08T06:00:00.000Z",
  "endAt": "2026-07-08T07:30:00.000Z",
  "isAllDay": false,
  "todoId": null
}
```

校验：`title` 必填 ≤200 字符，`endAt` > `startAt`，`todoId` 若提供则校验存在且未绑定。

### 8.3 创建提醒

```text
POST /api/calendar/reminders
```

```json
{
  "title": "提交周报",
  "description": null,
  "dueAt": "2026-07-10T09:00:00.000Z",
  "repeat": "weekly",
  "todoId": null
}
```

校验：`title` 必填 ≤200 字符，`repeat` ∈ `{none, daily, weekly}`。

### 8.4 编辑日程

```text
PATCH /api/calendar/events/:id
```

可部分更新。不可改变类型（日程 ↔ 提醒不可互转）。

### 8.5 编辑提醒

```text
PATCH /api/calendar/reminders/:id
```

### 8.6 切换提醒完成状态

```text
PATCH /api/calendar/reminders/:id/completion
```

```json
{ "isCompleted": true }
```

### 8.7 删除

```text
DELETE /api/calendar/events/:id
DELETE /api/calendar/reminders/:id
```

返回 `204`。关联的 Todo 仅解除绑定，不受影响。

---

## 9. 业务规则

1. **日程时间约束**：`endAt` 必须严格大于 `startAt`。
2. **全天日程**：`isAllDay=true` 时，API 将 `startAt`、`endAt` 的时间部分归一化为 00:00。
3. **提醒完成状态**：仅提醒有 `isCompleted` 字段，日程无完成概念。
4. **重复提醒**：`daily`/`weekly` 的提醒在 API 查询时按需展开到 `from`–`to` 范围，
   不预存未来实例。
5. **关联解耦**：删除日程/提醒时解除 Todo 绑定，反之亦然。两侧独立。
6. **跨用户隔离**：所有查询过滤 `userId`，跨用户访问返回 404。
7. **时间存储**：数据库存 ISO 8601 UTC，API 输入输出使用 UTC，前端负责本地时区格式化。

---

## 10. 前端文件结构

```
src/features/calendar/
  calendar-page.tsx            # 日历主页面（组装 Sidebar + Main）
  calendar-sidebar.tsx         # 左侧边栏（新建按钮、图例、今日提醒）
  calendar-month-view.tsx      # 月视图网格
  calendar-week-view.tsx       # 周视图（二期）
  calendar-grid-cell.tsx       # 单个日期格子
  calendar-event-bar.tsx       # 日程色条（含跨天算法）
  calendar-reminder-tag.tsx    # 提醒标签（含状态切换）
  calendar-creator-modal.tsx   # 统一创建/编辑弹窗
  calendar-today-reminders.tsx # 今日提醒面板

src/app/(app)/calendar/
  page.tsx                     # /calendar 路由入口

src/server/services/
  calendar-event-service.ts    # 日程 CRUD
  calendar-reminder-service.ts # 提醒 CRUD、重复展开

src/shared/
  schemas/calendar.ts          # Zod 校验
  types/calendar.ts            # DTO 类型定义
```

---

## 11. 导航集成

在侧边导航 `app-nav.tsx` 中新增"日程"入口，图标 `Calendar`（lucide-react），
位于"概览"和"Todo"之间：

```text
概览 → 日程 → Todo → Note → SOP 执行 → SOP 模板
```

---

## 12. Mock 数据集（2026 年 7 月）

用于前端开发和测试：

```typescript
const mockEvents: EventItem[] = [
  // 单天日程
  {
    id: "evt-1",
    title: "部门周会",
    startDate: "2026-07-08",
    startTime: "10:00",
    endDate: "2026-07-08",
    endTime: "11:00",
    isAllDay: false,
  },
  // 跨天日程
  {
    id: "evt-2",
    title: "Q3 战略规划会",
    startDate: "2026-07-13",
    startTime: "09:00",
    endDate: "2026-07-15",
    endTime: "18:00",
    isAllDay: false,
  },
  // 全天日程
  {
    id: "evt-3",
    title: "公司周年庆",
    startDate: "2026-07-20",
    endDate: "2026-07-20",
    isAllDay: true,
  },
];

const mockReminders: ReminderItem[] = [
  // 未完成提醒
  {
    id: "rem-1",
    title: "提交周报",
    dueDate: "2026-07-10",
    dueTime: "17:00",
    isCompleted: false,
    repeat: "weekly",
  },
  {
    id: "rem-2",
    title: "续费云服务器",
    dueDate: "2026-07-15",
    dueTime: "10:00",
    isCompleted: false,
    repeat: "none",
  },
  // 已完成提醒
  {
    id: "rem-3",
    title: "给客户回电话",
    dueDate: "2026-07-05",
    dueTime: "14:00",
    isCompleted: true,
    repeat: "none",
  },
  // 每日重复提醒
  {
    id: "rem-4",
    title: "站会",
    dueDate: "2026-07-08",
    dueTime: "09:30",
    isCompleted: false,
    repeat: "daily",
  },
];
```

---

## 13. 设计 Token 速查

| 用途 | Tailwind Class | 色值 |
|---|---|---|
| 页面背景 | `bg-white` | `#FFFFFF` |
| 边框/分割线 | `border-[#E5E7EB]` | `#E5E7EB` |
| 主按钮背景 | `bg-[#4F46E5]` | `#4F46E5` |
| 日程色条背景 | `bg-[#E0F2FE]` | `#E0F2FE` |
| 日程色条文字 | `text-[#0369A1]` | `#0369A1` |
| 提醒标签背景 | `bg-[#FFEDD5]` | `#FFEDD5` |
| 提醒标签文字 | `text-[#C2410C]` | `#C2410C` |
| 已完成背景 | `bg-[#F3F4F6]` | `#F3F4F6` |
| 已完成文字 | `text-[#9CA3AF]` | `#9CA3AF` |
| 今天高亮背景 | `bg-[#EEF2FF]` | `#EEF2FF` |
| 非当月日期 | `text-[#D1D5DB]` | `#D1D5DB` |

---

## 14. 非目标（本期不做）

- 周视图 / 日视图（二期实现）
- 日历订阅（iCal/CalDAV）
- 参与者邀请、会议管理
- 浏览器 Notification 通知
- 拖拽调整日程时间
- 跨账号共享日历
- 时区选择（统一使用浏览器本地时区）
- 日程标签/分类颜色
- 概览页集成（二期）

---

## 15. 实施步骤（Action Items）

按以下顺序逐步实现：

**Step 1 — 数据层：**
- 声明 `EventItem`、`ReminderItem` TypeScript 接口（`src/shared/types/calendar.ts`）
- 编写 Zod 校验 schema（`src/shared/schemas/calendar.ts`）
- 编写 Mock 数据集（含单天日程、跨天日程、未完成提醒、已完成提醒，时间设定在 2026 年 7 月）
- 创建数据库表和索引（`src/server/db.ts`）
- 实现 Service 层 CRUD + 重复展开逻辑

**Step 2 — API 层：**
- `GET /api/calendar` — 查询日历数据
- `POST /api/calendar/events` — 创建日程
- `POST /api/calendar/reminders` — 创建提醒
- `PATCH /api/calendar/events/:id` — 编辑日程
- `PATCH /api/calendar/reminders/:id` — 编辑提醒
- `PATCH /api/calendar/reminders/:id/completion` — 切换提醒完成状态
- `DELETE /api/calendar/events/:id`、`DELETE /api/calendar/reminders/:id` — 删除

**Step 3 — 前端界面：**
- 日历主页面 Layout：Sidebar + 主日历区域
- 左侧边栏：新建按钮、图例 Checkbox、今日提醒看板
- 月视图日历网格（7 列，星期头周日–周六）
- 导航控制栏（月份切换、今天按钮、月/周 Tab）

**Step 4 — 核心渲染：**
- 日历格子数据过滤与分发逻辑
- 跨天日程水平长条算法（起始圆角 → 直角 → 结束圆角）
- 提醒打勾消项状态联动
- 图例 Checkbox 过滤联动

**Step 5 — 弹窗交互：**
- 统一创建弹窗 + 分段选择器（日程/提醒切换）
- 动态表单（不同模式显示不同字段）
- 编辑/删除功能

---

> 本文档为产品功能 + UI 交互层面的完整规格。技术实现方案将在确认后按 Step 顺序推进。
