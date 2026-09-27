$ErrorActionPreference = 'SilentlyContinue'

$lockPath = Join-Path (Get-Location) '.next/dev/lock'
$targetPid = $null
$oldPort = $null

if (Test-Path $lockPath) {
    try {
        $fs = [System.IO.File]::Open($lockPath, 'Open', 'Read', 'ReadWrite')
        $sr = New-Object System.IO.StreamReader($fs)
        $lock = $sr.ReadToEnd() | ConvertFrom-Json
        $sr.Close()
        $fs.Close()
        $targetPid = [int]$lock.pid
        $oldPort = $lock.port
    } catch {}
}

if (-not $targetPid) {
    $dir = (Get-Location).Path
    $match = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object {
            $_.CommandLine -and
            ($_.CommandLine -like "*$dir*") -and
            ($_.CommandLine -match 'next(\.cmd)?\s+dev')
        } |
        Select-Object -First 1
    if ($match) {
        $targetPid = [int]$match.ProcessId
    }
}

if ($targetPid -and (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {
    $msg = "[INFO] Stopping old ProjectFlow dev (PID $targetPid"
    if ($oldPort) {
        $msg += ", was on port $oldPort"
    }
    Write-Host "$msg)..."
    & taskkill /PID $targetPid /T /F 2>$null | Out-Null
    Start-Sleep -Seconds 2
} elseif (Test-Path $lockPath) {
    Write-Host '[INFO] Old lock file found; process already gone.'
}

Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
