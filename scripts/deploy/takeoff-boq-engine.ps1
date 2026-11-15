# Start / stop local takeoff worker + Cloudflare quick tunnel for EXLFY production callbacks.
param(
  [Parameter(Mandatory)]
  [ValidateSet('Start', 'Stop')]
  [string]$Action,
  [int]$Port = 8765,
  [string]$ContainerName = 'exlfy-takeoff-worker',
  [string]$Image = 'exlfy-takeoff-worker:prod'
)
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$StateDir = Join-Path $PSScriptRoot '.takeoff-engine-state'
$PidFile = Join-Path $StateDir 'cloudflared.pid'
$UrlFile = Join-Path $StateDir 'tunnel.url'
$LogFile = Join-Path $StateDir 'cloudflared.log'
$SecretFile = Join-Path $PSScriptRoot 'takeoff-worker.local.env'
$VercelSyncedFile = Join-Path $StateDir 'vercel-worker-url.txt'

function Ensure-StateDir {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
}

function Read-Secret {
  if (-not (Test-Path $SecretFile)) {
    throw @"
חסר קובץ הסוד: scripts\deploy\takeoff-worker.local.env
העתק את takeoff-worker.local.env.example לאותו שם והדבק את TAKEOFF_WORKER_SECRET מ-Vercel (Production).
"@
  }
  $line = Get-Content $SecretFile | Where-Object { $_ -match '^\s*TAKEOFF_WORKER_SECRET\s*=' } | Select-Object -First 1
  if (-not $line) { throw 'takeoff-worker.local.env: שורת TAKEOFF_WORKER_SECRET חסרה.' }
  $val = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if ($val.Length -lt 24) { throw 'TAKEOFF_WORKER_SECRET חייב להיות לפחות 24 תווים.' }
  return $val
}

function Get-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
  if (Test-Path $fallback) { return $fallback }
  throw 'cloudflared לא נמצא. התקן מ-https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
}

function Test-DockerRunning {
  docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Test-WorkerLocal {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 8
    return $r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"'
  } catch {
    return $false
  }
}

function Test-TunnelPublic([string]$BaseUrl) {
  if (-not $BaseUrl) { return $false }
  try {
    $u = $BaseUrl.TrimEnd('/') + '/healthz'
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20
    return $r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"'
  } catch {
    return $false
  }
}

function Get-SavedTunnelUrl {
  if (Test-Path $UrlFile) {
    return (Get-Content $UrlFile -Raw).Trim()
  }
  return $null
}

function Test-CloudflaredManaged {
  if (-not (Test-Path $PidFile)) { return $false }
  $tunnelPid = [int](Get-Content $PidFile -Raw).Trim()
  $p = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
  return $null -ne $p
}

function Wait-TunnelUrlFromLog([int]$TimeoutSec = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $pattern = 'https://[a-z0-9-]+\.trycloudflare\.com'
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogFile) {
      $raw = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
      if ($raw) {
        $m = [regex]::Match($raw, $pattern)
        if ($m.Success) { return $m.Value }
      }
    }
    Start-Sleep 1
  }
  return $null
}

function Start-WorkerContainer([string]$Secret) {
  $running = docker ps --filter "name=^${ContainerName}$" --format '{{.Names}}'
  if ($running) {
    if (-not (Test-WorkerLocal)) {
      docker restart $ContainerName | Out-Null
      Start-Sleep 2
    }
    return
  }
  $stopped = docker ps -a --filter "name=^${ContainerName}$" --format '{{.Names}}'
  if ($stopped) {
    docker start $ContainerName | Out-Null
    Start-Sleep 2
    if (Test-WorkerLocal) { return }
    docker rm -f $ContainerName | Out-Null
  }
  $images = docker images -q $Image
  if (-not $images) {
    throw "אימג' Docker $Image לא קיים. הרץ פעם אחת: docker build -t $Image takeoff-worker"
  }
  docker run -d --restart unless-stopped --name $ContainerName -p "${Port}:8765" -e "TAKEOFF_WORKER_SECRET=$Secret" $Image | Out-Null
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if (Test-WorkerLocal) { return }
    Start-Sleep 1
  }
  throw 'ה-Worker לא עלה בזמן. ודא ש-Docker Desktop פועל.'
}

