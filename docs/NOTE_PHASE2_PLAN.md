# Note 二期计划书

## 0. 当前执行状态

本文档已更新为持续执行版计划，状态说明如下：

- `已完成`：已在当前仓库落地，并通过 `lint` / `typecheck` / `test` / `build`
- `进行中`：已完成部分能力，但还有明确收尾项
- `未开始`：尚未进入实现
- `调整`：原计划已根据实现实际情况改动

当前总体进度：

- Note 工作区与数据/API 基础：`已完成`
- P0 编辑器交互升级：`进行中`
- P1 文档能力沉淀：`未开始`

当前建议下一步：

1. 继续实现“新增基础块类型”：分割线之外的 `Callout / 表格 / 折叠块`
2. 再进入图片块增强
3. 然后接附件块

## 0.1 已落地能力快照

当前 Note 已具备：

- 独立 Note 数据模型、Service、REST API、测试
- 结构化文档 JSON 主存储
- 服务端安全 HTML 渲染与摘要生成
- 基于 Tiptap / ProseMirror 的文档编辑器
- 标题、段落、无序列表、有序列表、任务列表、引用、代码块、分割线、图片
- slash command
- Markdown 风格快捷输入转换
- 选区浮动工具条
- 粘贴图片上传
- 图片上传中占位
- 图片失败保留卡片并支持重试

当前明确未做：

- 拖拽上传图片
- 图片块对齐、宽度、caption
- Callout / 表格 / 折叠块
- 附件块
- 代码块语言
- Markdown 导入导出
- NoteRevision

## 1. 目标

将当前基于 Tiptap / ProseMirror 的 Note 模块升级为更接近飞书文档体验的单人编辑器，重点补齐：

- 更自然的块编辑交互
- 更完整的内容块类型
- 更可靠的图片与附件体验
- 更好的 Markdown 兼容输入与输出
- 更清晰的文档版本与资源管理基础

本期明确不包含：

- 协同编辑
- 评论与批注
- 权限分享
- 在线多人 Presence
- 组织级文档系统能力

## 2. 实施原则

1. 继续使用现有技术底座：Next.js App Router、React、TypeScript、Tiptap、SQLite。
2. 文档主存储继续使用结构化 JSON，Markdown 作为输入输出兼容层，不作为唯一事实来源。
3. 尽量复用现有 `note-images` 与 `note-files` 上传链路，不额外建立第二套资源系统。
4. 先提升编辑器体验，再补块类型和文档基础设施，避免一次性扩展过宽。
5. 所有数据库与 API 修改继续遵守当前幂等升级策略与架构边界。

## 3. 范围分层

### 3.1 P0：优先做出飞书感

#### 3.1.1 Slash Command

状态：`已完成（第一版）`

目标：输入 `/` 后弹出块命令菜单，支持搜索和键盘选择。

首批命令：

- 正文
- 标题 1 / 2 / 3
- 无序列表
- 有序列表
- 任务列表
- 引用
- 代码块
- 分割线
- 图片
- Callout
- 表格
- 折叠块

交付物：

- Tiptap slash command extension
- 命令菜单 UI
- 命令项配置表

当前实现：

- 已在 [src/features/notes/note-editor.tsx](/D:/Code/TodoList/src/features/notes/note-editor.tsx) 内实现轻量命令菜单
- 已支持键盘 `↑ / ↓ / Enter / Esc`
- 已接入命令：
  - 正文
  - 标题 1 / 2 / 3
  - 无序列表
  - 有序列表
  - 任务列表
  - 引用
  - 代码块
  - 分割线
  - 图片

备注：

- 当前不是独立 extension，而是编辑器级逻辑；能用，但后续命令继续增多时可以考虑拆为 `slash-command.ts`
- `Callout / 表格 / 折叠块` 尚未接入 slash command，等对应块完成后补入

#### 3.1.2 Markdown 快捷输入转换

状态：`已完成（第一版）`

目标：支持常见 Markdown 输入后自动转换为结构化块。

首批规则：

- `# ` -> 标题 1
- `## ` -> 标题 2
- `### ` -> 标题 3
- `- ` -> 无序列表
- `1. ` -> 有序列表
- `[] ` 或 `[ ] ` -> 任务列表
- `> ` -> 引用
- ````` -> 代码块

交付物：

- input rules / markdown shortcuts 扩展
- 与工具栏和 slash command 行为一致的块转换逻辑

当前实现：

- 已在 [src/features/notes/note-editor.tsx](/D:/Code/TodoList/src/features/notes/note-editor.tsx) 的 `handleTextInput` 中显式实现
- 当前支持：
  - `# `
  - `## `
  - `### `
  - `- `
  - `1. `
  - `[] ` / `[ ] `
  - `[x] `
  - `> `
  - ````` ` / `~~~ `

