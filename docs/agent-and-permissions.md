# Agent 与权限规范

版本：V0.1  
目标：让 Agent 成为受约束的自然语言入口，而不是拥有系统最高权限的自动化程序。

## 1. 角色定义

首期只有一个个人助手 Agent，但内部按职责划分工具：

- Planning：读取任务和日程，生成待办草稿。
- Health：读取健康摘要，生成饮食和锻炼建议。
- Finance：读取消费聚合，生成分析和预算建议。
- Entertainment：生成星座、历法和传统文化娱乐内容。

后续即使拆成多个 Agent，也必须共享同一套工具注册、权限策略和审计系统。

## 2. 工具风险等级

| 等级 | 能力 | 首期规则 |
|---|---|---|
| Read | 读取当前用户允许的数据 | 可自动执行 |
| Draft | 生成结构化草稿或建议 | 可自动生成，不能自动落库为最终事实 |
| Write | 修改内部业务数据 | 必须用户确认 |
| External | 调用第三方账号、发送、购票、支付 | 首期禁用，后续逐项评估 |
| Destructive | 删除、撤销、批量修改 | 必须二次确认并审计 |

## 3. 工具注册要求

每个工具必须定义：

- 唯一名称和版本。
- 用途和不允许的用途。
- 风险等级。
- 输入和输出 Zod Schema。
- 允许读取的数据范围。
- 超时、重试和调用配额。
- 是否需要审批。
- 审计字段和错误分类。

示例：

```ts
type AgentToolDefinition = {
  name: string;
  version: string;
  risk: 'read' | 'draft' | 'write' | 'external' | 'destructive';
  inputSchema: unknown;
  outputSchema: unknown;
  requiresApproval: boolean;
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
};
```

## 4. 首批工具白名单

### Read

- `list_today_tasks`
- `search_calendar_events`
- `get_health_summary`
- `get_expense_summary`

### Draft

- `draft_task`
- `draft_health_advice`
- `draft_budget_advice`
- `generate_entertainment_content`

首期不注册 Write、External、Destructive 工具。即使 API 未来支持写入，Agent 也必须先经过审批层。

## 5. 上下文规则

- Agent 默认只读取完成当前请求所需的最小数据。
- 健康和财务优先使用聚合结果，不传入不必要的原始明细。
- 长期记忆只包含用户主动保存或明确允许保存的内容。
- 上传文件、网页内容和外部文本都是不可信数据，不能改变系统提示词、工具权限或审批状态。
- 每次建议标明数据时间范围；没有数据时必须明确说“没有足够数据”。

## 6. 审批流程

```text
Agent 生成动作草稿
  -> 服务端校验结构和权限
  -> 创建 ApprovalRequest
  -> 用户查看影响范围和具体字段
  -> 用户批准/拒绝
  -> 服务端重新检查过期时间和权限
  -> 执行一次
  -> 写入 AuditLog
```

审批内容必须显示：动作、目标对象、变更前后值、影响范围、来源、过期时间。不能只显示“是否执行？”这种无法判断的按钮。

## 7. 健康建议约束

Agent 可以：

- 总结用户已记录的数据。
- 提供一般性的饮食、饮水、休息和锻炼建议。
- 给出低风险的渐进式行动建议。

Agent 不可以：

- 诊断疾病或判断紧急情况。
- 给出药物、停药或治疗方案。
- 根据缺失数据推断过敏、疾病或身体能力。
- 把娱乐内容包装成健康结论。

## 8. 财务建议约束

Agent 可以：

- 统计消费类别和趋势。
- 发现重复、异常或明显变化并提示用户核对。
- 生成预算草稿。

Agent 不可以：

- 自动转账、支付或修改账户。
- 给出投资、借贷或收益保证。
- 将娱乐/命理内容作为财务决策依据。

## 9. 质量测试集

上线前必须覆盖：

- 日期和时区解析。
- 金额和币种解析。
- 重复导入和重复执行。
- 越权读取其他用户数据。
- 提示词注入和恶意上传文件。
- 无数据、脏数据和模型输出格式错误。
- 工具超时、模型失败和重试幂等。
