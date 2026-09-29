# 领域模型

版本：V0.1  
原则：领域模块拥有数据和业务规则，Agent 只能通过领域服务访问它们。

## 1. 聚合边界

| 聚合 | 主要对象 | 首期职责 |
|---|---|---|
| Identity | User、Session、Device | 登录、会话、设备和通知设置 |
| Planning | Task、CalendarEvent、Reminder | 待办、日程、提醒 |
| Health | HealthRecord、HealthProfile、Advice | 健康上传、生活方式建议 |
| Finance | Expense、Category、Budget | 手动记账、分类和统计 |
| Conversation | Conversation、Message、AgentRun | 对话、工具调用和结果 |
| Approval | ApprovalRequest、AuditLog | 写入确认和行为追踪 |
| Mini App | MiniApp、UserMiniAppSetting | 小应用注册和配置 |
| Ticketing | TicketTask、TicketPreference、ConnectorState | 后续票务能力预留，首期不执行真实购票 |

## 2. 公共字段规则

所有持久化业务对象至少包含：

- `id`：不可变、服务端生成。
- `user_id`：服务端从当前会话获取，不接受客户端随意指定。
- `created_at`、`updated_at`：UTC 时间。
- `source`：`manual`、`upload`、`agent_draft`、`connector` 之一。
- `deleted_at`：需要软删除的对象使用，最终删除由数据治理任务完成。

时间规则：数据库保存 UTC；用户界面按用户时区显示；日期类健康记录必须同时保存用户本地日期，避免跨时区错位。

## 3. 核心对象

### Task

- `title`
- `notes`
- `status`: `todo`、`done`、`cancelled`
- `due_at`
- `reminder_at`
- `source`

### CalendarEvent

- `title`
- `start_at`
- `end_at`
- `location`
- `notes`
- `source`

首期只维护内部日程，外部日历连接器作为后续能力。

### HealthRecord

健康记录采用“指标 + 数值/文本 + 记录日期”的可扩展结构，首期指标包括：

- `steps`
- `sleep`
- `water`
- `weight`
- `exercise`
- `diet_note`

每条记录应保存单位、来源、原始导入批次和用户本地日期。健康建议只能读取经过校验的记录。

### HealthProfile

用于生成更合适建议的用户主动填写信息：

- 身高、体重、年龄等基础信息。
- 饮食目标。
- 过敏源和忌口。
- 运动偏好、限制和可用时间。

这些字段属于敏感信息，必须单独展示授权和删除入口。没有填写时，Agent 使用保守的通用建议，不推断缺失信息。

### Expense

- `amount_minor`：最小货币单位整数，禁止使用浮点金额。
- `currency`
- `occurred_on`
- `category_id`
- `merchant`
- `note`
- `source`

首期只允许手动创建和编辑。月度统计由服务端计算，不接受客户端提交的汇总结果。

### Advice

建议不是健康或财务事实记录，必须保存：

- `domain`
- `content`
- `evidence_range`
- `input_snapshot_hash`
- `disclaimer`
- `status`: `generated`、`dismissed`、`saved`

## 4. 导入流程

```text
上传文件 -> 病毒/类型检查 -> 解析 -> 字段映射 -> 预览 -> 用户确认 -> 幂等写入 -> 导入报告
```

导入必须具备：

- 文件大小和格式限制。
- 失败行定位。
- 重复导入检测。
- 导入批次 ID。
- 用户确认前不写入正式业务表。
- 原始文件按数据保留策略过期删除。

## 5. 状态和幂等

- 外部或异步任务都要有明确状态，不用字符串消息推断状态。
- 创建任务、导入确认和审批执行必须支持幂等键。
- Worker 重试不能产生重复提醒、重复记录或重复审批结果。
- 已完成或已拒绝的审批不能再次执行。
