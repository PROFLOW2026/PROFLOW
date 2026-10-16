# Open source notices (ProjectFlow CAD viewer)

ProjectFlow’s in-browser DWG preview combines ProjectFlow application code, a proprietary CAD engine WASM build, and third-party open-source components. This page summarizes obligations; full license texts live in the engine repository under `LICENSES/` and in npm package metadata.

## Application (ProjectFlow)

| Component | License | Notes |
|-----------|---------|--------|
| ProjectFlow web app (viewer UI, worker glue, WebGL renderer) | Proprietary | Customer deployment; not redistributed as OSS |
| `@mlightcad/shx-parser` | **MIT** | SHX parsing in the viewer worker; customer SHX from storage only |
| Noto Sans Hebrew (`public/pf-cad/fonts/`) | **OFL-1.1** | Canvas fallback for Hebrew text |

## CAD engine (`projectflow-cad-engine` → `public/pf-cad/wasm/`)

| Component | License | Notes |
|-----------|---------|--------|
| `pf-cad-wasm`, integration crates | **Proprietary** | See engine repo root `LICENSE` |
| [acadrust](https://github.com/mlightcad/acadrust) via `pf-acadrust` | **MPL-2.0** | DWG/DXF parsing and entity model; full text: `LICENSES/MPL-2.0.txt` |
| CADCraft-derived crates (`pf-fonts`, `pf-geom`, `pf-doc`, `pf-dxf`, `pf-render`, `pf-color`) | **MIT OR Apache-2.0** | Attribution below; texts in `LICENSES/MIT.txt` and `LICENSES/Apache-2.0.txt` |

Build metadata: `public/pf-cad/wasm/version.json` (`engineCommitSha`, schema version).

## CADCraft vendored components (MIT OR Apache-2.0)

ProjectFlow CAD Engine includes code derived from **CADCraft** (ArtCraft / storytold).

- **Upstream:** https://github.com/storytold/cadcraft  
- **Snapshot recorded in:** `vendor/VENDOR.lock.json` (commit `fc4e983`, R&D experiment tree)  
- **In-repo crates:** `pf-doc`, `pf-geom`, `pf-color`, `pf-dxf`, `pf-render`, `pf-fonts` (and dependents)

You may use this code under **either** the MIT license (`MIT.txt`) **or** the Apache License 2.0 (`Apache-2.0.txt`), at your option.

Preserve upstream `LICENSE` / `NOTICE` requirements when redistributing source. ArtCraft brand assets under upstream `docs/brand/` are **not** part of the open-source license grant.

## Compliance practices

- No Autodesk SHX, Arial, or shipped `.pat` tables in `public/` (CI: `npm run check:cad-licensing`).
- No third-party font CDNs for the CAD viewer; customer fonts from storage only.
- Dead CodeCAD bundle removed from `public/cad/codecad-v0.1.0/`.

In-app page: `/[locale]/settings/open-source` (authenticated settings).
