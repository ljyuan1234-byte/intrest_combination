# 信息架构与页面

## Web 路由

`/` 首页；`/tasks` 待办；`/calendar` 日程；`/health` 健康；`/health/agent` 健康规划 Agent；`/finance` 财务；`/assistant` Agent；`/approvals` 审批；`/mini-apps` 小应用；`/mini-apps/entertainment` 娱乐；`/mini-apps/ticketing` 票务占位；`/settings` 设置；`/settings/data` 数据；`/settings/devices` 设备通知。

## 手机浏览器 / PWA

首页、待办、日程、健康、财务、设置。底部导航：首页、待办、日程、健康、财务；顶部保留“数据与账户”入口。PWA 以 `display: standalone` 运行，不缓存登录后的私人数据。

## 通用状态

每个数据页面必须设计加载、空数据、失败、刷新、保存中、成功、校验错误、权限不足和离线超时状态。

## 首页顺序

日期问候 -> 任务/日程 -> 健康建议 -> 消费摘要 -> Agent 卡片 -> 待审批 -> Mini App 工具箱。

重要结果必须是结构化卡片，不只存在聊天记录中。
