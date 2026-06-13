# TodoFlow REST API

所有接口与前端同域，不配置 CORS。

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
| `404` | 资源不存在 |
| `409` | 唯一约束或业务状态冲突 |
| `500` | 未处理的服务端错误 |

所有时间为 ISO 8601 UTC 字符串或 `null`。

## 2. Todo

### 查询列表

```http
GET /api/todos?status=pending|completed|all
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
  "priority": "HIGH",
  "dueAt": "2026-06-13T12:00:00.000Z"
}
```

### 查询、编辑和删除

```text
GET    /api/todos/:id
PATCH  /api/todos/:id
DELETE /api/todos/:id
```

### 完成或恢复

```http
PATCH /api/todos/:id/completion
```

```json
{
  "completed": true
}
```

## 3. SOP 模板

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

## 4. SOP 执行

### 查询

```text
GET /api/runs
GET /api/runs/:id
```

执行 DTO 包含：

- 模板快照。
- `NOT_STARTED | IN_PROGRESS | COMPLETED` 状态。
- 叶子节点进度。
- 必选节点进度。
- 节点父子关系和时间字段。

### 创建

```http
POST /api/runs
```

```json
{
  "templateId": "template-id",
  "version": "1.0.0"
}
```

常见冲突：

- `TEMPLATE_EMPTY`：模板没有节点。
- `VERSION_EXISTS`：同一模板版本号重复。

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