备注：

- 目前实现方式不是单独的 Tiptap input rules extension，而是编辑器层快捷逻辑
- 如果后续继续扩大量 Markdown 快捷语法，建议迁移到独立扩展文件中统一管理

#### 3.1.3 选区浮动工具条

状态：`已完成（第一版）`

目标：选中文本时出现轻量浮动工具条，替代当前较弱的行内格式交互。

首批能力：

- 加粗
- 下划线
- 链接
- 行内代码
- 清除格式

交付物：

- bubble menu
- 链接编辑交互优化，不再依赖 `window.prompt`

当前实现：

- 使用 `@tiptap/react/menus` 的 `BubbleMenu`
- 当前支持：
  - 加粗
  - 下划线
  - 行内代码
  - 链接
  - 清除格式
- 链接已支持内嵌输入框，不再仅依赖 `window.prompt`

备注：

- 工具栏按钮仍保留原入口，bubble menu 是增强层
- 如后续做飞书感更强的交互，可再补：
  - 删除链接
  - 文本高亮
  - 行内注释
  - 更稳定的 selection 保持

#### 3.1.4 图片上传体验升级

状态：`进行中`

目标：在现有“可粘贴图片”的基础上提供完整反馈和更稳定的上传体验。

补齐能力：

- 上传占位块
- 上传中 loading
- 上传失败提示
- 重试上传
- 拖拽上传
- 多图连续上传
- 粘贴多张图时按顺序插入

交付物：

- 图片上传状态模型
- 编辑器内临时占位块或临时状态节点
- 失败态和重试 UI

当前实现：

- 保留“粘贴上传”
- 已完成：
  - 上传中 loading
  - 编辑区覆盖层
  - 本地预览占位卡片
  - 上传失败提示
  - 单张失败重试
  - 多图粘贴顺序插入
  - 同批图片部分成功、部分失败
- 当前占位 UI 在 [src/features/notes/note-editor.tsx](/D:/Code/TodoList/src/features/notes/note-editor.tsx) 中通过 `pendingImageUploads` 管理

调整：

- `拖拽上传` 已按最新产品方向取消，本期不做

剩余事项：

- 可以补“取消上传”能力，但不是当前阻塞项
- 可以补更细粒度进度条，但当前接口没有分段上传能力，优先级较低

技术备注：

- 当前失败占位卡片中保留 `File` 对象与 `previewUrl`，用于原位重试
- 成功项会立即插入正式图片节点，失败项留卡片，不会整批回滚
- 资源上传仍复用 `/api/note-images`

#### 3.1.5 新增基础块类型

状态：`进行中`

优先补齐以下常用块：

- 分割线
- Callout
- 表格
- 折叠块

交付物：

- 对应 extension 与 schema
- 工具栏或 slash command 接入
- 基础样式与渲染支持

当前实现：

- `分割线`：`已完成`
  - 已可通过 slash command 插入
  - 依赖 StarterKit 自带 `horizontalRule`
- `Callout`：`未开始`
- `表格`：`未开始`
- `折叠块`：`未开始`

建议下一步优先顺序：

1. `Callout`
2. `折叠块`
3. `表格`

备注：

- `Callout` 和 `折叠块` 更接近飞书文档常用块，优先级高于表格
- 表格实现成本更高，最好在前两者落地后再做

### 3.2 P1：把文档能力做扎实

#### 3.2.1 块拖拽排序

状态：`未开始`

目标：支持块级拖拽调整顺序。

首批覆盖：

- 段落
- 标题
- 列表
- 图片
- 引用
- 代码块
- Callout

交付物：

- 块级拖拽手柄 UI
- 拖拽排序交互
- 块级节点约束验证

#### 3.2.2 图片块增强

状态：`未开始`

目标：让图片从“能插入”升级为“可编辑的正式块”。

补齐能力：

- 图片选中态工具条
- 左对齐 / 居中
- 宽度预设
- 图片说明 caption
- 删除图片块
- 默认安全尺寸

交付物：

- image node attrs 扩展
- 图片工具条
- 对应渲染样式

技术备注：

- 当前图片节点只使用了 `src / alt / title`
- 如果进入这一项，优先把 attrs 扩成：
  - `align`
  - `width`
  - `caption`
- 服务端渲染安全白名单也要同步更新

#### 3.2.3 代码块增强

状态：`未开始`

