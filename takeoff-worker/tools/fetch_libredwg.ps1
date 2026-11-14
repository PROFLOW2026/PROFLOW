# Copy LibreDWG dwg2dxf win64 into tools/bin (local dev). GPLv3 — CLI subprocess only.
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Bin = Join-Path $Here "bin"
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$Research = Join-Path (Split-Path $Here -Parent) "..\docs\audits\blueprint-takeoff-research-2026-11\phase2\env\libredwg"
$Research = (Resolve-Path $Research -ErrorAction SilentlyContinue)
if (-not $Research) {
    Write-Error "Research LibreDWG folder not found. Build manually or set LIBREDWG_DWG2DXF."
}
Copy-Item (Join-Path $Research "dwg2dxf.exe") $Bin -Force
Copy-Item (Join-Path $Research "*.dll") $Bin -Force -ErrorAction SilentlyContinue
Write-Host "Installed dwg2dxf to $Bin"