---
name: CAD Viewer Professional Compatibility
overview: "Close CAD viewer fidelity gaps on the existing pf-cad-wasm + WebGL2 path without regressing XREF, layers, layouts or pan/zoom. The plan has eleven phases. Phase 0 is preparation and contracts. Phases 1–4 are quick, high-impact fixes: text placement, colours and layers, light entities, performance, and conditional UI messages without competitor names. Phases 5–9 are larger work: SHX and font resolution from storage, display list v2 (hatch, linetypes, lineweights, draw order, plot look), paper-space viewports, in-engine text, and MLeader and raster images. Phase 10 is licensing compliance. Full audit: docs/audits/CAD_VIEWER_PROFESSIONAL_COMPATIBILITY_AUDIT_2026-10.md. No SQL involved."
todos:
  - id: p0-engine-repo
    content: "Phase 0: give projectflow-cad-engine its own git repo; record commit SHA in public/pf-cad/wasm/version.json"
    status: cancelled
  - id: p0-contracts-v2
    content: "Phase 0 (Lead): define Text record v2, Display List v2 (stride/channels) and CompatReport v2 (fonts, missingFonts, categorised skipped) contracts with version negotiation"
    status: completed
  - id: p0-split-librs
    content: "Phase 0: split pf-cad-wasm/src/lib.rs into modules (text, entities, color, layers, xref, report) with zero output change"
    status: completed
  - id: p0-corpus-golden
    content: "Phase 0: golden-stats harness on 3096-EL(+4 XREF), 3621-EL(+G1,G2), 3031-SW plus synthetic text/mirror/OCS fixtures; run on every phase"
    status: completed
  - id: p1-text-record
    content: "Phase 1: emit TEXT/ATTRIB alignment h/v, both points, width factor, oblique, generation + style flags, style index, 2x2 matrix (mirror/non-uniform)"
    status: completed
  - id: p1-mtext
    content: "Phase 1: MTEXT rotation/x-direction, attachment 1-9, rectangle width, line spacing, \\P lines[], \\S, \\~, \\X; %% codes for TEXT and MTEXT (reuse pf-fonts logic)"
    status: completed
  - id: p1-overlay-anchor
    content: "Phase 1: overlay anchoring by measureText + cap height (factor 1.40), @font-face Noto Sans Hebrew, ctx.transform matrix, viewport culling, same-frame sync with WebGL"
    status: completed
  - id: p1-attrib
    content: "Phase 1: ATTRIB invisible flag, own colour/layer, alignment, embedded MTEXT, constant ATTDEFs"
    status: completed
  - id: p2-color-layers
    content: "Phase 2: full ACI for ByLayer, layer true colour, Color::None, layer-0 inheritance (colour + layer index), XREF layer prefixing XREF|layer + host overrides"
    status: completed
  - id: p2-light-entities
    content: "Phase 2: Spline (pf-geom NURBS), Table via *T block, Leader, Point, MInsert, Polyline2D/3D, OCS arbitrary axis, adaptive arc/ellipse tessellation"
    status: completed
  - id: p3-performance
    content: "Phase 3: worker XREF cache across requests, free add_xref_dep leak, space switch without re-parse, probe without full build, DPR cap 2 on mobile, WebGL context-loss recovery"
    status: completed
  - id: p4-ui-messages
    content: "Phase 4: conditional banner matrix, new short wording in he-IL/en/ar/ru (no company names, Model/Layout in English), fix unresolvedXrefCount bug, locale denylist test"
    status: completed
  - id: p5-fonts
    content: "Phase 5: font resolver from storage folder (existing file index), @mlightcad/shx-parser in worker for customer SHX, Hebrew SHX profiles (keyboard map/CP862), OFL + Hershey fallbacks, missingFonts report"
    status: completed
  - id: p5-dxf-font-cdn
    content: "Phase 5: self-host licensed fonts for the DXF viewer (baseUrl), block third-party font CDN via CSP"
    status: completed
  - id: p6-display-list-v2
    content: "Phase 6: triangle channel (solid, hatch solid/pattern, wipeout, dim arrows), draw order (SORTENTS), linetypes, lineweights as quads, transparency"
    status: completed
  - id: p6-plot-look
    content: "Phase 6: dynamic ACI 7, light background mode, binary CTB reader and plot-style mode"
    status: completed
  - id: p7-paperspace
    content: "Phase 7: layout viewports (center/height/twist/clip, per-viewport frozen layers), XCLIP for XREFs"
    status: completed
  - id: p8-engine-text
    content: "Phase 8: pf-fonts inside wasm, glyph mesh / SDF text in WebGL replacing Canvas2D overlay"
    status: pending
  - id: p9-secondary
    content: "Phase 9: full MLeader, raster images fetched from storage folder as textures"
    status: pending
  - id: p10-licensing
    content: "Phase 10: in-app open-source notices page, proprietary license field for own crates, CADCraft NOTICE verbatim, remove dead CodeCAD bundle, CI denylist for proprietary fonts/patterns"
    status: completed
  - id: gate-visual
    content: "Gate: Owner supplies original PDF plots for 3096-EL, 3621-EL, 3031-SW; region/SSIM comparison before and after each phase"
    status: pending
isProject: true
---

# CAD Viewer Professional Compatibility: execution plan

**Source audit:** `docs/audits/CAD_VIEWER_PROFESSIONAL_COMPATIBILITY_AUDIT_2026-10.md` (Hebrew, with evidence for every finding).

