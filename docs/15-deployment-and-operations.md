# 部署与运维

## 环境

`local`、`staging`、`production` 三套环境；密钥只进 Secret Manager 或本地 `.env`，不进仓库。

## 基础设施

Next.js 托管或容器；API/Worker 容器和健康检查；托管 PostgreSQL；Redis；私有 S3 对象存储；HTTPS 域名。

## 发布

分支 -> 类型检查/测试 -> 构建 -> Staging -> 验收 -> Production -> 监控。数据库迁移先评估兼容性，破坏性迁移分阶段发布。

## 备份恢复

数据库每日备份，对象存储启用生命周期/版本策略，每月至少恢复演练一次。首期以可恢复为目标，不承诺高可用。

## 监控

API 错误/延迟/5xx、队列积压、数据库连接、存储、Agent 成本和超时、通知成功率、Runner 心跳和任务失败率。