function Start-CloudflaredTunnel {
  if (Test-CloudflaredManaged) {
    $url = Get-SavedTunnelUrl
    if ($url -and (Test-TunnelPublic $url)) { return $url }
    Stop-CloudflaredTunnel
  }
  $bin = Get-CloudflaredPath
  Ensure-StateDir
  if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
  $proc = Start-Process -FilePath $bin -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port") `
    -RedirectStandardError $LogFile -WindowStyle Hidden -PassThru
  Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii
  $url = Wait-TunnelUrlFromLog
  if (-not $url) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    throw 'לא התקבלה כתובת trycloudflare.com מה-tunnel. נסה שוב או הגדר tunnel קבוע (חינמי ב-Cloudflare).'
  }
  Set-Content -Path $UrlFile -Value $url -Encoding utf8
  $healthDeadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $healthDeadline) {
    if (Test-TunnelPublic $url) { return $url }
    Start-Sleep 2
  }
  throw "ה-tunnel עלה אך healthz ציבורי לא הגיב בזמן: $url"
}

function Stop-CloudflaredTunnel {
  if (Test-Path $PidFile) {
    $tunnelPid = [int](Get-Content $PidFile -Raw).Trim()
    Stop-Process -Id $tunnelPid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
}

function Sync-VercelWorkerUrl([string]$Url) {
  Push-Location $RepoRoot
  try {
    $prev = if (Test-Path $VercelSyncedFile) { (Get-Content $VercelSyncedFile -Raw).Trim() } else { '' }
    if ($prev -eq $Url) { return 'unchanged' }
    $ErrorActionPreference = 'SilentlyContinue'
    vercel whoami *> $null
    if ($LASTEXITCODE -ne 0) {
      $ErrorActionPreference = 'Stop'
      return 'vercel_login_required'
    }
    vercel env update TAKEOFF_WORKER_URL --environment production --value $Url --yes *> $null
    $ok = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    if ($ok) {
      Set-Content -Path $VercelSyncedFile -Value $Url -Encoding utf8
      return 'updated'
    }
    return 'vercel_update_failed'
  } finally {
    Pop-Location
  }
}

if ($Action -eq 'Stop') {
  Ensure-StateDir
  Stop-CloudflaredTunnel
  docker stop $ContainerName 2>$null | Out-Null
  Write-Host ''
  Write-Host 'מנוע כתב הכמויות כבוי'
  Write-Host ''
  exit 0
}

# --- Start ---
Ensure-StateDir
if (-not (Test-DockerRunning)) {
  throw 'Docker Desktop לא פועל. הפעל Docker ונסה שוב.'
}

$secret = Read-Secret
$url = Get-SavedTunnelUrl
if ((Test-WorkerLocal) -and $url -and (Test-TunnelPublic $url)) {
  Write-Host ''
  Write-Host 'מנוע כתב הכמויות פעיל'
  Write-Host "Worker: http://127.0.0.1:$Port/healthz"
  Write-Host "Tunnel: $url"
  Write-Host ''
  exit 0
}

if (-not (Test-WorkerLocal)) {
  Start-WorkerContainer $secret
}
$url = Get-SavedTunnelUrl
if (-not $url -or -not (Test-TunnelPublic $url)) {
  $url = Start-CloudflaredTunnel
}
$sync = Sync-VercelWorkerUrl $url

Write-Host ''
Write-Host 'מנוע כתב הכמויות פעיל'
Write-Host "Worker: http://127.0.0.1:$Port/healthz"
Write-Host "Tunnel: $url"
switch ($sync) {
  'updated' {
    Write-Host 'Vercel: עודכן TAKEOFF_WORKER_URL לכתובת החדשה.'
    Write-Host 'EXLFY ימשיך לנתח תוכניות דרך tunnel זה עד כיבוי המחשב או הפעלה מחדש של המנוע.'
  }
  'unchanged' { Write-Host 'Vercel: TAKEOFF_WORKER_URL כבר תואם.' }
  'vercel_login_required' {
    Write-Host ''
    Write-Host 'אזהרה: לא בוצעה התחברות ל-Vercel CLI — EXLFY לא ישתמש ב-tunnel החדש עד שתעדכן ידנית'
    Write-Host "את TAKEOFF_WORKER_URL ב-Production לערך: $url"
    Write-Host 'או הרץ מתיקיית הפרויקט: vercel login'
  }
  'vercel_update_failed' {
    Write-Host ''
    Write-Host 'אזהרה: עדכון TAKEOFF_WORKER_URL ב-Vercel נכשל. עדכן ידנית בלוח הבקרה:'
    Write-Host $url
  }
}
Write-Host ''
Write-Host 'הערה: quick tunnel של Cloudflare משתנה בכל הפעלה מחדש. לכתובת קבועה (חינם) — tunnel'
Write-Host 'שמור בחשבון Cloudflare, לא quick trycloudflare.'
Write-Host ''
exit 0