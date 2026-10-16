# PROJECTFLOW CAD — ORIGINAL PLAN FINAL IMPLEMENTATION REPORT

**Date:** 16.10.2026  
**Baseline ProjectFlow HEAD at start:** `e6671b8a`  
**Engine repo:** `projectflow-cad-engine` (local git)

---

## P0 — Infrastructure, contracts, corpus

| | |
|---|---|
| **Original requirement** | Engine git repo, contracts v2, lib split, golden corpus, reproducible WASM build, version manifest |
| **At start** | Contracts v2 in TS; engine local repo with commits; WASM in `public/pf-cad/wasm/`; `version.json` missing commit SHA |
| **Changed this wave** | `scripts/copy-pf-cad-wasm.mjs` writes `engineCommitSha`; WASM rebuilt and copied |
| **Active code** | `public/pf-cad/wasm/version.json`, `scripts/copy-pf-cad-wasm.mjs`, `projectflow-cad-engine/scripts/build-wasm.ps1` |
| **Criteria** | Golden harness still runnable; v2 stride 8 — **PASS** (Node compat on 3096+deps: `skipped.Hatch` rendered 1955, tris ≈109k) |
| **Status** | **DONE** (p0-engine-repo todo remains cancelled by plan; SHA now recorded) |

---

## P1 — Text accuracy

| | |
|---|---|
| **Original requirement** | TEXT/MTEXT/ATTRIB v2, overlay anchoring, %% codes, mirror/OCS |
| **At start** | Implemented in WASM + `draw-cad-text.ts`; mirror regression already fixed |
| **Changed this wave** | CP862 decode path + test for keyboard Hebrew placeholder |
| **Active code** | `text_emit.rs`, `draw-cad-text.ts`, `hebrew-shx-decode.ts` |
| **Criteria** | Synthetic anchor tests **PASS**; `neuo anur` → `מקום שמור` unit test **PASS**; PDF/visual anchor **NOT VERIFIED** |
| **Status** | **PARTIAL** (visual gate not run) |

---

## P2 — Colors, layers, light entities

| | |
|---|---|
| **At start** | Layer-0 fix, XREF layers, Spline/Leader/Point/Table rendered per prior compat report |
| **Changed this wave** | No regression; segment count reduced after hatch tri migration (fewer scanline segments) |
| **Criteria** | Layer-0 share / golden stats — **NOT re-run full golden diff this wave** |
| **Status** | **PARTIAL** (no regression observed in 3096 compat run) |

---

## P3 — Performance

| | |
|---|---|
| **At start** | Host doc cache, xref dep signature, zoom debounced text overlay, DPR cap |
| **Changed this wave** | Ordered draw only when triangles present; lines still `GL.LINES` without zoom rebatch |
| **Criteria** | 3621 memory / 400ms layout switch — **NOT VERIFIED** this wave |
| **Status** | **PARTIAL** |

---

## P4 — UI messages

| | |
|---|---|
| **At start** | Conditional banners, 4 locales, no vendor names |
| **Changed this wave** | None |
| **Status** | **DONE** (prior wave) |

---

## P5 — Hebrew, SHX, fonts

| | |
|---|---|
| **At start** | Storage resolver, SHX stroke overlay, keyboard Hebrew map |
| **Changed this wave** | CP862 table (partial DOS Hebrew page); test for style-based keyboard decode |
| **Gaps** | Full SHX/Bigfont/Unicode SHX in WASM; complete CP862; BiDi shaping; `pf-fonts` not in worker/WASM |
| **Criteria** | 3031 Hebrew on real DWG — **NOT VERIFIED** (unit test only) |
| **Status** | **PARTIAL** |

---

## P6 — Display List v2 (GPU fills, linetypes, LW, CTB, draw order)

