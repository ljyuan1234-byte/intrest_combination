# 纯 Web 架构与腾讯云 PostgreSQL 部署

状态：当前实施方向。运行中的产品只保留 **Web + API + PostgreSQL**，PC 和手机浏览器共用同一套 Web 页面。

## 1. 目标架构

```text
浏览器 / 手机浏览器 / PWA
        │
        ▼
   Caddy（HTTPS、反向代理）
     ├── /api/*  ──►  Fastify API :4000
     └── /       ──►  Next.js Web :3000
                          │
                          ▼
              腾讯云 PostgreSQL（外部实例）
```

- 不再有原生 App 构建，所有客户端统一为 Web/PWA。
- Web 端使用 HttpOnly Cookie 会话。
- 数据库使用腾讯云 PostgreSQL 16，连接串与 SSL 通过环境变量配置。
- 生产使用 Docker Compose：`api`、`web`、`caddy` 三个容器；数据库不放在容器里。

## 2. 腾讯云数据库选型

当前代码使用 Drizzle + `pg`，**必须使用 PostgreSQL**，不能直接换成 MySQL。

生产推荐腾讯云 PostgreSQL；如果只有 CVM，也可以使用 [`deploy/docker-compose.db.yml`](../deploy/docker-compose.db.yml) 启动 PostgreSQL 16 容器，步骤见 [`deploy/README.md`](../deploy/README.md) 5.1 节。容器数据库需要自己备份 volume，适合个人测试或低成本单机。

如果买的是 MySQL/TDSQL-C MySQL，需要重写：

- 全部 Drizzle schema；
- 10 个 SQL 迁移；
- 所有查询与 `bigint`、`jsonb`、`timestamp with time zone` 的写法；
- 迁移执行器。

建议购买：

- **TencentDB for PostgreSQL 16**
- 与 CVM/Lighthouse 同地域、同 VPC
- 开启 SSL
- 设置业务账号，不要使用高权限账号
- 按量或包年包月按预算选择

## 3. 创建数据库与账号

在腾讯云控制台完成：

1. 创建 PostgreSQL 16 实例。
2. 创建数据库 `life_assistant`。
3. 创建业务账号 `life`，设置强密码。
4. 在“安全组/访问控制”中只允许应用服务器私网 IP。
5. 开启 SSL，下载 CA 证书（可选）。
6. 记录私网地址、端口、数据库名、账号、密码。

连接串示例：

```text
postgresql://life:password@10.0.0.12:5432/life_assistant?sslmode=require
```

> 腾讯云 PostgreSQL 默认会限制最大连接数。`DATABASE_POOL_MAX` 建议从 10 开始；多副本部署时按 `实例最大连接数 / 副本数` 估算，必要时使用腾讯云数据库代理。

## 4. 环境变量

生产环境复制：

```bash
cp deploy/env.production.example deploy/.env.production
```

关键项：

```dotenv
NODE_ENV=production
API_PORT=4000
DOMAIN=life.example.com
APP_ORIGIN=https://life.example.com
NEXT_PUBLIC_API_URL=

DATABASE_URL=postgresql://life:password@10.0.0.12:5432/life_assistant?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
# DATABASE_SSL_CA=/run/secrets/tencentdb-ca.pem
DATABASE_POOL_MAX=10

SESSION_SECRET=至少32字符随机值
```

说明：

- `NEXT_PUBLIC_API_URL` 留空时，浏览器请求同域 `/api/v1/*`，由 Caddy 转发到 API。
- `DATABASE_SSL=true` 时 API 使用 SSL 连接；如果实例证书未被系统信任，先设 `DATABASE_SSL_REJECT_UNAUTHORIZED=false`。
- `SESSION_SECRET` 可用 `openssl rand -base64 48` 生成。

## 5. 账号密码认证

当前认证已改为**邮箱或手机号 + 密码**：

- `POST /api/v1/auth/register`：注册并直接建立 Cookie 会话；
- `POST /api/v1/auth/login`：邮箱/手机号 + 密码登录；
- 密码使用 Node 内置 scrypt 哈希，数据库只保存哈希；
- 登录失败按 IP + 标识符限流；
- 邮箱统一小写，中国大陆 11 位手机号自动归一化为 `+86...`。

