# 数据库设计

数据库：PostgreSQL 16+。所有业务表包含 `id`、`user_id`、时间字段和必要的 `deleted_at`。

## 表清单

- Identity：`users`、`sessions`、`devices`。
- Planning：`tasks`、`calendar_events`、`reminders`。
- Health：`health_profiles`、`health_records`、`health_advice`。
- Finance：`expense_categories`、`expenses`、`budgets`。
- Agent：`conversations`、`conversation_messages`、`agent_runs`、`approval_requests`、`audit_logs`。
- Import/Mini App：`imports`、`mini_apps`、`user_mini_app_settings`。
- Ticketing：`ticket_tasks`、`ticket_preferences`、`ticket_runners`。

## 关键字段

`health_records`：`metric`、`value_number`、`value_text`、`unit`、`local_date`、`recorded_at`、`source`、`import_id`。

`expenses`：`amount_minor`、`currency`、`occurred_on`、`category_id`、`merchant`、`note`、`source`。

`approval_requests`：`action_type`、`payload_json`、`status`、`expires_at`、`approved_at`、`executed_at`。

`ticket_tasks`：`platform`、`surface`、`criteria_json`、`status`、`runner_id`、`expires_at`。

## 约束

按 `user_id` 建索引；`sessions.token_hash`、`reminders.idempotency_key` 唯一；健康按用户/指标/本地日期索引；消费按用户/日期索引。JSON 必须先 Schema 校验。所有结构变化使用版本化迁移，生产迁移前备份和演练。
