# 财务模块

首期支持手动消费 CRUD、自定义分类、月份汇总、分类/商户/日期筛选和 Agent 聚合分析。字段为 `amountMinor`、`currency`、`occurredOn`、`categoryId`、`merchant`、`note`。

金额为大于零的最小单位整数，默认 CNY；服务端计算汇总。退款首期不做专门流程，不能用负数绕过金额校验。Agent 禁止支付、转账、投资、借贷和收益保证。
