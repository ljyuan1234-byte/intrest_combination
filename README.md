# Personal Life Assistant

个人云端生活助手的初始 monorepo。当前阶段以产品、架构和安全文档设定为主，代码暂不继续扩展。

## 当前状态

- `apps/web`：Next.js Web 首页，展示个人仪表盘骨架。
- `apps/api`：Fastify API，提供健康检查和临时仪表盘数据。
- `apps/mobile`：Expo Android 客户端最小入口，共享仪表盘契约。
- `packages/contracts`：Zod API 契约，供 Web/API 共享。
- `docker-compose.yml`：PostgreSQL 和 Redis 本地开发依赖。
- Android App、真实数据库、Agent 和抢票连接器尚未接入。
- `docs/`：产品需求、领域模型、Agent 权限、数据治理、Mini App 和路线图。

## 文档入口

从 [`docs/00-overview.md`](docs/00-overview.md) 开始阅读，文档目录说明见 [`docs/README.md`](docs/README.md)。

推荐顺序：

1. [完整开发交付总览](docs/00-overview.md)
2. [产品需求](docs/01-product-requirements.md)
3. [数据库设计](docs/05-database-schema.md)
4. [API 规范](docs/06-api-specification.md)
5. [Agent 规范](docs/11-agent-specification.md)
6. [票务 Runner 规范](docs/13-ticketing-runner-specification.md)

## 开发

需要 Node.js 20+ 和 pnpm 9+。

```bash
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm dev
```

打开 `http://localhost:3000`。API 地址为 `http://localhost:4000/health`。

## 后续开发顺序

代码恢复开发前，先完成 `docs/roadmap-and-decisions.md` 中的 Phase 0 评审，然后按照文档顺序执行：

1. 用户和数据隔离。
2. 待办、健康、财务领域模型。
3. 文件上传和通知基础设施。
4. 只读 Agent 和建议卡片。
5. Mini App 容器。
