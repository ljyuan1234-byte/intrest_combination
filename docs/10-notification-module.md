# 通知模块

## 渠道

Web 使用 Web Push；不把微信作为依赖。提醒 Worker 与推送订阅在后续阶段接入。

## 设备

授权后提交平台、Token、版本和时区；Token 变更即更新；退出或撤销设备即失效。

## 类型

`task_reminder`、`calendar_reminder`、`daily_summary`、`health_advice`、`approval_required`、`ticketing_status`。

通知不包含完整健康或财务敏感内容，详情回到认证页面。提醒使用业务对象+计划时间幂等；失败有限重试，无效 Token 标记设备失效。
