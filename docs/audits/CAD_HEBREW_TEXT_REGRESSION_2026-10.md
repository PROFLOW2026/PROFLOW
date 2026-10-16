# CAD Hebrew text regression — closure (2026-10)

## REGRESSION FIXED = **YES** (engineering + automated tests)

## ROOT CAUSE

**Compound regression** after the known-good Hebrew Canvas fix (`4e4dfc0a`):

1. **`9feef0fe`** removed `shxTextRequiresCanvasFallback` and made `shouldDrawTextOnCanvas` depend only on `gpu:true`. WASM marked ~1756 texts `gpu:true` while **Canvas skipped overlay** — no `maybeDecodeHebrewShxText` + Noto/`fillWhenMissing` path. Missing SHX glyphs briefly drew **open rectangles** via `shxMissingGlyphStroke` (later removed in `3ee90dd2`, but Canvas guard stayed off).

2. **`4f36a0d6`** removed entity SHX binding for xref-style names (**813× `TRHEBTXT`** on 3096-EL). Without binding, Hebrew keyboard-latin labels lost SHX/TTF canvas path even when fonts were loaded for **`HEBTXT`**.

**Not root cause:** `hebrew-shx-decode.ts` logic; `0515020b` audit-only.

## Last known good / bad

| Axis | Last known good | Introduced bad |
|------|-----------------|----------------|
| Hebrew → Canvas policy | **`4e4dfc0a`** | **`9feef0fe`** |
| TRHEBTXT SHX registry peer | **`893c6117`** (prefix/table binding era) | **`4f36a0d6`** |
| Tip before fix | — | **`75c3ceb8`** |

## Fix (current branch)

Restore **`shxTextRequiresCanvasFallback`** and wire through P8 handoff (`stripUpstreamClientShxGpuFlags`, `sanitizeSceneGpuTextFlags`, `appendShxGpuSegments` skip).

Add **`registerCadShxEntityStylePrefixBindings`** — copies loaded SHX from documented prefix variants only (`TRHEBTXT` → `HEBTXT` via `entityStyleFontNameCandidates`), not table substring guessing.

**Fix commits:** `d684d907` (partial guard) + **`<HEAD>`** (full LKG Hebrew policy + prefix bindings + tests).

## Files changed (regression wave)

- `cad-gpu-text-policy.ts` — restore Hebrew Canvas fallback
- `shx-text-segments.ts` — strip/skip/sanitize Hebrew records
- `cad-shx-registry.ts` — `registerCadShxEntityStylePrefixBindings`
- `pf-dwg-viewer.tsx` — register prefix bindings on all parse paths
- `cad-text-regression-guards.test.ts`, `cad-text-canvas-handoff.test.ts`, `cad-shx-prefix-bindings.test.ts`, `hebrew-shx-decode.test.ts`

## Automated proof

- `cad-text-regression-guards`: TRHEBTXT `neuo anur` → decode `מקום שמור`; P8 handoff strips `gpu`; `shouldDrawTextOnCanvas` true
- `cad-shx-prefix-bindings`: TRHEBTXT resolves after HEBTXT load
- **85/85** `cad-*` + `hebrew-shx-decode` vitest pass

## Status (three-way)

| Status | Value |
|--------|--------|
| **REGRESSION FIXED** | **YES** |
| **ENGINEERING IMPLEMENTATION COMPLETED** | **YES** (code path restored; pending Owner re-screenshot only for visual sign-off) |
| **CUSTOMER FONTS VERIFIED** | **NO** (MIRYL/HEBTXT proprietary bytes) |
| **OWNER VISUAL ACCEPTANCE** | **NOT READY** (Owner must confirm squares gone on 3096-EL) |
