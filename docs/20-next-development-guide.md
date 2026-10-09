# 后续开发指南与 Android MVP 计划

状态：实施规划。本文基于当前已完成的 Web/API Phase 1 和 Phase 2 基线，定义下一阶段的依赖顺序、验收标准、Android 开发边界和上线前验证步骤。

> 当前重要事实：本仓库的 Web 已具备认证、待办、日程/提醒计划、健康、财务和数据治理页面；Android 仍仅是早期演示入口，且还请求已经不再适合客户端使用的旧仪表盘路径。因此 Android 不能直接堆叠页面，必须先补齐移动认证与共享 API 客户端基础。

## 1. 当前实现基线

### 已完成

| 层级 | 已有能力 |
|---|---|
| API | 无密码登录挑战、Cookie 会话、用户隔离、审计、待办、日程、提醒计划、健康记录/档案、财务、导出和账户软删除 |
| Database | 从 `0000` 到 `0005` 的版本化 PostgreSQL 迁移 |
| Web | 登录、首页、待办、日程提醒、健康、财务、数据与账户页面 |
| Contracts | Zod 契约覆盖仪表盘、任务、日程、提醒、健康记录/档案、财务 |
| Mobile | Expo 最小演示页面；尚未接入认证、真实业务模块或移动会话机制 |
| 验证 | TypeScript 类型检查和 API/Web 生产构建通过；尚未执行 Docker/PostgreSQL 迁移及真实 E2E 验证 |

### 尚未完成

- Docker/PostgreSQL 的迁移运行、真实数据库集成测试。
- 邮件投递器、生产 Magic Link、移动端认证深链和 Android 安全存储。
- Android MVP 正式页面与导航。
- 提醒 Worker、FCM/Web Push 投递、设备 Token 登记。
- 健康 CSV/JSON 上传、解析预览、确认导入。
- Worker、对象存储、备份恢复演练和限流。
- Agent、审批、Mini App、票务 Runner。

## 2. 推荐开发顺序

必须遵守以下顺序，避免把不稳定的服务端契约提前复制到移动端。

```text
A. 真实数据库验证
   -> B. 移动认证与 API 基础
   -> C. Android 核心领域 MVP
   -> D. 提醒 Worker 与推送
   -> E. 健康导入 / 数据恢复
   -> F. Agent 与审批
```

### A. 真实数据库验证（必须先做）

在可用 Docker 的电脑执行：

```powershell
Copy-Item .env.example .env
docker compose up -d
corepack pnpm --filter @life/database migrate
corepack pnpm dev
```

验收项：

1. 空数据库按顺序执行 `0000` 至 `0005`。
2. 再次执行迁移不产生错误或重复表。
3. Web 登录成功，Cookie 会话可读取 `/api/v1/me`。
4. 同一用户可创建、更新、删除待办、消费、健康记录、日程和提醒。
5. 两个不同用户之间不能读取或修改对方资源。
6. 同一 `Idempotency-Key` 重试待办、消费、提醒创建，不产生重复记录。
7. 数据导出仅包含当前用户数据；账户删除后所有会话失效。
8. 健康档案更新后建议仍带非医疗免责声明。

此阶段未通过时，不开始正式 Android 领域页面开发。

## 3. Android MVP 范围

Android 首版目标不是完全复刻 Web，而是建立手机优先的高频闭环：

| 优先级 | 页面/能力 | MVP 操作 |
|---|---|---|
| P0 | 登录 | 请求登录挑战、消费验证凭证、持久化移动会话 |
| P0 | 首页 | 今日待办统计、健康状态、月度消费、快捷入口 |
| P0 | 待办 | 列表、创建、完成/恢复、取消、删除 |
| P0 | 健康 | 新增记录、查看建议、编辑健康档案 |
| P0 | 财务 | 新增消费、分类管理、查看本月累计 |
| P0 | 日程 | 新建/查看日程、创建/取消提醒 |
| P0 | 设置 | 数据导出请求、会话退出、账户删除入口 |
| P1 | 推送 | 设备登记、权限、通知点击后的路由 |
| P1 | 健康导入 | 选择文件、上传、预览、确认 |
| P2 | Agent / Mini App | 在 Web 和 API 的 Policy/审批稳定后再接入 |

