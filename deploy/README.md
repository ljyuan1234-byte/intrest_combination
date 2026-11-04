# 腾讯云 Docker 部署指南

推荐路线：

```text
本地 git push
   ↓
腾讯云 CVM / Lighthouse git clone
   ↓
docker compose build
   ↓
docker compose run --rm api 执行数据库迁移
   ↓
docker compose up -d
```

数据库使用腾讯云 PostgreSQL，不放进 Docker。Caddy 负责 HTTPS 和反向代理。

## 1. 服务器建议

- Ubuntu 22.04 / 24.04 LTS；
- 2 核 4G 起步；2 核 2G 建议先加 2G swap，否则 Next.js 构建可能 OOM；
- 安全组只开放 `22`、`80`、`443`；
- 域名 A 记录指向服务器公网 IP；
- 中国大陆服务器使用域名需要完成 ICP 备案；
- 腾讯云数据库与 CVM 放在同一 VPC/私网，数据库只对 CVM 私网 IP 放行。

## 2. 本地提交

在项目根目录：

```powershell
git status
git add .
git commit -m "chore: prepare web-only docker deployment"
git push origin master
```

提交前确认：

```powershell
git check-ignore -v .env deploy\.env.production
```

`.env` 和 `deploy/.env.production` 必须被忽略。仓库里只提交 `deploy/env.production.example`。

如果仓库是公开的，确认代码里没有真实密钥；密钥只放在服务器。

## 3. 服务器确认 Docker

如果 `docker --version` 已经有输出，说明 Docker 已安装，**不要重复执行 `get.docker.com` 安装脚本**。只需要确认 Git、curl 和 Compose：

```bash
sudo apt update
sudo apt install -y git curl

git --version
curl --version | head -n 1
docker --version
docker compose version
docker ps
```

如果 `docker ps` 提示权限不足：

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker ps
```

如果 `docker compose version` 不存在，但 `docker-compose --version` 存在，说明只有旧版 Compose v1。当前 `docker-compose.yml` 使用了顶层 `name:`，需要 Compose v2，建议安装插件：

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

如果 apt 找不到该包，再按 Docker 官方文档安装 Compose 插件；不要用 `docker-compose` 命令替代本文的 `docker compose`。

## 4. 拉取代码

```bash
sudo mkdir -p /opt/life-assistant
sudo chown "$USER":"$USER" /opt/life-assistant
git clone <你的仓库地址> /opt/life-assistant
cd /opt/life-assistant
git branch --show-current
```

默认分支是 `master`，如果远端是 `main`，以实际为准。

## 5. 配置生产环境变量

```bash
cd /opt/life-assistant/deploy
cp env.production.example .env.production
nano .env.production
```

至少修改：

```dotenv
DOMAIN=life.example.com
APP_ORIGIN=https://life.example.com
NEXT_PUBLIC_API_URL=

DATABASE_URL=postgresql://life:password@腾讯云数据库私网地址:5432/life_assistant?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_POOL_MAX=10

SESSION_SECRET=至少32字符随机值
```

生成 `SESSION_SECRET`：

```bash
openssl rand -base64 48
```

如果使用 DeepSeek/Qwen，把 `LLM_*`、`EMBEDDING_*` 也填在这里。

注意：`Caddyfile` 使用 `{$DOMAIN}`，Compose 里的 `DOMAIN` 通过 `--env-file .env.production` 注入。后续所有 compose 命令都建议带 `--env-file .env.production`。

### 5.1 方式 B：不用腾讯云数据库，使用容器 PostgreSQL

如果只有 CVM、没有购买腾讯云 PostgreSQL，可以用 Docker 里的 PostgreSQL 16。它在 `docker-compose.db.yml` 中定义，不会暴露 5432 到公网。

```bash
cd /opt/life-assistant/deploy
cp env.production.example .env.production
nano .env.production
```

在 `.env.production` 中增加：

```dotenv
POSTGRES_DB=life_assistant
POSTGRES_USER=life
POSTGRES_PASSWORD=只用字母和数字的强密码
```

然后让 Compose 同时加载主文件和数据库 overlay：

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.db.yml

docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm api \
  pnpm --filter @life/database migrate
docker compose --env-file .env.production up -d
```

