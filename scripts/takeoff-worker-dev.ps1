$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Worker = Join-Path $Root "takeoff-worker"
Set-Location $Worker
if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".\.venv\Scripts\pip.exe" install -r requirements.txt -r requirements-dev.txt
& ".\.venv\Scripts\python.exe" -m takeoff_worker.server --port 8765