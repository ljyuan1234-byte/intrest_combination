# 认证与权限

## 认证

使用邮箱或手机号 + 密码注册/登录。密码使用 Node 内置 scrypt 派生，数据库只保存哈希；邮箱统一小写，手机号统一 E.164。服务端使用 HttpOnly、Secure、SameSite 会话 Cookie，数据库只存 Session Token 哈希。Web 与手机浏览器共用同一套 Cookie 会话。登录失败按 IP + 标识符限流。

## 会话

登录创建 `sessions`；退出撤销当前会话；用户可撤销全部设备；过期返回 `UNAUTHENTICATED`。

## 服务端检查顺序

认证 -> 当前用户归属 -> 资源权限 -> 功能权限 -> 风险等级 -> 审批状态。客户端隐藏按钮不构成权限控制。

## Agent 风险

`read` 自动；`draft` 生成但不落最终事实；`write` 用户审批后一次执行；`external` 首期禁用；`destructive` 二次确认并审计。

## 票务

任务必须由当前用户创建并主动启动。本地 Runner 使用短期注册凭证和可撤销设备绑定；云端不接收平台密码、Cookie、Token 或支付信息。