说明：

- `postgres` 只在 Compose 内部网络可达，不对公网开放；
- 数据保存在 Docker volume `life-assistant_postgres_data`；
- `DATABASE_SSL=false`，因为容器内网连接不需要 SSL；
- `POSTGRES_PASSWORD` 不要用 `@`、`:`、`#` 等字符，避免 URL 转义问题；
- 必须自己备份这个 volume，CVM 故障不会自动帮你恢复。

备份示例：

```bash
docker compose --env-file .env.production exec -T postgres \
  pg_dump -U life life_assistant > life_assistant_$(date +%F).sql
```

> 正式生产仍推荐腾讯云 PostgreSQL：自动备份、监控、故障恢复更省心。容器数据库适合个人测试或低成本单机。

## 6. 首次构建

```bash
cd /opt/life-assistant/deploy
docker compose --env-file .env.production build
```

如果 2G 内存构建失败，先加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h
```

## 7. 执行数据库迁移

推荐直接用 API 镜像里的迁移器，不要求服务器安装 Node：

```bash
cd /opt/life-assistant/deploy
docker compose --env-file .env.production run --rm api \
  pnpm --filter @life/database migrate
```

迁移器会创建 `__life_migrations`，按 `0000` 到 `0009` 顺序执行，已执行的会跳过。

如果提示找不到 `tsx`，不要在服务器上临时改镜像；改用下面任一方式：

```bash
# 方式 A：服务器安装 Node 22 + Corepack
sudo apt install -y nodejs npm
sudo corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @life/database migrate
```

或在本机通过受控网络连接腾讯云数据库执行迁移。不要在公网长期开放数据库 5432。

## 8. 启动

```bash
cd /opt/life-assistant/deploy
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f api
```

检查：

```bash
curl https://life.example.com/health
```

期望：

```json
{"status":"ok","database":"ok"}
```

首次打开页面后注册账号。

## 9. 日常更新

```bash
cd /opt/life-assistant
git pull --ff-only

cd deploy
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm api \
  pnpm --filter @life/database migrate
docker compose --env-file .env.production up -d
```

更新前先备份腾讯云数据库。迁移是向前执行的，回滚代码不一定能回滚表结构。

## 10. 回滚

```bash
cd /opt/life-assistant
git log --oneline -5
git checkout <上一个稳定提交>
cd deploy
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

建议发布时打 tag：

```bash
git tag -a v1.0.0 -m "first production deploy"
git push origin v1.0.0
```

## 11. 更正式的镜像发布方式

服务器直接 `build` 适合个人项目起步。项目稳定后，建议改成：

```text
本地或 CI 构建镜像 → 推送腾讯云 TCR → 服务器 docker compose pull
```

优点：

- 不在小内存 CVM 上构建 Next.js；
- 镜像版本可追溯；
- 回滚只需切换 tag；
- 服务器只负责拉取和运行。

服务器 compose 到时把 `build:` 改成：

```yaml
image: ccr.ccs.tencentyun.com/<命名空间>/life-api:v1.0.0
```

Web 同理。首次部署不必马上做这一步。

## 12. 不要做的事

- 不要把 `.env.production` 提交到 Git；
- 不要把腾讯云数据库 5432 长期开放给 `0.0.0.0/0`；
- 不要在服务器上直接改代码后再 `git pull`，会产生冲突；
- 不要跳过迁移直接启动新版本；
- 不要只备份容器，业务数据在腾讯云 PostgreSQL；
- 不要在未备案域名上直接指望大陆服务器 80/443 正常提供 Web 服务。
