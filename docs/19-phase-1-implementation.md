# Phase 1 实施基线

状态：进行中。本文把路线图中的 Phase 1 细化为可交付、可验证的工程边界；不会替代既有产品与安全规范。

## 本阶段目标

建立后续领域功能共用的安全基础：

1. 使用无密码会话认证，不保存用户密码。
2. 所有 API 从会话确定当前用户，禁止客户端提交任意 `userId`。
3. 引入 PostgreSQL、Drizzle 版本化迁移和基础用户/会话/设备/审计表。
4. 统一环境变量校验、请求 ID、错误响应和审计记录。
5. 提供 Web 登录入口、退出操作和当前用户状态展示。
6. 预留对象存储与通知的配置边界；不在未选定供应商前接入真实外部服务。

## 认证策略

生产实现采用“邮箱一次性登录链接”接口模型：

- `POST /api/v1/auth/login` 为邮箱生成一次性登录挑战。
- 开发环境没有邮件供应商时，API 将短期一次性代码输出到结构化开发日志，绝不返回给客户端。
- 生产环境必须配置邮件投递器；缺失配置时拒绝生成登录链接。
- `POST /api/v1/auth/verify` 消费一次性令牌，创建数据库会话，并写入 HttpOnly、Secure（生产）、SameSite=Lax Cookie。
- 数据库存储随机令牌的 SHA-256 哈希，明文令牌只存在于验证请求期间。
- `POST /api/v1/auth/logout` 撤销当前会话并清除 Cookie。
- `GET /api/v1/me` 返回经过认证的用户基础资料。
- 登录、退出和认证失败全部写入最小化审计记录。

首期不提供密码登录、社交登录或客户端传入的用户身份。

## 数据访问与隔离约束

- 每个领域查询均由 `AuthenticatedRequestContext.userId` 派生数据范围。
- 用户资源读取、更新与删除须在 SQL `where` 中同时匹配资源 ID 和 `userId`。
- API 不接受 `userId` 作为业务写入请求字段。
- 数据库迁移放在 `packages/database/drizzle/`；生产变更先备份并在临时库验收。
- 当前 Phase 1 先创建 `users`、`sessions`、`devices` 和 `audit_logs`，并为 Phase 2 领域表保留统一时间字段规范。

## API 基线

所有 `/api/v1` 响应遵循：

```json
{ "data": {}, "requestId": "req_xxx" }
```

错误遵循：

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "需要登录"
  },
  "requestId": "req_xxx"
}
```

请求 ID 在每个请求入口生成或继承 `x-request-id`，并写入响应头。错误日志不记录 Cookie、原始 Magic Link Token、健康/财务原文或连接凭据。

## 环境变量

必需变量：

- `DATABASE_URL`
- `SESSION_SECRET`：至少 32 个随机字符
- `APP_ORIGIN`
- `API_PORT`

按环境启用：

- `AUTH_DEV_MODE=true`：仅允许本地开发环境输出一次性登录代码。
- `SMTP_URL`、`AUTH_EMAIL_FROM`：生产邮件投递所需。
- `REDIS_URL`：Worker 和通知功能接入前保留。
- `OBJECT_STORAGE_*`：对象存储接入前保留。

`.env.example` 只包含占位值，绝不包含真实密钥。

## 验收标准

- 未登录请求受保护接口返回 `401 UNAUTHENTICATED`。
- 有效验证令牌仅能消费一次；过期或重复消费失败。
- 退出后的 Cookie 对应会话不可再访问受保护接口。
- 登录、退出、设备撤销可在 `audit_logs` 中追踪，但不记录明文令牌。
- 数据库迁移可以从空 PostgreSQL 实例执行。
- `pnpm typecheck`、构建和认证 API 集成测试通过。