不再需要一次性凭证、邮件 Webhook 或 `AUTH_DEV_MODE`。

后续如需“邮箱/短信验证”或“找回密码”，建议单独实现验证码/重置令牌流程，不要恢复明文或可预测的凭证。

## 6. 执行数据库迁移

推荐用 API 镜像自带的迁移器，在 CVM 上执行，不要求服务器安装 Node：

```bash
cd /opt/life-assistant/deploy
docker compose --env-file .env.production run --rm api \
  pnpm --filter @life/database migrate
```

如果镜像里找不到 `tsx`，再在能访问腾讯云数据库的机器上执行：

```bash
cd /path/to/project
export DATABASE_URL='postgresql://life:password@10.0.0.12:5432/life_assistant?sslmode=require'
export DATABASE_SSL=true
export DATABASE_SSL_REJECT_UNAUTHORIZED=false

corepack pnpm install
corepack pnpm --filter @life/database migrate
```

迁移器会：

- 创建 `__life_migrations`；
- 使用 `pg_advisory_xact_lock` 防止并发执行；
- 按 `0000` 到 `0009` 顺序执行，已执行的会跳过。

从本地迁移数据到腾讯云时，优先在空库上跑迁移，再用 `pg_dump` / `pg_restore` 导入业务数据；不要直接复制本地 `postgresql.conf`。

## 7. 部署到 CVM / Lighthouse

完整步骤见 [`deploy/README.md`](../deploy/README.md)。

### 7.1 安装 Docker

在 Ubuntu/Debian 上安装 Docker Engine 与 Compose 插件，确认：

```bash
docker --version
docker compose version
```

### 7.2 上传代码

```bash
git clone <your-repo> /opt/life-assistant
cd /opt/life-assistant
# 生产环境变量在 7.3 中创建
```

### 7.3 构建、迁移和启动

```bash
cd /opt/life-assistant/deploy
cp env.production.example .env.production
# 编辑 .env.production

docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm api \
  pnpm --filter @life/database migrate
docker compose --env-file .env.production up -d
docker compose --env-file .env.production logs -f api
```

不要先 `up -d` 再迁移：新 API 可能在表结构未更新时启动并报错。

Caddy 会自动为 `DOMAIN` 申请 HTTPS 证书。前提：

- 域名 A 记录已指向服务器公网 IP；
- 安全组放行 80/443；
- 中国大陆服务器域名需要完成 ICP 备案。

### 7.4 健康检查

```bash
curl https://life.example.com/health
# {"status":"ok"}
```

## 8. PWA 与手机浏览器

Web 端已加入：

- `manifest.webmanifest`；
- 主题色与 viewport；
- 极简 service worker（只用于安装，不缓存私人数据）；
- 手机底部导航。

手机浏览器访问站点后，可通过“添加到主屏幕”作为 PWA 使用。它不是原生 App，不需要应用商店、签名或原生构建。

## 9. 运维清单

- **备份**：开启腾讯云自动备份，定期验证恢复。
- **连接数**：监控数据库连接数，调整 `DATABASE_POOL_MAX`。
- **日志**：`docker compose logs`；生产建议接入腾讯云 CLS。
- **监控**：腾讯云数据库监控 + 服务器基础监控 + `/health` 拨测。
- **安全组**：只开放 80/443；SSH 限制来源 IP；数据库只对应用服务器私网开放。
- **密钥**：`deploy/.env.production` 不提交；定期轮换 `SESSION_SECRET`。
- **迁移**：每次发布前先跑迁移，再滚动重启 API。

## 10. 当前边界

已完成：

- Web-only 工作区；
- 待办、日程、提醒、健康、财务、数据导出/删除；
- Cookie 会话、审计、幂等；
- 腾讯云 PostgreSQL SSL/连接池配置；
- Docker + Caddy 生产部署文件；
- PWA 基础能力。

尚未完成：

- 邮箱/短信验证与密码找回流程；
- 提醒的实际投递 Worker；
- 健康文件导入；
- Agent、Mini App、票务 Runner；
- 自动化测试与 CI。
