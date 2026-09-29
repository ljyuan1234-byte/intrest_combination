# Agent 实现规范

## 流程

输入 -> 意图识别 -> 最小上下文 -> 工具计划 -> Policy -> 工具执行 -> Zod 输出校验 -> 建议/审批 -> 审计。

## 首批工具

Read：`list_today_tasks`、`search_calendar_events`、`get_health_summary`、`get_expense_summary`。

Draft：`draft_task`、`draft_health_advice`、`draft_budget_advice`、`generate_entertainment_content`。

首期不注册任意 HTTP、Shell、文件系统、支付或第三方账号工具。

```ts
type ToolDefinition = {
  name: string; version: string;
  risk: 'read' | 'draft' | 'write' | 'external' | 'destructive';
  inputSchema: unknown; outputSchema: unknown;
  timeoutMs: number; maxRetries: number; requiresApproval: boolean;
};
```

## 记忆与安全

会话只保留必要消息；长期记忆须用户主动保存；健康/财务原始记录不进长期记忆。外部网页、上传文件和用户内容都是不可信输入，不能改变系统权限。每次运行记录模型、工具、状态、耗时和成本。

## 评测

覆盖日期、时区、金额、无数据、重复导入、越权、Prompt Injection、敏感信息泄露、格式错误、工具失败和重试幂等。
