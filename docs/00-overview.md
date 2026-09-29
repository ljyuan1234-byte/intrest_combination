# 个人云端生活助手开发交付总览

版本：V1.0；状态：开发交接基线。

## 已确认决策

- 首期用户为个人，数据模型保留 `user_id`。
- 客户端为 Android App + 桌面浏览器 Web。
- 云端托管；通知使用 Android 推送和 Web Push，不依赖微信。
- 健康数据由用户手动录入或上传，包含步数、睡眠、饮水、体重、锻炼和饮食记录。
- 财务首期只做手动记账、分类和统计。
- Agent 首期只读和建议；写入必须用户审批。
- Mini App 首期使用内置注册表和统一容器，不执行任意第三方代码。
- 票务长期覆盖 12306 和大麦等平台的 Web/Android 页面辅助操作；操作在用户设备本地执行，云端不代管登录态。
- 不读取 Cookie、Token、密码库或支付密钥，不绕过验证码、风控、登录保护或支付流程。

## 交付文档

| 文件 | 内容 |
|---|---|
| [01-product-requirements.md](./01-product-requirements.md) | 产品范围、优先级、验收 |
| [02-user-flows.md](./02-user-flows.md) | 用户流程和异常分支 |
| [03-information-architecture.md](./03-information-architecture.md) | 页面、路由、客户端结构 |
| [04-domain-and-business-rules.md](./04-domain-and-business-rules.md) | 领域对象、状态、业务规则 |
| [05-database-schema.md](./05-database-schema.md) | 数据库表、字段和约束 |
| [06-api-specification.md](./06-api-specification.md) | API、请求、响应和错误码 |
| [07-auth-and-permissions.md](./07-auth-and-permissions.md) | 认证、会话、权限和审批 |
| [08-health-module.md](./08-health-module.md) | 健康字段、上传和建议 |
| [09-finance-module.md](./09-finance-module.md) | 记账、分类和统计 |
| [10-notification-module.md](./10-notification-module.md) | Android/Web 通知和提醒 |
| [11-agent-specification.md](./11-agent-specification.md) | Agent 模型、工具和评测 |
| [12-mini-app-specification.md](./12-mini-app-specification.md) | Mini App 容器和生命周期 |
| [13-ticketing-runner-specification.md](./13-ticketing-runner-specification.md) | 12306/大麦本地 Runner |
| [14-security-and-data-governance.md](./14-security-and-data-governance.md) | 数据安全、保留和审计 |
| [15-deployment-and-operations.md](./15-deployment-and-operations.md) | 环境、部署、备份和监控 |
| [16-testing-guide.md](./16-testing-guide.md) | 测试层级和发布门槛 |
| [17-development-workflow.md](./17-development-workflow.md) | 任务、分支、评审和完成标准 |
| [18-roadmap-and-decisions.md](./18-roadmap-and-decisions.md) | 阶段路线和 ADR |

## 技术基线

pnpm workspace、Next.js、Expo React Native、Fastify、PostgreSQL、Drizzle、Redis/BullMQ、S3、Zod。首期采用模块化单体：API、Worker、数据库、Web 和 Android。客户端使用轮询或 SSE，不优先上 WebSocket。

## 开发顺序

Phase 0 文档冻结 -> Phase 1 认证/数据库/文件/通知 -> Phase 2 任务/健康/财务 -> Phase 3 受控 Agent -> Phase 4 Mini App -> Phase 5 逐平台票务 Runner。
