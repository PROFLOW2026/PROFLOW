# Clears a previous ProjectFlow `next dev` for THIS repo/port only.
param(
  [Parameter(Mandatory = $true)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = 'SilentlyContinue'
$dir = (Resolve-Path -LiteralPath $RepoRoot).Path
$lockPath = Join-Path $dir '.next\dev\lock'
$pids = New-Object 'System.Collections.Generic.HashSet[int]'

if (Test-Path -LiteralPath $lockPath) {
  try {
    $lock = (Get-Content -LiteralPath $lockPath -Raw) | ConvertFrom-Json
    if ($lock.pid) { [void]$pids.Add([int]$lock.pid) }
  } catch {}
}

Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    if ($_.OwningProcess) { [void]$pids.Add([int]$_.OwningProcess) }
  }

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) { return }
    if ($cmd -notlike "*$dir*") { return }
    $isDev = (
      (($cmd -match 'next(\.cmd)?') -and ($cmd -match '\bdev\b')) -or
      ($cmd -match 'start-server\.js') -or
      ($cmd -like '*\.next\dev\*')
    )
    if ($isDev) { [void]$pids.Add([int]$_.ProcessId) }
  }

if ($pids.Count -eq 0) {
  Write-Host '[INFO] No previous ProjectFlow process found.'
} else {
  foreach ($procId in @($pids)) {
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
      Write-Host "[INFO] Stopping old ProjectFlow process PID $procId..."
      & taskkill /PID $procId /T /F 2>$null | Out-Null
    }
  }
  Start-Sleep -Seconds 2
}

Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue

$still = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($still.Count -gt 0) {
  $owner = $still[0].OwningProcess
  $ownerCmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue).CommandLine
  if ($ownerCmd -and ($ownerCmd -like "*$dir*")) {
    Write-Host "[INFO] Port $Port still held by ProjectFlow PID $owner - force killing..."
    & taskkill /PID $owner /T /F 2>$null | Out-Null
    Start-Sleep -Seconds 2
    $still = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  }
}

if ($still.Count -gt 0) {
  Write-Host "[WARN] Port $Port is still in use by another process (PID $($still[0].OwningProcess))."
  Write-Host '[WARN] That process is not from this ProjectFlow folder - not killed.'
  exit 1
}

Write-Host "[OK] Port $Port is free."
exit 0
