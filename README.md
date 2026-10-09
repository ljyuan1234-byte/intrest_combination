# Personal Life Assistant

个人云端生活助手的 TypeScript monorepo。目前已进入 **Phase 1 基础设施开发**：提供 PostgreSQL 身份模型、无密码会话认证、审计记录和受保护的 Web 仪表盘入口。

## 当前状态

- `apps/web`：Next.js Web 客户端，包含登录页与通过会话 Cookie 保护的仪表盘。
- `apps/api`：Fastify API，提供健康检查、认证、个人资料、设备撤销、受保护仪表盘和审计基础。
- `apps/mobile`：Expo Android 最小入口，共享仪表盘契约；认证 UI 尚未接入。
- `packages/contracts`：Zod API 契约，供 Web/API/Mobile 共用。
- `packages/database`：Drizzle Schema、PostgreSQL 连接与 Phase 1 SQL 迁移。
- `docker-compose.yml`：本地 PostgreSQL 16 与 Redis 7。
- `docs/19-phase-1-implementation.md`：当前 Phase 1 实施边界、认证策略和验收项。
- 待办、财务（手动记账）、健康（手动记录）、日程/提醒和数据治理已进入 Phase 2；文件上传、实际通知投递、Agent、Mini App 和票务 Runner 仍在后续阶段。

## Phase 1 已实现

- `users`、`login_challenges`、`sessions`、`devices`、`audit_logs` 表结构。
- 数据库迁移记录表 `__life_migrations`，迁移可重复执行。
- 邮箱一次性凭证模型：
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/verify`
  - `POST /api/v1/auth/logout`
- 会话 Cookie：`HttpOnly`、`SameSite=Lax`，生产环境启用 `Secure`。
- `GET/PATCH /api/v1/me`、`GET/DELETE /api/v1/me/devices/:id`。
- `/api/v1/dashboard` 要求已认证会话。
- 请求 ID、统一 `{ data, requestId }` / `{ error, requestId }` 响应结构，以及认证/设备/资料更新审计。
- 开发环境的凭证仅写入 API 结构化日志，绝不返回给浏览器；生产环境未配置邮件服务时拒绝创建凭证。

## Phase 2：待办最小闭环

- 新增 `tasks` 表，记录用户归属、标题、状态、截止时间、完成时间及软删除时间。
- 新增 `idempotency_keys` 表；创建待办可携带 `Idempotency-Key`，重复请求返回首次创建结果。
- 提供受会话保护且按当前用户过滤的待办接口：
  - `GET /api/v1/tasks`
  - `POST /api/v1/tasks`
  - `PATCH /api/v1/tasks/:id`
  - `DELETE /api/v1/tasks/:id`
- 待办状态支持 `todo`、`done`、`cancelled`；完成可恢复为待办。
- Web 端新增 `/tasks`，支持创建、完成/恢复、取消与软删除；首页“管理待办”可进入该页面。
- 受保护仪表盘从数据库实时计算当前用户的待办总数与已完成数量。

## Phase 2：财务最小闭环

- 新增 `expense_categories` 和 `expenses` 表，以及 `0002_phase_2_finance` 版本化迁移。
- 金额使用 `bigint amount_minor` 存储最小货币单位，数据库与 API 同时拒绝零、负数和浮点金额。
- 支持创建自定义消费分类，以及消费记录的创建、查询、更新、软删除。
- 创建消费支持 `Idempotency-Key`，避免网络重试产生重复账目。
- 提供按月、按分类汇总接口：`GET /api/v1/finance/summary?month=YYYY-MM`。
- Web 端新增 `/finance`：创建分类、手动记账、按月查看消费总额与明细。
- 首页显示当前月份的真实消费累计。

## Phase 2：健康手动记录

- 新增 `health_records` 表和 `0003_phase_2_health` 版本化迁移，按用户和本地日期隔离、索引记录。
- 支持记录步数、睡眠、饮水、体重、锻炼及饮食备注；服务端和数据库共同校验指标、单位与数值/文本形态。
- 提供健康记录查询、创建和软删除接口，以及 `GET /api/v1/health/advice`。
- 建议仅基于当前用户当天的手动记录，始终包含非医疗免责声明；不提供诊断、处方、停药或紧急情况判断。
- Web 端新增 `/health`：记录健康指标或饮食备注、查看近期记录和今日生活方式提示。
- 首页健康状态与建议已由当天真实健康记录驱动。

## Phase 2：健康档案

- 新增 `health_profiles` 表及 `0005_phase_2_health_profile` 版本化迁移，每个用户至多保存一份主动维护的档案。
- 档案可包含身高、出生年份、目标、过敏源、饮食偏好/忌口、运动限制和可用时间；字段均为可选，且只由当前用户自己读取和更新。
- 提供 `GET/PUT /api/v1/health/profile`，更新操作写入审计日志。
- `/health` 支持展开、编辑和保存档案；健康建议仅在用户主动保存档案后，显示目标或运动限制等有限上下文。
- 健康建议仍明确标注为非医疗生活方式提示，不提供诊断、处方、停药或紧急情况判断。
- 用户数据导出现在包含健康档案，方便用户查看和迁移自己的主动填写信息。

## Phase 2：日程与提醒

- 新增 `calendar_events`、`reminders` 表及 `0004_phase_2_calendar` 版本化迁移。
- 日程支持创建、查询、更新、软删除；开始/结束时间使用 UTC 存储，结束时间不得早于开始时间。
- 提醒支持关联日程或独立创建，支持查询和取消；创建操作可使用 `Idempotency-Key` 并按用户隔离。
- 删除日程时会取消其关联提醒；提醒投递由后续 Worker、Android 推送或 Web Push 接入，本阶段不发送任何通知内容。
- Web 端新增 `/calendar`：管理日程、创建独立/关联提醒、取消提醒。
- 首页新增“日程提醒”入口。

## Phase 2：数据治理

- 提供 `GET /api/v1/me/export`，仅导出当前用户可访问的资料、待办、日程、提醒、健康记录和财务记录；会话 Token、Cookie 与认证凭证不会被导出。
- 每次导出均写入最小化审计日志。
- 提供 `POST /api/v1/me/delete-account`，请求体必须包含 `{ "confirmation": "DELETE" }`。
- 删除账户会软删除用户、撤销该用户所有会话并清除当前 Cookie；历史业务记录保留在数据库中以支持受控恢复和审计，但不再通过已删除账户访问。
- Web 端新增 `/settings/data`，可下载 JSON 数据导出文件，或显式确认删除账户。

## 本地开发

前置要求：Node.js 20+、Docker Desktop、Corepack（Node 已内置）。

```powershell
corepack pnpm install
Copy-Item .env.example .env
docker compose up -d
corepack pnpm --filter @life/database migrate
corepack pnpm dev
```

打开：

- Web：`http://localhost:3000/login`
- API 健康检查：`http://localhost:4000/health`

