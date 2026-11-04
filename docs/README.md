# 项目文档导航

本目录是个人云端生活助手的产品和工程规范中心。当前产品方向是 **纯 Web + API + 腾讯云 PostgreSQL**。

- 完整交付入口：[`00-overview.md`](./00-overview.md)
- 纯 Web 与腾讯云部署：[`22-web-only-and-tencent-cloud.md`](./22-web-only-and-tencent-cloud.md)

## 文档地图

| 文档 | 用途 |
|---|---|
| [00-overview.md](./00-overview.md) | 交付总览、技术基线与阶段 |
| [01-product-requirements.md](./01-product-requirements.md) | 产品范围、MVP 与明确不做的事情 |
| [05-database-schema.md](./05-database-schema.md) | 数据库表、字段和约束 |
| [06-api-specification.md](./06-api-specification.md) | API、响应和错误码 |
| [07-auth-and-permissions.md](./07-auth-and-permissions.md) | Cookie 会话、权限与审批 |
| [14-security-and-data-governance.md](./14-security-and-data-governance.md) | 数据分级、导出、删除与审计 |
| [19-phase-1-implementation.md](./19-phase-1-implementation.md) | Phase 1 实施基线 |
| [22-web-only-and-tencent-cloud.md](./22-web-only-and-tencent-cloud.md) | Web-only 架构、腾讯云 PostgreSQL、Docker/Caddy 部署 |
| [deploy/README.md](../deploy/README.md) | 腾讯云 Docker 部署、迁移、更新与回滚步骤 |
| [23-health-agent.md](./23-health-agent.md) | 健康规划 Agent、双模式、食物解析与安全边界 |
| [24-health-agent-rag-and-prompting.md](./24-health-agent-rag-and-prompting.md) | 对话、RAG 切片记忆、Plan-and-Execute 与 Prompt 工程 |
| [agent-and-permissions.md](./agent-and-permissions.md) | Agent 工具目录与风险等级 |
| [data-governance.md](./data-governance.md) | 数据生命周期与用户权利 |
| [domain-model.md](./domain-model.md) | 领域对象与业务规则 |
| [mini-apps-and-ticketing.md](./mini-apps-and-ticketing.md) | Mini App 与票务演进 |
| [roadmap-and-decisions.md](./roadmap-and-decisions.md) | 阶段路线与 ADR |

## 当前阶段

当前处于 **Phase 2 功能已落地、准备 Web 生产部署** 的阶段：

- 待办、日程提醒、健康、财务、数据导出/删除已实现；
- 健康 Agent 支持饮食累加、体重/睡眠/运动联动、对话、RAG 与 Plan-and-Execute；
- 身份认证使用邮箱/手机号 + 密码，密码 scrypt 哈希，会话使用 HttpOnly Cookie；
- 数据库目标为腾讯云 PostgreSQL 16；
- 生产部署使用 Docker Compose + Caddy；
- 提醒 Worker、邮箱/短信验证、密码找回和自动化测试仍在后续阶段。

## 文档变更规则

- 产品范围、权限、安全和数据模型变化时，先更新文档，再修改代码。
- 新增 Agent 工具必须同时更新工具目录、权限等级和审计要求。
- 新增敏感数据必须更新数据分级、保存期限和删除策略。
- 重大架构选择记录在决策记录中，不依赖聊天记录作为唯一依据。
- 文档版本使用 `V主版本.次版本`：范围变化升主版本，澄清和补充升次版本。
