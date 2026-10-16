# CAD engineering completion status (2026-10)

**ProjectFlow HEAD:** `4f36a0d6` (integration commits `51c8cf21`, `1c35263c`) · **Engine WASM:** `2d17b6a`  
**Plan:** `.cursor/plans/cad_viewer_professional_compatibility.plan.md`  
**Vitest:** `tests/unit/external-storage/cad-*` + `pf-cad-fixture-dev-only` → **74 passed** (2026-10-16)  
**Push / deploy / SQL / Owner PDF gate:** out of scope

Three independent statuses (do not conflate):

---

## ENGINEERING IMPLEMENTATION COMPLETED

**Answer: YES** (within the available corpus and legal fixtures)

All plan phases **P0–P10** are implemented and covered by targeted tests or audit scripts. Remaining work is **not** blocked on missing proprietary SHX in the repo.

| Phase | Done | Evidence |
|-------|------|----------|
| **P0** | Yes | Contracts v2, golden harness, module split |
| **P1–P4** | Yes | Plan todos + regression vitest |
| **P5** | Yes | Storage index resolver, `@mlightcad/shx-parser` path, `missingFonts`, no CDN |
| **P6–P7** | Yes | Display list v2, plot, viewports, XCLIP JSON |
| **P8** | Yes | SHX parse → registry (table + `.shx` style aliases only, **no substring font guessing**) → `applyCadP8GpuTextHandoff` → GPU/Canvas by record completeness; multi-glyph **synthetic** SHX; `cad-shx-synthetic-proof.test.ts`; 3096 audit with synthetic deps: **`shxGpuEligible: 21`**, **`shxSegmentsAdded: 1088`** |
| **P9** | Yes | `tests/fixtures/cad/synthetic-p9/` + `cad-p9-integration.test.ts` (storage index → raster sync → WebGL clip → texture release); WASM MLeader smoke; layout raster clip audit scripts |
| **P10** | Yes | Notices + CI denylist |

**Not engineering blockers:** Owner PDF SSIM (`gate-visual`), proprietary MIRYL/HEBTXT byte-for-byte parity (see below).

**Regression guards:** ARGB, mirror, normal/plot, zoom no-rebatch, hatch/SORTENTS, no GPU+Canvas double-draw — unchanged and passing.

---

## CUSTOMER FONTS VERIFIED

**Answer: NO** (MIRYL / HEBTXT proprietary)

| Item | Status |
|------|--------|
| **MIRYL / HEBTXT / bigfonts in Owner storage** | **MISSING_IN_CORPUS** — not in repo; eTransmit excluded fonts from 3096 package |
| **Engineering SHX format support** | Verified on **legal synthetic** multi-glyph fixtures |
| **Claim “matches AutoCAD with customer MIRYL”** | **Not allowed** until licensed font bytes are loaded and compared (visual gate) |

Audit: `customerProprietaryFontsStatus: MISSING_IN_CORPUS` in `p8-glyph-coverage.mjs` output.

Entity styles such as **TRHEBTXT** without a host `textStyleTable` row use **WASM pf-fonts / Canvas fallback** — no inferred font substitution.

---

## OWNER VISUAL ACCEPTANCE

**Status: PENDING**

Original PDF plots for **3096-EL**, **3621-EL**, **3031-SW** not supplied. No “visually compatible” sign-off without Owner side-by-side plots (`gate-visual` todo).

Independent of engineering implementation complete and customer font verification above.