目标：提升代码块表达能力，并为后续高亮预留。

补齐能力：

- 语言选择
- 语言标签展示
- 高亮扩展预留字段

交付物：

- `codeBlock.language` 属性
- 代码块语言选择 UI
- 服务端 HTML 输出兼容

#### 3.2.4 附件块

状态：`未开始`

目标：支持文档内插入附件，而不是只支持图片。

补齐能力：

- 上传允许的普通文件
- 附件卡片展示
- 文件名、大小、下载入口
- 与现有 `note-files` 对接

交付物：

- attachment node
- 附件上传与渲染 UI
- 服务端输出与 DTO 兼容

技术备注：

- 当前项目已有 `note-files` 上传链路，可直接复用
- 更建议做“结构化附件块”，不要退回成纯 HTML 附件列表

#### 3.2.5 Markdown 导入与导出

状态：`未开始`

目标：在结构化文档主存储前提下保留基础 Markdown 互通能力。

优先覆盖：

- 标题
- 段落
- 列表
- 任务列表
- 引用
- 代码块
- 图片
- 分割线

交付物：

- Markdown parser
- Markdown serializer
- 导入导出操作入口

#### 3.2.6 文档版本基础

状态：`未开始`

目标：不做协作历史，但建立单人编辑的版本恢复基础。

补齐能力：

- 每次保存保留最近 N 份版本快照
- 简单版本时间线
- 恢复到指定版本

交付物：

- `NoteRevision` 数据模型
- 保存时快照写入策略
- 恢复接口与基础 UI

## 4. 数据与架构改造项

### 4.1 文档模型扩展

状态：`进行中`

当前 `Note.content` 需要明确支持更多块与属性：

- `image`
- `horizontalRule`
- `table`
- `callout`
- `details` / `collapse`
- `attachment`
- `codeBlock.language`

当前已支持：

- `image`
- `horizontalRule`
- `heading`
- `paragraph`
- `bulletList`
- `orderedList`
- `taskList`
- `blockquote`
- `codeBlock`

当前实现位置：

- 编辑器扩展配置：[src/shared/note-document.ts](/D:/Code/TodoList/src/shared/note-document.ts)
- HTML 渲染与文本提取：[src/server/services/note-content-service.ts](/D:/Code/TodoList/src/server/services/note-content-service.ts)

下步提醒：

- 新增块类型时，要同时更新：
  - `src/shared/note-document.ts`
  - `src/server/services/note-content-service.ts`
  - 相关样式
  - Note 编辑器 UI
  - 测试与 API 文档

### 4.2 资源引用关系

状态：`未开始`

需要逐步明确：

- Note 当前引用了哪些图片
- Note 当前引用了哪些附件
- 删除 Note 后资源如何处理
- 孤儿资源如何回收

本期建议：

- 先建立软关联或可扫描关联能力
- 预留资源回收策略，不急着引入复杂自动 GC

当前备注：

- 目前图片和附件还是“资源独立上传 + 文档内引用 URL”模式
- 还没有做 Note 与资源的正式引用表
- 这意味着后续做资源回收时，需要先决定：
  - 扫描 `content` JSON
  - 还是新增 `NoteAssetRef` 关系表

### 4.3 文档版本模型

状态：`未开始`

建议新增：

```text
NoteRevision
- id
- noteId
- userId
- title
- content
- createdAt
```

### 4.4 API 粒度

状态：`已确认`

本期仍以整篇文档保存为主，不引入块级 patch API。

理由：

- 当前仍是单人编辑场景
- 整篇保存与现有 API 更一致
- 可以先把交互能力补齐，再决定是否需要细粒度增量更新

当前实现：

- Note 仍通过整篇 `title + content` 保存
- 自动保存与手动保存共用同一条更新 API

备注：

- 这对单人编辑足够稳定
- 在 `NoteRevision` 开始前，不建议提前切到 patch API

## 5. 实施阶段

### 阶段 1：编辑器交互升级

状态：`进行中`

范围：

- slash command
- markdown shortcuts
- bubble menu
- 图片上传占位与拖拽上传

当前完成度：

- slash command：`已完成`
- markdown shortcuts：`已完成`
- bubble menu：`已完成`
- 图片上传占位：`已完成`
- 图片失败重试：`已完成`
- 拖拽上传：`调整为不做`

目标：

先把编辑器的操作手感做得更接近飞书。

阶段结论：

- 当前阶段 1 实际上已基本完成
- 建议在下一会话中将阶段 1 标记为完成，并直接进入阶段 2

### 阶段 2：块类型补齐

状态：`下一阶段主任务`

