# 领域与业务规则

## 聚合

Identity、Planning、Health、Finance、Conversation、Approval、MiniApp、Ticketing。只能通过领域服务修改，客户端不能直接写库。

## 公共规则

所有业务表带 `user_id`；ID/时间由服务端生成；数据库 UTC，健康日期另存用户本地日期；删除采用软删除+异步清理；异步任务、导入、审批支持幂等键。

## 状态

- Task：`todo -> done/cancelled`，完成可恢复为 todo。
- Import：`uploaded -> parsing -> preview_ready -> confirmed -> completed`，异常为 failed。
- Approval：`pending -> approved -> executing -> executed`，或 rejected/expired/failed。
- Ticket：`created -> waiting_for_user_start -> running -> candidate_found -> awaiting_user_confirmation -> completed`，可 stopped/expired/failed。

## 金额

使用最小货币单位整数，不使用浮点；默认 CNY；汇总由服务端计算；退款首期不做专门流程。

## 健康

建议必须有数据时间范围；缺失偏好不推断；不得诊断、处方、停药或判断紧急情况。
