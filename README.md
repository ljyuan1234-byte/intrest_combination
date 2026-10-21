# Personal Life Assistant

个人云端生活助手的 TypeScript monorepo，当前方向是 **纯 Web + API + 腾讯云 PostgreSQL**。PC 和手机浏览器共用同一套 Web 页面与 PWA。

## 当前状态

- `apps/web`：Next.js 15 Web 客户端，包含登录、仪表盘、待办、日程提醒、健康、财务和数据治理页面。
- `apps/api`：Fastify 5 API，提供 Cookie 会话认证、业务接口、审计和健康检查。
- `packages/contracts`：Zod API 契约，Web 与 API 共用。
- `packages/database`：Drizzle Schema、PostgreSQL 连接池和 9 个版本化迁移。
- `deploy/`：腾讯云 CVM/Lighthouse 的 Docker Compose、Caddy、API/Web 镜像和生产环境模板。
- `docs/22-web-only-and-tencent-cloud.md`：纯 Web 架构与腾讯云 PostgreSQL 部署说明。
- Web 端已加入 PWA manifest、手机底部导航和移动浏览器适配。

## 已实现功能

### 身份与会话

- 邮箱或手机号 + 密码注册/登录，注册后自动建立会话。
- 密码使用 Node 内置 scrypt 哈希，数据库只保存哈希；登录失败按 IP + 标识符限流。
- 会话 Cookie：`HttpOnly`、`SameSite=Lax`，生产环境启用 `Secure`。
- `GET/PATCH /api/v1/me`、设备撤销、退出登录。
- 请求 ID、统一 `{ data, requestId }` / `{ error, requestId }` 响应结构。

### 待办

- `tasks` 表、软删除、状态 `todo/done/cancelled`。
- `GET/POST /api/v1/tasks`、`PATCH/DELETE /api/v1/tasks/:id`。
- 创建支持 `Idempotency-Key`。
- Web `/tasks` 支持创建、完成/恢复、取消和删除。

### 日程与提醒

- `calendar_events`、`reminders` 表及迁移 `0004_phase_2_calendar`。
- 日程 CRUD、关联/独立提醒、取消提醒。
- 删除日程会取消其关联提醒。
- 提醒的实际推送 Worker 尚未接入。

### 健康

- `health_records`、`health_profiles` 表及迁移 `0003`、`0005`。
- 支持步数、睡眠、饮水、体重、锻炼和饮食备注。
- `GET /api/v1/health/advice` 仅基于当天手动记录，始终包含非医疗免责声明。
- Web `/health` 支持记录、健康档案和近期记录。

### 健康规划 Agent

- 新增 `health_intake_logs` 表和迁移 `0006_phase_3_health_agent`，食物库覆盖常见主食、外卖、食堂和家常菜。
- 输入饮食文本和饮水量，解析食物、份量并估算热量、蛋白质、碳水、脂肪；同一天多次提交会累加。
- 支持 `wellness`（养生）和 `fat_loss`（减脂）两种模式。
- 结合身高、体重、出生年份、性别和活动量计算 BMR、TDEE、BMI 与目标热量；体重/睡眠/运动记录会参与计划调整。
- 生成今日分析、明天计划、未来 7 天计划和 12 周长期计划。
- Web `/health/agent` 提供结构化输入和完整计划；`/health/chat` 提供自然语言对话。
- 对话支持意图分类、Plan-and-Execute、对话切片 RAG 和执行步骤展示。
- 可选接入 OpenAI 兼容模型（`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`），模型只负责追问和解释，热量计算仍由确定性工具完成。
- RAG 支持词法检索，并可选接入独立 embedding 服务（`EMBEDDING_*`）做向量 + 词法混合检索；推荐 Qwen `text-embedding-v4`，DeepSeek 官方暂不提供 embedding。
- 详细设计见 [`docs/23-health-agent.md`](docs/23-health-agent.md) 和 [`docs/24-health-agent-rag-and-prompting.md`](docs/24-health-agent-rag-and-prompting.md)。

### 财务

- `expense_categories`、`expenses` 表及迁移 `0002`。
- 金额使用 `bigint amount_minor`，拒绝零、负数和浮点金额。
- 分类创建、消费 CRUD、按月/分类汇总。
- 创建消费支持 `Idempotency-Key`。
- Web `/finance` 支持分类、手动记账和月度汇总。