范围：

- 分割线
- Callout
- 表格
- 折叠块
- 图片块增强
- 附件块

目标：

让常见文档内容可以被结构化表达并稳定渲染。

### 阶段 3：文档能力沉淀

状态：`未开始`

范围：

- 块拖拽排序
- 代码块语言
- Markdown 导入导出
- NoteRevision 快照与恢复

目标：

让文档具备更好的持续维护能力与后续扩展基础。

## 6. 验收标准

### 6.1 交互体验

- 输入 `/` 能插入主流块
- 常见 Markdown 输入能自动转为对应块
- 选中文本后出现浮动工具条
- 图片粘贴与拖拽上传有明确 loading、失败与重试反馈

当前备注：

- 除“拖拽上传”外，其余项当前均已达成
- 本文档中的“拖拽上传”应视为过期项，后续请按“粘贴上传 + 占位 + 重试”验收

### 6.2 内容表达

- 支持标题、段落、列表、任务列表、引用、代码块
- 支持分割线、Callout、表格、折叠块
- 支持图片块与附件块

当前备注：

- 当前仅 `分割线` 与 `图片块` 达成
- `Callout / 表格 / 折叠块 / 附件块` 仍是下一阶段主目标

### 6.3 数据可靠性

- 数据库存储继续以结构化 JSON 为主
- 图片、附件与 Note 内容存在可追踪关联
- 保存后支持恢复最近版本

### 6.4 兼容性

- 支持基础 Markdown 导入导出
- 旧 Note 数据仍可被读取与迁移

### 6.5 工程稳定性

- schema、DTO、Route Handler、Service、测试、文档同步更新
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

全部通过

## 7. 推荐开发顺序

状态更新：

- 1 已完成
- 2 已完成
- 3 已完成
- 4 已完成（按“粘贴上传 + 占位 + 重试”，不含拖拽上传）
- 5 为当前下一步

建议按以下顺序推进：

1. slash command
2. markdown shortcuts
3. bubble menu
4. 图片上传占位与拖拽上传
5. 分割线 / Callout / 表格 / 折叠块
6. 图片块增强
7. 附件块
8. 块拖拽排序
9. 代码块语言
10. Markdown 导入导出
11. NoteRevision

这样可以先快速提升用户体感，再逐步补齐块类型与底层能力。

## 8. 当前实现文件索引

为便于新会话快速接手，当前 Note 相关核心文件如下：

- 页面入口：
  - [src/app/(app)/notes/page.tsx](/D:/Code/TodoList/src/app/(app)/notes/page.tsx)
- Note 主页面：
  - [src/features/notes/note-page.tsx](/D:/Code/TodoList/src/features/notes/note-page.tsx)
- Note 编辑器：
  - [src/features/notes/note-editor.tsx](/D:/Code/TodoList/src/features/notes/note-editor.tsx)
- Note API 前端封装：
  - [src/features/notes/note-api.ts](/D:/Code/TodoList/src/features/notes/note-api.ts)
- 文档扩展定义：
  - [src/shared/note-document.ts](/D:/Code/TodoList/src/shared/note-document.ts)
- Note schema：
  - [src/shared/schemas/note.ts](/D:/Code/TodoList/src/shared/schemas/note.ts)
- Note Service：
  - [src/server/services/note-service.ts](/D:/Code/TodoList/src/server/services/note-service.ts)
- 文档 HTML / 文本转换：
  - [src/server/services/note-content-service.ts](/D:/Code/TodoList/src/server/services/note-content-service.ts)
- 数据库：
  - [src/server/db.ts](/D:/Code/TodoList/src/server/db.ts)
- 样式：
  - [src/app/styles/components.css](/D:/Code/TodoList/src/app/styles/components.css)

## 9. 新会话接手建议

如果在新会话中继续执行，建议直接从下面这段开始：

1. 阅读本计划书
2. 阅读：
   - [src/shared/note-document.ts](/D:/Code/TodoList/src/shared/note-document.ts)
   - [src/features/notes/note-editor.tsx](/D:/Code/TodoList/src/features/notes/note-editor.tsx)
   - [src/server/services/note-content-service.ts](/D:/Code/TodoList/src/server/services/note-content-service.ts)
3. 直接进入“3.1.5 新增基础块类型”
4. 优先顺序：`Callout -> 折叠块 -> 表格`

不要重复做的事情：

- 不要再尝试把 Note 改回 Markdown textarea
- 不要引入第二套图片上传系统
- 不要把拖拽上传重新加入当前计划
- 不要把保存 API 提前改成块级 patch API