本地 `.env` 中必须保留：

```dotenv
AUTH_DEV_MODE=true
SESSION_SECRET=至少32字符的随机值
```

登录演示流程：

1. 在 `/login` 提交邮箱。
2. 查看 API 终端日志中的 `development_login_challenge` 事件。
3. 复制日志中的 `token`，粘贴回登录页的“一次性凭证”字段。
4. 验证后浏览器获得 Session Cookie，并跳转至仪表盘。

`AUTH_DEV_MODE=true` 只能用于本地开发。生产环境必须配置真实邮件投递服务，并设置 `AUTH_DEV_MODE=false`。

## 常用命令

```powershell
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --filter @life/database migrate
corepack pnpm --filter @life/api dev
corepack pnpm --filter @life/web dev
```

## 文档入口

从 [`docs/00-overview.md`](docs/00-overview.md) 开始阅读。Phase 1 当前实施细节见 [`docs/19-phase-1-implementation.md`](docs/19-phase-1-implementation.md)，后续服务端与 Android MVP 路线见 [`docs/20-next-development-guide.md`](docs/20-next-development-guide.md)。

推荐顺序：

1. [完整开发交付总览](docs/00-overview.md)
2. [产品需求](docs/01-product-requirements.md)
3. [数据库设计](docs/05-database-schema.md)
4. [API 规范](docs/06-api-specification.md)
5. [认证与权限](docs/07-auth-and-permissions.md)
6. [Phase 1 实施基线](docs/19-phase-1-implementation.md)
7. [后续开发与 Android MVP 指南](docs/20-next-development-guide.md)

## 后续开发顺序

1. Phase 1：补齐邮件投递、设备登记、对象存储和通知基础设施。
2. Phase 2：继续实现健康数据文件上传预览、提醒 Worker/推送投递与真实数据恢复/清理流程。
3. Phase 3：受控 Agent、建议卡片、审批与审计。
4. Phase 4：Mini App 容器和娱乐模块。
5. Phase 5：逐平台评估本地票务 Runner。
