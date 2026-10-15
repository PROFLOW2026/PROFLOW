# CAD compatibility progress (2026-10)

## This wave (ProjectFlow + engine WASM rebuild)

| Area | Status |
|------|--------|
| Text mirror regression (`bx`/`by` boolean) | Fixed in overlay |
| Compact CAD warnings (left) + Model/Layout (right) | `cad-dwg-viewer-toolbar.tsx` |
| Locale banner strings (no next-intl console noise) | Offline packs in `cad-ui-messages.ts` |
| Customer TTF/OTF from storage → canvas `@font-face` | `cad-dynamic-font-faces.ts` |
| Mobile DPR cap (≤2 on narrow viewports) | `cad-viewport-dpr.ts` |
| Layout viewports (basic model window + clip) | `pf-cad-wasm` `emit_viewport` |
| Open-source notices page | `/settings/open-source` |
| WASM copied | `public/pf-cad/wasm/` (~4.25 MB) |

## Still open (plan phases 6–10)

- SHX glyph metrics in overlay or WASM (`add_font` + parser)
- Hatch pattern lines (not only SOLID scan-fill)
- Linetypes / lineweights (segment stride v2 + GPU)
- Draw order, XCLIP on XREF, twist/non-rect viewport clip
- MLeader, raster images, CTB plot look
- WebGL text (replace Canvas2D overlay)
- Remove dead CodeCAD bundle / CI denylist hardening

Engine source for viewport change: `projectflow-cad-engine/crates/pf-cad-wasm/src/entity.rs` (rebuild via `scripts/build-wasm.ps1` + `copy-pf-cad-wasm.mjs`).