| | |
|---|---|
| **At start** | Linetypes/LW/CTB/SORTENTS in WASM; triangles disabled; TS experimental flag caused 3096 regression |
| **Changed this wave** | Engine: `hatch_solid_fill_tris` + wipeout tris; TS: split `PF_CAD_GPU_TRIANGLE_FILLS` (on) vs `PF_CAD_GPU_LINE_QUADS` (off); hybrid ordered draw (fills=TRIANGLES, lines=LINES) |
| **Active code** | `entity.rs` (`hatch_solid_fill_tris`), `cad-webgl-renderer.ts`, `draw-ordered-batches.ts`, `pf-cad-config.ts` |
| **Criteria** | Hatch not skipped — **PASS** (3096); GPU fills active — **PASS** (109578 tris); LW quads — **NOT DONE**; pattern hatch islands/transparency — **PARTIAL**; 3096 visual black-out — **NOT VERIFIED** (Owner) |
| **Status** | **PARTIAL** |

---

## P7 — Paper space / viewports / XCLIP

| | |
|---|---|
| **At start** | `emit_viewport` with model content, twist, frozen layers, rect/poly clip |
| **Changed this wave** | None (already in WASM); triangle clip path now meaningful |
| **Criteria** | `skipped.Viewport = 0` — **PASS** on compat (model content rendered); XCLIP on tris/text — **PARTIAL** |
| **Status** | **PARTIAL** |

---

## P8 — In-engine text (pf-fonts / GPU)

| | |
|---|---|
| **At start** | Canvas2D overlay only; `pf-fonts` crate unused by WASM |
| **Changed this wave** | None |
| **Status** | **NOT DONE** |

---

## P9 — MLeader & raster

| | |
|---|---|
| **At start** | MLeader lines+arrow+minimal text JSON; raster metadata + canvas draw in viewer |
| **Changed this wave** | None |
| **Status** | **PARTIAL** |

---

## P10 — Licensing & cleanup

| | |
|---|---|
| **At start** | `/settings/open-source`; dead CodeCAD bundle still in `public/cad/codecad-v0.1.0/` |
| **Changed this wave** | CodeCAD bundle removed; CI denylist (`check-cad-licensing-denylist.mjs`); `copy-cad-assets` DXF worker only |
| **Status** | **PARTIAL** (proprietary license field for own crates still open) |

---

## Summary blocks

| Topic | Status |
|--------|--------|
| **HEBREW / SHX** | Keyboard + partial CP862 overlay; full SHX/BiDi **PARTIAL** |
| **TEXT RENDERING** | Canvas overlay **DONE**; engine GPU text **NOT DONE** |
| **GPU FILLS** | Triangles enabled (hatch SOLID, wipeout); hybrid draw **PARTIAL** |
| **LINEWEIGHTS** | Screen `gl.lineWidth` **PARTIAL**; world quads **BLOCKED** (regression) |
| **HATCH** | SOLID via tris; pattern lines **PARTIAL**; islands **PARTIAL** |
| **CTB / DRAW ORDER** | CTB + SORTENTS in WASM **PARTIAL**; visual plot **NOT VERIFIED** |
| **LAYOUT / XCLIP** | Viewports **PARTIAL**; XCLIP segments only **PARTIAL** |
| **PERFORMANCE** | Zoom path preserved **PARTIAL**; full 3621 gate **NOT VERIFIED** |
| **LICENSING** | Notices page **PARTIAL**; CodeCAD removal **done**; font denylist in CI |
| **SOURCE + WASM SYNCHRONIZED** | **YES** — build `be1d778`, copied to `public/pf-cad/wasm/` |
| **ENGINE LOCAL COMMIT** | `be1d77813785c2d774be250431936f3d1fb7d94f` |
| **PROJECTFLOW LOCAL COMMIT** | `abab07283dc37bd1564ef7d04a00a0a841ec6933` |

---

## REMAINING ORIGINAL REQUIREMENTS

1. P8 — `pf-fonts` in WASM, GPU text, retire Canvas overlay when proven  
2. P6 — Lineweight quads (safe architecture), hatch pattern fill quality, transparency  
3. P5 — Complete SHX/Bigfont/Unicode/CP862 and real-file 3031 verification  
4. P9 — Full MLeader text v2; raster hardening  
5. P10 — ~~Remove unused CodeCAD bundle; CI font denylist~~ **done**  
6. Visual gate — Owner PDF/SSIM (plan gate, not waived)

---

## FULL ORIGINAL PLAN COMPLETED: **NO**
