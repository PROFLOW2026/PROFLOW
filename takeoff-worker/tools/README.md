# Takeoff worker tools (DWG)

## LibreDWG `dwg2dxf` (GPLv3 — external CLI only)

The worker never links LibreDWG. Conversion runs `dwg2dxf` as a subprocess (aggregate use).

| Platform | Install |
|----------|---------|
| Windows (dev) | `powershell -File tools/fetch_libredwg.ps1` copies a win64 binary into `tools/bin/` (git-ignored). Or set env `LIBREDWG_DWG2DXF` to an existing `dwg2dxf.exe`. |
| Linux (Docker) | `bash tools/install_libredwg.sh` builds tag `0.14.0` from source into `/usr/local/bin/dwg2dxf`. |

Resolution order in the engine: `LIBREDWG_DWG2DXF` → `takeoff-worker/tools/bin/dwg2dxf[.exe]` → `PATH`.

## Validation

`python tools/validate_dwg_vs_pdf.py` — compares 7155 DWG viewport counts to research ground truth (`phase2/outputs/dwg_deep.json` and optional PDF pickles).