首版 Android 不做：

- 不保存 Web Cookie、浏览器 Token、第三方密码或支付凭证。
- 不实现真实抢票、无障碍自动化、验证码处理或支付。
- 不将 L2 健康/财务内容放进通知正文。
- 不在无真实设备和 API 验证的情况下接入 FCM。
- 不复制 Web 的所有表单；优先完成一次操作只需少量输入的场景。

## 4. Android 架构决策

### 4.1 路由和状态

建议将当前单文件 `App.tsx` 迁移为 Expo Router 或显式 React Navigation 结构。当前 `package.json` 已声明 `expo-router/entry`，但项目尚未建立对应路由目录；应在编码前统一入口。

推荐目录：

```text
apps/mobile/
  app/
    _layout.tsx
    index.tsx
    login.tsx
    tasks.tsx
    health.tsx
    finance.tsx
    calendar.tsx
    settings/
      index.tsx
      data.tsx
  src/
    api/
      client.ts
      contracts.ts
    auth/
      session-store.ts
      auth-context.tsx
    components/
    features/
      tasks/
      health/
      finance/
      calendar/
    theme/
```

底部导航固定为：首页、待办、健康、财务、设置。日程可从首页或设置进入。

### 4.2 移动认证不能直接复用 Web Cookie

当前 API 使用 Web `HttpOnly` Cookie，对浏览器安全合理，但 Expo 原生 Fetch 对 Cookie 持久化和跨应用会话的行为不应作为移动认证基础。

在 Android 开发前，需要扩展 API 的移动会话方案：

1. 登录请求仍以邮箱挑战为入口。
2. Android 通过深链或手动粘贴一次性 code 验证。
3. API 对移动验证结果签发短生命周期 access token 和可轮换 refresh token，或设备绑定会话 token。
4. Android 将 Token 保存在 `expo-secure-store`，不放 AsyncStorage。
5. API 请求使用 `Authorization: Bearer <access-token>`。
6. Refresh Token 只存哈希，并支持单设备撤销。
7. Web Cookie 与 Android Bearer Token 使用相同的当前用户解析层，但不要互相共享凭证。

新增前必须更新：
- `docs/07-auth-and-permissions.md`
- API 契约
- `sessions` / `devices` 或新增 `mobile_sessions` 表迁移
- 登录、刷新、退出、设备撤销的集成测试。

### 4.3 共享 API 客户端

Mobile 不应散落 `fetch()` 调用。建立一个客户端统一处理：

- API 基址（Android Emulator、实体机、生产环境）。
- `Authorization` 头和刷新逻辑。
- 标准 `{ data, requestId }` / `{ error, requestId }` 响应。
- `401` 会话失效转登录。
- 超时、离线错误、有限重试。
- 写操作传递 `Idempotency-Key`。
- Zod 对成功响应作运行时校验。
- 日志不打印 Authorization、健康备注或消费明细。

## 5. Android 实施里程碑

### M1：认证和应用骨架

目标：用户可以在 Android 真机或模拟器登录，并获得持久化、可退出的移动会话。

任务：

- 配置 Expo Router/导航入口。
- 增加 `expo-secure-store`、深链 Scheme 和环境变量。
- 实现移动登录挑战、验证、Token 刷新、退出。
- 增加 Auth Context 和受保护路由。
- 首页先只请求 `/api/v1/dashboard`。
- 处理加载、断网、`401`、服务端错误。

验收：
- 重启 App 后仍保持登录。
- 退出或 API 撤销设备后必须回到登录页。
- Token 不在控制台、AsyncStorage 或页面状态中泄露。

### M2：任务和首页

目标：手机上在 1 分钟内创建和完成待办。

任务：

