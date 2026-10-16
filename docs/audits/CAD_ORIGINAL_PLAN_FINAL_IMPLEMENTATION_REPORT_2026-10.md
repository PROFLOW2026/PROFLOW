# CAD Professional Compatibility — Final Implementation Report (2026-10)

**Plan:** `.cursor/plans/cad_viewer_professional_compatibility.plan.md` + audit §11  
**Scope:** Waves 1–3 continuation (P8, P6 islands, integration)  
**Push / deploy / SQL / browser E2E:** none (per Owner mandate)

---

## Executive summary

| Question | Answer |
|----------|--------|
| **FULL ORIGINAL PLAN COMPLETED** | **NO** |
| **Experimental feature flags in pf-cad-config** | **0** |
| **WASM ↔ engine source synced in this session** | **NO** — `cargo` unavailable on build host; engine Rust changed but `public/pf-cad/wasm/*.wasm` not rebuilt here |

P8 is **wired in source** (engine shapes text → segment buffer; viewer skips Canvas when `gpu: true`) but is **not active in the committed WASM binary** until the engine is rebuilt and copied via `scripts/copy-pf-cad-wasm.mjs`.

---

## P0 — Preparation & contracts

| Criterion | Status |
|-----------|--------|
| Schema v2, stride 8/10, compat report | **DONE** (prior + `gpuTexts` field added in engine JSON) |
| `engineCommitSha` in `version.json` | **DONE** (prior; update on next WASM sync) |
| Golden harness | **DONE** (prior); not re-run on new WASM this session |

**Status: DONE** (contracts extended for P8 metadata)

---

## P1 — Text record & overlay

| Criterion | Status |
|-----------|--------|
| TEXT/MTEXT/ATTRIB JSON v2 | **DONE** (prior) |
| Canvas overlay anchoring, Hebrew @font-face | **DONE** (prior) |
| Anchor error gate vs PDF | **BLOCKED** (Owner visual gate) |

**Status: PARTIAL** (no PDF SSIM)

---

## P2 — Colour & light entities

| Criterion | Status |
|-----------|--------|
| ACI, ByLayer, XREF layers | **DONE** (prior) |
| Splines, leaders, etc. | **DONE** (prior) |

**Status: DONE** (functional; visual gate pending)

---

## P3 — Performance

| Criterion | Status |
|-----------|--------|
| XREF cache, space switch, DPR, context loss | **DONE** (prior) |
| 3621-EL memory / switch ms gate | **NOT RE-RUN** this session |

**Status: PARTIAL**

---

## P4 — UI messages

**Status: DONE** (prior)

---

## P5 — Fonts & SHX

| Criterion | Status |
|-----------|--------|
| Storage resolver, SHX parser, Hebrew CP862 test | **DONE** / **PARTIAL** (TS path; not full engine SHX) |
| 3031-SW “מקום שמור” | **PARTIAL** — Canvas+SHX; GPU Hebrew uses pf-fonts complex when WASM rebuilt |
| CDN blocked | **DONE** (prior) |

**Status: PARTIAL**

---

## P6 — Display list v2 (fills, order, hatch, transparency)

| Criterion | Status |
|-----------|--------|
| SORTENTS ordered draw | **DONE** |
| Triangle fills (solid hatch, wipeout) | **DONE** |
| Wide-line lineweights (no zoom rebatch) | **DONE** |
| Pattern hatch lines | **DONE** (prior `hatch_pattern.rs`) |
| **Solid hatch islands (holes)** | **DONE in engine source** — `hatch_solid_fill_tris_even_odd` (even-odd scanline over all loops); **not in deployed WASM until rebuild** |
| Transparency in display list + shader | **NOT DONE** — no alpha channel in stride; acadrust transparency not mapped |
| 3096 whiteout / darkening / slow zoom | **No regression in TS** (hybrid draw preserved); **not visually re-verified** |

**Status: PARTIAL**

---

## P7 — Paper space / viewports / XCLIP

| Criterion | Status |
|-----------|--------|
| Viewport model content, twist, frozen layers | **DONE** (prior) |
| XCLIP segments + tris + text notes | **DONE** (prior) |

**Status: PARTIAL** (visual gate pending)

---

## P8 — In-engine text (pf-fonts → WebGL)

| Criterion | Status |
|-----------|--------|
| pf-fonts shapes TEXT/MTEXT/ATTRIB in WASM | **DONE in source** — `gpu_text_emit.rs`, hooks in `entity.rs` |
| Stroke segments in display list + SORTENTS | **DONE in source** |
| JSON `"gpu": true` + `gpuTexts` count | **DONE in source** |
| WebGL draw (existing wide-line path) | **DONE** — text strokes are normal segments |
| Canvas fallback | **DONE** — overlay skips `tx.gpu`; records without GPU flag or failed shape still use Canvas |
| MLeader text GPU | **NOT DONE** — still Canvas-only |
| Customer TTF/SHX in WASM | **PARTIAL** — `TextFont::resolve` + stroke/complex; no storage TTF load in WASM |
| SDF / filled outline glyphs | **NOT DONE** — outlines as stroked polylines |
| **Active in production WASM** | **NOT DONE** — rebuild required |

**Status: PARTIAL** (architecture complete; binary + MLeader + customer fonts remain)

---

## P9 — MLeader & raster

| Criterion | Status |
|-----------|--------|
| MLeader JSON + canvas text | **PARTIAL** (prior) |
| Raster from storage textures | **PARTIAL** (canvas path) |

**Status: PARTIAL**

---

## P10 — Licensing

| Criterion | Status |
|-----------|--------|
| CodeCAD bundle removed, CI denylist | **DONE** (prior) |
| Open-source notices page | **DONE** (`settings/open-source`) |
| Full NOTICE / proprietary crate fields | **PARTIAL** |

**Status: PARTIAL**

---

## Visual gate (Owner PDFs)

**BLOCKED** — not claimed for any phase.

---

## Code touched this session

### projectflow-cad-engine

- `crates/pf-cad-wasm/src/gpu_text_emit.rs` (new)
- `crates/pf-cad-wasm/src/entity.rs` — GPU text hooks, `seg_world`, even-odd solid hatch
- `crates/pf-cad-wasm/src/lib.rs` — module export

### ProjectFlow

- `src/modules/external-storage/ui/cad/pf-cad/types.ts` — `gpu`, `gpuTexts`
- `src/modules/external-storage/ui/cad/pf-cad/pf-dwg-viewer.tsx` — skip Canvas when `gpu`

---

## Verification performed

| Check | Result |
|-------|--------|
| `vitest` CAD font tests (3 files, 12 tests) | **PASS** |
| `cargo test -p pf-cad-wasm` | **NOT RUN** — `cargo` not on PATH |
| WASM copy / compat script on 3096 | **NOT RUN** — depends on rebuild |
| Browser / E2E | **Not run** (per mandate) |

---

## Required follow-up (Owner or CI with Rust)

1. Build engine: `wasm-pack` / project script → `apps/viewer/public/wasm`
2. `node scripts/copy-pf-cad-wasm.mjs` in ProjectFlow
3. Node compat on 3096-EL: confirm `gpuTexts > 0`, segment count increased, Hatch tris unchanged vs whiteout check
4. Optional: MLeader GPU, WASM transparency stride, customer TTF embedding

---

## Commits

Local commits intended on both repos after this report (engine + ProjectFlow TS/docs). **No push.**
