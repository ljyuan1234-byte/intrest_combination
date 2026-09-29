# 认证与权限

## 认证

首期使用邮箱一次性登录链接或受信任认证服务，不自行存储密码。服务端使用 HttpOnly、Secure、SameSite 会话 Cookie，数据库只存 Token 哈希。Android 使用安全存储。

## 会话

登录创建 `sessions`；退出撤销当前会话；用户可撤销全部设备；过期返回 `UNAUTHENTICATED`。

## 服务端检查顺序

认证 -> 当前用户归属 -> 资源权限 -> 功能权限 -> 风险等级 -> 审批状态。客户端隐藏按钮不构成权限控制。

## Agent 风险

`read` 自动；`draft` 生成但不落最终事实；`write` 用户审批后一次执行；`external` 首期禁用；`destructive` 二次确认并审计。

## 票务

任务必须由当前用户创建并主动启动。本地 Runner 使用短期注册凭证和可撤销设备绑定；云端不接收平台密码、Cookie、Token 或支付信息。