- 待办列表、创建页、完成/恢复、删除。
- 创建请求生成 UUID 幂等键。
- 首页显示真实待办完成数据。
- 下拉刷新和空状态。

验收：
- Web 与 Android 使用同一用户数据，刷新后一致。
- 连续点击或网络重试不创建重复待办。
- 越权资源 ID 不能被客户端读取或修改。

### M3：健康和财务

目标：完成最常用的健康手动记录与消费记账。

任务：

- 健康记录、健康档案、今日建议和免责声明。
- 财务分类、消费创建、本月汇总。
- 小数金额仅在 UI 输入，提交前严格转换为 `amountMinor` 整数。
- 健康/财务页面在离线时显示明确提示，不伪造成功。

验收：
- 消费金额不出现浮点精度误差。
- 健康建议不包含诊断或处方。
- 健康档案和消费详情不显示在系统通知或普通日志中。

### M4：日程、提醒与设备登记

目标：用户可以管理提醒计划并让 Worker/推送负责后续投递。

前置依赖：Worker、Redis、通知供应商和设备 Token API 已实现。

任务：

- 日程与提醒页面。
- Android 通知权限请求。
- FCM Token 上报、更新、撤销。
- 通知点击深链到对应任务、日程或健康页面。
- 不在推送正文携带完整健康、财务或敏感备注。

验收：
- 同一提醒计划时间不会重复投递。
- 撤销设备后不再投递。
- Worker 失败可有限重试且有审计/监控。

## 6. 服务端后续工作

### 6.1 Worker 与推送

建议新建：

```text
apps/worker/
packages/notifications/
```

Worker 负责：
- 扫描到期 `reminders`；
- 建立幂等投递记录；
- FCM/Web Push 发送；
- 重试与失效 Token 处理；
- 每日摘要；
- 后续健康导入解析和 Agent 长任务。

不要把定时任务放在 Web 或 API 请求处理进程中。

### 6.2 健康文件导入

实现顺序：

```text
上传 -> 文件大小/类型校验 -> 私有存储
-> 异步解析 -> 预览错误行和映射
-> 用户确认 -> 事务写入健康记录
-> 导入报告
```

安全要求：
- CSV/JSON 一律视为不可信文本。
- 不执行文件中的任何内容。
- 失败或取消禁止生成半条正式健康记录。
- 原始文件使用私有对象键、短期签名 URL 和保留周期。
- 相同用户、日期、指标和来源批次需要重复检测。

### 6.3 数据恢复和删除清理

账户软删除目前已完成，下一步需要：

- 管理员/离线受控恢复策略（不暴露给普通用户 UI）。
- 清理任务：按保留周期物理清除已删除账户及关联数据。
- 导出数据结构版本号。
- 备份、恢复演练和删除请求审计。
- 发生删除前的确认和独立测试集。

## 7. 推荐的下一轮任务拆分

建议按以下 Git 分支/任务推进：

1. `feat/database-integration-tests`
   - Docker 迁移、数据库集成测试、用户隔离/幂等覆盖。
2. `feat/mobile-auth-foundation`
   - API 移动 Session + Expo 安全存储 + 登录/退出。
3. `feat/mobile-core-modules`
   - 首页、待办、健康、财务、日程客户端。
4. `feat/notification-worker`
   - Worker、设备 Token、FCM/Web Push。
5. `feat/health-import-preview`
   - 对象存储、文件上传、预览确认。
6. `feat/agent-foundation`
   - 白名单工具、Policy、审批、审计和评测。

## 8. 每项任务的完成标准

任何下一轮功能在合并前必须满足：

- 契约、数据库迁移、API 和页面同步更新。
- 所有业务查询按当前用户过滤。
- 正常、空、加载、失败、权限失效状态已实现。
- 金额、日期、时区、幂等和软删除有测试。
- 健康和财务日志不包含敏感原文。
- 写操作有必要的审计。
- `corepack pnpm typecheck` 与 `corepack pnpm build` 通过。
- 在 Docker 可用环境执行迁移和关键 E2E 流程。
