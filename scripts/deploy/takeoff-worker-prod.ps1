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

function Get-ExpectedWorkerGitSha([string]$RepoRoot) {
  Push-Location $RepoRoot
  try {
    $sha = (git log -1 --format=%H -- takeoff-worker 2>$null)
    if (-not $sha) { return 'unknown' }
    return $sha.Trim()
  } finally {
    Pop-Location
  }
}

function Get-WorkerHealth([string]$BaseUrl) {
  try {
    $r = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + '/healthz') -UseBasicParsing -TimeoutSec 30
    return $r.Content | ConvertFrom-Json
  } catch {
    return $null
  }
}

$expectedSha = Get-ExpectedWorkerGitSha $root
$shaTag = if ($expectedSha -ne 'unknown' -and $expectedSha.Length -ge 12) { $expectedSha.Substring(0, 12) } else { 'unknown' }
Push-Location (Join-Path $root 'takeoff-worker')
try {
  docker build --build-arg "WORKER_GIT_SHA=$expectedSha" -t $Image -t "exlfy-takeoff-worker:$shaTag" .
  $existing = docker ps -aq -f name=^exlfy-takeoff-worker$
  if ($existing) { docker rm -f exlfy-takeoff-worker | Out-Null }
  docker run -d --name exlfy-takeoff-worker -p "${Port}:8765" -e "TAKEOFF_WORKER_SECRET=$Secret" $Image
  $health = Get-WorkerHealth "http://127.0.0.1:$Port"
  if (-not $health -or $health.status -ne 'ok') {
    throw 'Worker /healthz failed after start.'
  }
  $runningBuild = [string]$health.workerBuild
  if ($expectedSha -ne 'unknown' -and $runningBuild -ne $expectedSha -and $runningBuild -ne $shaTag) {
    throw "STALE worker: healthz workerBuild=$runningBuild expected=$expectedSha (tag $shaTag). Rebuild did not apply."
  }
  Write-Host "Worker health: protocol=$($health.protocol) build=$runningBuild capabilities=$($health.capabilities -join ',')"
} finally {
  Pop-Location
}