### 数据治理

- `GET /api/v1/me/export` 导出当前用户数据，不包含会话凭证。
- `POST /api/v1/me/delete-account` 软删除账户并撤销全部会话。
- Web `/settings/data` 支持下载 JSON 和确认删除账户。

## 本地开发

前置要求：Node.js 22.9+、Corepack、Docker Desktop（或本地 PostgreSQL 16）。

> 首次拉取后请先运行 `corepack pnpm install` 更新 `pnpm-lock.yaml`，不要使用 `--frozen-lockfile`。

最方便的本地启动方式是双击根目录的 [`start-local.cmd`](start-local.cmd)。它会自动检查 `.env`、启动本地 PostgreSQL、执行迁移、启动 API/Web 并打开浏览器。

也可以手动执行：

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

如果启动时报 `EADDRINUSE: address already in use 0.0.0.0:4000`，说明上一次的 API 还在运行：

```powershell
netstat -ano | findstr :4000
Stop-Process -Id <PID> -Force
```

然后重新执行 `corepack pnpm dev`。正常时同一个终端里应同时看到：

```text
apps/api dev: Server listening at http://127.0.0.1:4000
apps/web dev: ✓ Ready in ...
```

手机浏览器访问时，需要把 `.env` 中的地址改成电脑局域网 IP，并重启 dev：

```dotenv
NEXT_PUBLIC_API_URL=http://192.168.2.17:4000
APP_ORIGIN=http://192.168.2.17:3000
```

同时确保 Windows 防火墙允许 3000 和 4000 端口。

本地 `.env` 至少保留：

```dotenv
SESSION_SECRET=至少32字符的随机值
```

登录流程：

1. 打开 `/login`，切到“注册”。
2. 输入邮箱或手机号，设置至少 8 位密码。
3. 注册成功后会自动建立 Session Cookie 并进入仪表盘。
4. 之后使用同一邮箱/手机号和密码登录。

手机号会自动归一化：大陆 11 位手机号补 `+86`，邮箱统一小写。同一个输入框两种都支持。

## 腾讯云 PostgreSQL

购买 **TencentDB for PostgreSQL 16**，不要买 MySQL 版本；当前 schema 和迁移都是 PostgreSQL 方言。

生产连接示例：

```dotenv
DATABASE_URL=postgresql://life:password@10.0.0.12:5432/life_assistant?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_POOL_MAX=10
```

迁移：

```powershell
$env:DATABASE_URL='postgresql://life:password@10.0.0.12:5432/life_assistant?sslmode=require'
$env:DATABASE_SSL='true'
$env:DATABASE_SSL_REJECT_UNAUTHORIZED='false'
corepack pnpm --filter @life/database migrate
```

完整步骤见 [`docs/22-web-only-and-tencent-cloud.md`](docs/22-web-only-and-tencent-cloud.md)。

## 生产部署

```bash
cd deploy
cp env.production.example .env.production
# 编辑 .env.production
docker compose --env-file .env.production up -d --build
```

Caddy 会自动为 `DOMAIN` 申请 HTTPS 证书，并把 `/api/*` 转发到 API、其余请求转发到 Web。数据库使用腾讯云外部实例，不放在 Compose 中。

## 常用命令

```powershell
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --filter @life/database migrate
corepack pnpm --filter @life/api dev
corepack pnpm --filter @life/web dev
```

## 文档入口

推荐顺序：

1. [完整开发交付总览](docs/00-overview.md)
2. [产品需求](docs/01-product-requirements.md)
3. [数据库设计](docs/05-database-schema.md)
4. [API 规范](docs/06-api-specification.md)
5. [认证与权限](docs/07-auth-and-permissions.md)
6. [纯 Web 与腾讯云 PostgreSQL](docs/22-web-only-and-tencent-cloud.md)
7. [健康规划 Agent](docs/23-health-agent.md)
8. [健康 Agent 对话、RAG 与 Prompt](docs/24-health-agent-rag-and-prompting.md)

## 后续开发顺序

1. 可选：邮箱/短信验证、密码找回与异常登录提醒。
2. 补充自动化测试与 CI。
3. 实现提醒 Worker 与 Web Push。
4. 健康文件导入预览与确认。
5. 受控 Agent、建议卡片、审批与审计。
6. Mini App 容器与娱乐模块。
7. 逐平台评估票务 Runner。
