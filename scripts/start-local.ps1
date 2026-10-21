param(
  [switch]$NoBrowser,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root '.tmp'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Port([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $Port)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-EnvValue([string]$Key) {
  if (-not (Test-Path '.env')) { return $null }
  $line = Get-Content '.env' | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim()
}

Write-Host 'Personal Life Assistant - local start' -ForegroundColor Green
Write-Host "Project: $root"

Write-Step '检查 .env'
$isNewEnv = -not (Test-Path '.env')
if ($isNewEnv) {
  Copy-Item '.env.example' '.env'
}

$content = Get-Content '.env' -Raw
if ($content -match 'replace-with-a-random-secret-of-at-least-32-characters') {
  $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  $content = $content -replace 'replace-with-a-random-secret-of-at-least-32-characters', $secret
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $root '.env'), $content, $utf8NoBom)
  Write-Host '已生成随机 SESSION_SECRET 并写入 .env。' -ForegroundColor Yellow
} elseif ($isNewEnv) {
  Write-Host '已从 .env.example 创建 .env。' -ForegroundColor Yellow
} else {
  Write-Host '.env 已存在。'
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '未找到 Node.js，请先安装 Node.js 22.9+。'
}

Write-Step '检查依赖'
if (-not (Test-Path 'node_modules')) {
  Write-Host '首次运行，正在安装依赖（可能需要几分钟）...'
  corepack pnpm install --no-frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败。' }
} else {
  Write-Host 'node_modules 已存在，跳过安装。'
}

$databaseUrl = Get-EnvValue 'DATABASE_URL'
$isLocalDatabase = $databaseUrl -and ($databaseUrl -match 'localhost|127\.0\.0\.1')

if ($isLocalDatabase -and -not (Test-Port 5432)) {
  Write-Step '启动本地 PostgreSQL'

  $pgCtl = Join-Path $root '.pg\pgsql\bin\pg_ctl.exe'
  $initDb = Join-Path $root '.pg\pgsql\bin\initdb.exe'
  $createdb = Join-Path $root '.pg\pgsql\bin\createdb.exe'
  $psql = Join-Path $root '.pg\pgsql\bin\psql.exe'
  $dataDir = Join-Path $root '.pgdata'

  if (-not (Test-Path $pgCtl)) {
    Write-Host '未找到便携 PostgreSQL，尝试使用 Docker...' -ForegroundColor Yellow
    if (Get-Command docker -ErrorAction SilentlyContinue) {
      docker compose up -d postgres
      if ($LASTEXITCODE -ne 0) { throw 'Docker PostgreSQL 启动失败。' }
      for ($i = 0; $i -lt 30; $i++) {
        if (Test-Port 5432) { break }
        Start-Sleep -Seconds 1
      }
      if (-not (Test-Port 5432)) { throw 'Docker PostgreSQL 未在 30 秒内就绪。' }
    } else {
      throw '未找到 PostgreSQL。请保留 .pg 目录，或安装 Docker Desktop 后运行 docker compose up -d。'
    }
  } else {
    if (-not (Test-Path $dataDir)) {
      Write-Host '首次初始化本地数据库...'
      New-Item -ItemType Directory -Force $dataDir | Out-Null
      $pwFile = Join-Path $logDir 'pgpass.txt'
      Set-Content $pwFile 'life' -Encoding ascii
      & $initDb -D $dataDir -U life "--pwfile=$pwFile" -A scram-sha-256 -E UTF8 --locale=C
      if ($LASTEXITCODE -ne 0) { throw 'initdb 失败。' }
    }

    $pidFile = Join-Path $dataDir 'postmaster.pid'
    if (Test-Path $pidFile) {
      $postmasterPid = (Get-Content $pidFile -TotalCount 1).Trim()
      if ($postmasterPid -match '^\d+$' -and -not (Get-Process -Id $postmasterPid -ErrorAction SilentlyContinue)) {
        Remove-Item $pidFile -Force
      }
    }

    & $pgCtl -D $dataDir -l (Join-Path $logDir 'pg.log') -w -t 30 start
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'PostgreSQL 启动失败，日志：' -ForegroundColor Red
      if (Test-Path (Join-Path $logDir 'pg.log')) {
        Get-Content (Join-Path $logDir 'pg.log') -Tail 30
      }
      throw 'PostgreSQL 启动失败。'
    }

    $env:PGPASSWORD = 'life'
    $dbExists = (& $psql -h 127.0.0.1 -p 5432 -U life -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='life_assistant'" 2>$null)
    if ("$dbExists".Trim() -ne '1') {
      & $createdb -h 127.0.0.1 -p 5432 -U life life_assistant
      if ($LASTEXITCODE -ne 0) { throw '创建数据库 life_assistant 失败。' }
    }
  }
} elseif ($isLocalDatabase) {
  Write-Host 'PostgreSQL 已在 5432 运行。'
} else {
  Write-Host '使用外部数据库，跳过本地 PostgreSQL。'
}

Write-Step '执行数据库迁移'
corepack pnpm --filter @life/database migrate
if ($LASTEXITCODE -ne 0) {
  throw '数据库迁移失败，请检查 DATABASE_URL 和数据库状态。'
}

if ($CheckOnly) {
  Write-Host '检查完成：.env、依赖、数据库和迁移均正常。' -ForegroundColor Green
  exit 0
}

if ((Test-Port 3000) -and (Test-Port 4000)) {
  Write-Host 'API/Web 已经在运行，直接打开浏览器。' -ForegroundColor Yellow
  if (-not $NoBrowser) { Start-Process 'http://localhost:3000/login' }
  exit 0
}

if ((Test-Port 3000) -or (Test-Port 4000)) {
  throw '端口 3000 或 4000 已被其他进程占用，请先关闭旧的 pnpm dev / next / API 进程。'
}

if (-not $NoBrowser) {
  Write-Step '准备打开浏览器'
  Start-Job -ScriptBlock {
    param($Url)
    for ($i = 0; $i -lt 60; $i++) {
      try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', 3000)
        $client.Close()
        Start-Process $Url
        return
      } catch {
        Start-Sleep -Seconds 1
      }
    }
  } -ArgumentList 'http://localhost:3000/login' | Out-Null
}

Write-Step '启动 API 和 Web'
Write-Host 'Web: http://localhost:3000/login' -ForegroundColor Green
Write-Host 'API: http://localhost:4000/health' -ForegroundColor Green
Write-Host '按 Ctrl+C 停止 API/Web；PostgreSQL 会在后台继续运行。' -ForegroundColor Yellow
Write-Host ''

corepack pnpm dev