## סימון התקדמות (חובה לכל גל)

1. **איפה:** רק ב־`todos` ב-frontmatter — `status: completed` / `pending` / `cancelled`.
2. **מתי `completed`:** כל תוכן ה-todo מיושם **ומחובר** (לא probe / לא דגלים), וקריטריוני §11 של אותו שלב מתקיימים (חוץ משער PDF — ר' `gate-visual`).
3. **אחרי כל גל:** עדכן todos **לפני** דוח; PARTIAL נשאר `pending`.
4. **ראיה:** `docs/audits/CAD_ORIGINAL_PLAN_FINAL_IMPLEMENTATION_REPORT_2026-10.md`.

## Decision

Extend the live path (`pf-cad-wasm` feeding the WebGL2 renderer) into Display List v2. Reuse CADCraft pieces as libraries:
- `pf-fonts` for text layout
- `pf-geom` for NURBS and tessellation
- the algorithms from `hatch.rs`, `linetype.rs` and the viewport clipping code, adapted to acadrust types

Do **not** build the full acadrust → `pf-doc` mapper now.

## Ground rules for the development round

- Every phase sits behind a contract version; the v1 output stays available until golden stats pass.
- No regressions in XREF, layers, Model/Layout switching or pan/zoom; the golden harness runs in every phase.
- The ProjectFlow renderer copy is the source of truth; the engine-repo `ts/renderer` copy is retired.
- No GPL components. No proprietary fonts or patterns bundled. No third-party font CDN.
- No SQL is involved anywhere in this plan.

## Lanes

| Lane | Phases | Owns |
|---|---|---|
| Lead | 0, integration | `contracts/*`, `pf-cad/types.ts` |
| W1 (Rust text) | 1, 8 | `pf-cad-wasm` text modules |
| W2 (Rust entities and colour) | 2, 6, 7 | `pf-cad-wasm` entity, colour and layer modules |
| T (TypeScript renderer and overlay) | 1, 3, 6 | `pf-cad/renderer/*`, `pf-dwg-viewer.tsx` |
| F (fonts) | 5 | new `pf-cad/fonts/*`, worker font registration |
| U (UI messages) | 4 | locale files, `cad-preview-chrome.tsx` |
| Q (corpus and tests) | all | golden harness, synthetic fixtures |

## Dependencies

- Phase 0 comes first.
- Phases 1, 2 and 3 run in parallel.
- Phase 4 and phase 5 each start after phase 1.
- Phase 6 starts after phase 2.
- Phase 7 starts after phase 6.
- Phase 8 starts after phases 5 and 6.
- Two agents must never edit the same wasm module at the same time; the `lib.rs` split in phase 0 makes this possible.

## Success criteria (summary)

The full list is in section 11 of the audit.

| Phase | Criteria |
|---|---|
| 1 | Anchor error < 0.05·h on synthetic fixtures. Zero literal `%%` strings (3096-EL has 49 today, 3031-SW has 22). Multi-line MTEXT shows more than one line. Vertical dimension text is rotated. |
| 2 | Layer-0 share of segments: 3621-EL under 20% (99.98% today), 3096-EL under 30% (96.8% today). Spline, Table, Leader and Point are no longer skipped. |
| 3 | Model/Layout switch on 3621-EL takes under 400 ms (about 2,150 ms today). Repeated switches cause no memory growth. Peak memory is at most 450 MB. |
| 4 | No banner when nothing is missing. A specific banner for a missing XREF. No company names in the viewer locale files. |
| 5 | Every referenced font is reported. Customer SHX files are used when present. "מקום שמור" renders in Hebrew in 3031-SW. Zero font requests to third-party CDNs. |
| 6 | Hatch is no longer skipped. Linetypes are visible. The CTB plot look renders black and grey. |
| 7 | No viewport is skipped in any layout. |
| Visual gate | No phase is marked "visually compatible" without the Owner's original PDFs. |

## Todos snapshot (2026-10-16)

| Todo | Status | הערה |
|------|--------|------|
| p0-* (חוץ repo) | completed / cancelled | חוזה v2 + golden |
| p1–p4, p5-* | completed | §11 PDF — לא; gate-visual pending |
| p6-display-list-v2 | **completed** | transparency ב-pack 0xAARRGGBB; alpha ב-WebGL/Canvas; even-odd hatch; SORTENTS — `p6-tri-channel-audit.mjs` |
| p6-plot-look | **completed** | CTB + plot mode + ACI 7 דינמי; visual gate pending |
| text regression guards | **completed** | `cad-text-canvas-color`, `cad-gpu-text-policy`, vitest + `p-text-normal-plot.mjs` |
| p7-paperspace | **completed** | viewports + XCLIP; compat ללא skip viewport |
| p8-engine-text | **pending** | Handoff chain + `registerCadShxEntityStyleHeuristics` (TRHEBTXT→HEBTXT table); 3096 audit **1287** `shxStyleResolvable`; **`shxGpuEligible: 0`** until proprietary SHX bytes from storage (synthetic ≠ proof); WASM pf-fonts `gpu` נשאר לטקסט TTF/שלם |
| p9-secondary | **pending** | MLeader + raster WebGL + `clip` JSON + viewport raster ב-engine; vitest `cad-raster-clip`; אימות end-to-end עם תמונות מהאחסון — לא ב-fixtures |
| p10-licensing | **completed** | OPEN_SOURCE_NOTICES + engine LICENSE + denylist CI |
| gate-visual | **pending** | Owner PDFs |
