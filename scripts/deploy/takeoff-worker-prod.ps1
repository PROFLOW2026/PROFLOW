<#
  Run the takeoff Python worker for production callbacks (LibreDWG inside Docker).
  Usage (repo root):
    powershell -File scripts/deploy/takeoff-worker-prod.ps1 [-Port 8765] [-SecretEnv TAKEOFF_WORKER_SECRET]

  Set Vercel production:
    TAKEOFF_WORKER_URL = public HTTPS URL reachable by Vercel (Cloudflare Tunnel, VM, etc.)
    TAKEOFF_WORKER_SECRET = same value passed to this script via env or -Secret
#>
param(
  [int]$Port = 8765,
  [string]$Secret = $env:TAKEOFF_WORKER_SECRET,
  [string]$Image = 'exlfy-takeoff-worker:prod'
)
$ErrorActionPreference = 'Stop'
if (-not $Secret -or $Secret.Length -lt 24) {
  throw 'Set TAKEOFF_WORKER_SECRET (min 24 chars) before starting the worker container.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'takeoff-worker/Dockerfile'))) { $root = Get-Location }
Push-Location (Join-Path $root 'takeoff-worker')
try {
  docker build -t $Image .
  $existing = docker ps -aq -f name=^exlfy-takeoff-worker$
  if ($existing) { docker rm -f exlfy-takeoff-worker | Out-Null }
  docker run -d --name exlfy-takeoff-worker -p "${Port}:8765" -e "TAKEOFF_WORKER_SECRET=$Secret" $Image
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 30
  Write-Host "Worker health:" $h.Content
} finally {
  Pop-Location
}