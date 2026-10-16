# Build pf-cad-wasm via bundled toolchain (see projectflow-cad-engine/docs/BUILD-WASM.md)
# and sync into public/pf-cad/wasm/.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$finalProjects = Split-Path (Split-Path $root -Parent) -Parent
$engine = if ($env:PF_CAD_ENGINE_ROOT) { $env:PF_CAD_ENGINE_ROOT } else { Join-Path $finalProjects 'projectflow-cad-engine' }
$build = Join-Path $engine 'scripts/build-wasm.ps1'
if (-not (Test-Path $build)) {
  throw "Missing engine build script: $build"
}
& $build
Push-Location $root
try {
  node (Join-Path $root 'scripts/copy-pf-cad-wasm.mjs')
} finally {
  Pop-Location
}
