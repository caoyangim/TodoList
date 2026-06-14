# TodoFlow REST API

所有接口与前端同域，不配置 CORS。除登录接口外均要求有效的
`todoflow_session` HttpOnly Cookie；业务资源只对其所属用户可见。

## 1. 通用约定

成功：

```json
{
  "data": {}
}
```

失败：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "输入内容不正确",
    "fields": {
      "title": ["请输入 Todo 标题"]
    }
  }
}
```

状态码：

| 状态码 | 用途 |
|---|---|
| `200` | 查询或更新成功 |
| `201` | 创建成功 |
| `204` | 删除成功 |
| `400` | 输入校验失败 |
| `401` | 未登录或登录凭证无效 |
| `403` | 无权限或需要先修改临时密码 |
| `404` | 资源不存在 |
| `409` | 唯一约束或业务状态冲突 |
| `500` | 未处理的服务端错误 |

所有时间为 ISO 8601 UTC 字符串或 `null`。

## 2. 认证与账号

```text
POST  /api/auth/login
POST  /api/auth/logout
GET   /api/auth/me
PATCH /api/auth/password
```

登录提交 `{ "username": "...", "password": "..." }`。临时密码首次登录后必须修改，
修改成功会撤销该用户所有会话。会话有效期为 90 天，活跃使用时续期。

管理员账号接口：

```text
GET   /api/admin/users
POST  /api/admin/users
PATCH /api/admin/users/:id
```

管理员可创建账号、重置临时密码和启停账号；不提供公开注册或永久删除。

## 3. Todo

### 查询列表

```http
GET /api/todos?status=pending|resolved|completed|all
```

默认 `pending`。

### 创建

```http
POST /api/todos
Content-Type: application/json
```

```json
{
  "title": "完成发布",
  "description": "发布并验证",
  "timePriority": "HIGH",
  "importancePriority": "MEDIUM",
  "dueAt": "2026-06-13T12:00:00.000Z"
}
```

### 查询、编辑和删除

```text
GET    /api/todos/:id
PATCH  /api/todos/:id
DELETE /api/todos/:id
```

### 更新状态

```http
PATCH /api/todos/:id/completion
```

```json
{
  "status": "RESOLVED"
}
```

从“已解决”进入“已完成”时，可选携带验证报告：

```json
{
  "status": "COMPLETED",
  "verificationReport": {
    "html": "<p>已完成回归验证</p>",
    "fileIds": ["file-id"]
  }
}
```

### 更新 Todo 备注

```http
PATCH /api/todos/:id/note
```

```json
{
  "note": {
    "html": "<p>查看 <a href=\"https://example.com\">发布文档</a></p>",
    "fileIds": ["file-id"]
  }
}
```

- Todo 备注与 SOP 节点备注使用相同的富文本、链接白名单和图片规则。
- 正文和图片都为空，或提交 `null`，会清空备注。
- 更新备注不改变 Todo 状态。

## 4. SOP 模板

```text
GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PUT    /api/templates/:id
DELETE /api/templates/:id
```

创建和更新均提交完整节点数组：

```json
{
  "name": "APP 发布",
  "description": "发布流程",
  "nodes": [
    {
      "id": "parent-client-id",
      "name": "发布阶段",
      "description": null,
      "sortOrder": 1,
      "isRequired": true,
      "parentId": null
    },
    {
      "id": "child-client-id",
      "name": "发布市场",
      "description": null,
      "sortOrder": 2,
      "isRequired": false,
      "parentId": "parent-client-id"
    }
  ]
}
```

客户端 ID只用于本次请求中表达父子关系。服务端保存时会生成新 ID 并重新映射。

常见冲突：

- `TEMPLATE_IN_USE`：模板已有执行记录，不能删除。

## 5. SOP 执行

### 查询

```text
GET /api/runs
GET /api/runs/:id
```

执行 DTO 包含：

- 模板快照。
- `NOT_STARTED | IN_PROGRESS | COMPLETED` 状态。
- 完成目标节点进度；存在必选叶子时排除可选叶子。
- 必选节点进度。
- 节点父子关系和时间字段。
- `archivedAt` 归档时间。

### 创建

```http
POST /api/runs
```

```json
{
  "templateId": "template-id",
  "title": "Android 6 月正式版发布",
  "version": "1.0.0"
}
```

`title` 必填，最长 100 个字符。`version` 为可选字段，允许为空，也不会因为与同模板下其他执行记录重复而拦截创建。

常见冲突：

- `TEMPLATE_EMPTY`：模板没有节点。

### 归档、恢复和删除

```text
PATCH  /api/runs/:id
DELETE /api/runs/:id
```

归档或恢复请求：

```json
{
  "archived": true
}
```

`archived: false` 表示恢复。删除成功返回 `204`，执行节点随执行实例级联删除。

修改执行标题同样使用 `PATCH /api/runs/:id`：

```json
{
  "title": "Android 6 月补丁版发布"
}
```

### 更新节点完成状态

```http
PATCH /api/runs/:id/nodes/:nodeId/completion
```

```json
{
  "completed": true
}
```

该接口返回重新计算后的完整执行 DTO。

常见冲突：

- `PARENT_NODE_READ_ONLY`：尝试直接修改父节点。

### 更新节点备注

```http
PATCH /api/runs/:id/nodes/:nodeId/note
```

```json
  {
    "note": {
      "html": "<p>已核对<strong>日志</strong>，查看 <a href=\"https://example.com\">详情</a></p>",
      "imageIds": ["image-id"]
    }
  }
```

- 父节点和叶子节点都支持备注。
- 正文使用经过服务端白名单清洗的 HTML，支持段落、加粗、斜体、下划线、删除线、
  列表、引用、代码和链接。
- 链接仅允许 `http`、`https` 和 `mailto` 协议，并统一在新窗口打开。
- 正文可见文字最多 2000 个字符，每条备注最多 10 张图片。
- 正文和图片都为空，或提交 `null`，会清空备注。
- 该接口返回更新后的完整执行 DTO，不改变节点完成状态和进度。

### 备注图片

```text
POST   /api/note-images
GET    /api/note-images/:id
DELETE /api/note-images/:id
```

上传使用 `multipart/form-data`，文件字段名为 `file`。支持 PNG、JPEG、WebP 和 GIF，
单张图片最大 5 MB。上传成功返回可写入备注 `imageIds` 的图片 DTO。
