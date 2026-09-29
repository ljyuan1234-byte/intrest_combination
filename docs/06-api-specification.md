# API 规范

前缀：`/api/v1`。JSON camelCase；时间 ISO 8601 UTC；金额整数；用户身份从会话获取；写请求支持 `Idempotency-Key`；响应带 `requestId`。

## 响应

```json
{ "data": {}, "requestId": "req_123" }
```

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "请求参数无效", "fields": {} }, "requestId": "req_123" }
```

## 接口

- Auth：`POST /auth/login`、`POST /auth/logout`、`GET/PATCH /me`、`GET /me/devices`、`DELETE /me/devices/:id`。
- Dashboard：`GET /dashboard`。
- Tasks：`GET/POST /tasks`、`PATCH/DELETE /tasks/:id`；日程同样提供 events CRUD。
- Health：records/profile/advice CRUD；`POST /health/imports`；`POST /health/imports/:id/confirm`。
- Finance：categories CRUD；expenses CRUD；`GET /finance/summary?month=YYYY-MM`。
- Agent：创建会话、发送消息、查询 run；审批列表、approve、reject。
- Data/Mini App：导出、删除账户、应用列表、应用设置。
- Ticketing：偏好、任务创建/启动/停止/查询、Runner 注册/心跳。

## 错误码

`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_ERROR`、`CONFLICT`、`IDEMPOTENCY_REPLAY`、`IMPORT_FAILED`、`APPROVAL_EXPIRED`、`TOOL_NOT_ALLOWED`、`RATE_LIMITED`、`DEPENDENCY_UNAVAILABLE`。
