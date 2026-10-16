# Open source notices (ProjectFlow CAD viewer)

ProjectFlow’s in-browser DWG preview uses components and fonts under the licenses below.
This file is a stub; expand with full license texts as required for your distribution.

| Component | License | Notes |
|-----------|---------|--------|
| [acadrust](https://github.com/mlightcad/acadrust) (via `pf-acadrust`) | **MPL-2.0** | DWG/DXF parsing and entity model |
| [mlightcad](https://github.com/mlightcad) viewer patterns | **MIT** | Reference integration patterns |
| `@mlightcad/shx-parser` (SHX parsing in the viewer worker) | **MIT** | Customer SHX from storage only; no Autodesk SHX bundled |
| Noto Sans Hebrew (bundled under `public/pf-cad/fonts/`) | **OFL-1.1** | Canvas fallback for Hebrew text |
| `projectflow-cad-engine` crates (`pf-fonts`, `pf-geom`, `pf-cad-wasm`, …) | **Proprietary** | Built WASM under `public/pf-cad/wasm/`; see engine repo `LICENSE` |

For CAD engine build artifacts copied into `public/pf-cad/wasm/`, see `public/pf-cad/wasm/version.json`.

In-app page: `/[locale]/settings/open-source` (authenticated settings).
