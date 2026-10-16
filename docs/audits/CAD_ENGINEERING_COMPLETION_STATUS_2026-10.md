# CAD engineering completion status (2026-10)

**Plan:** `.cursor/plans/cad_viewer_professional_compatibility.plan.md`  
**Evidence:** plan todos, `docs/audits/CAD_ORIGINAL_PLAN_FINAL_IMPLEMENTATION_REPORT_2026-10.md`, `docs/audits/local-tool-artifacts/cad-audit/p8-latest.json`  
**Push / deploy / SQL / Owner PDF gate:** out of scope for this document

---

## ENGINEERING IMPLEMENTATION COMPLETED

**Answer: NO**

Phases **P0–P7** and **P10** are implemented and wired per plan todos. **P8** (in-engine / client SHX GPU text on real customer glyphs), **P9** (MLeader + raster end-to-end from storage), and the **Owner visual gate** are not complete. Engineering may continue; product “CAD professional compatibility” is not closed.

| Phase | Done | Notes |
|-------|------|--------|
| **P0** — contracts, `lib.rs` split, golden harness | **Yes** | Separate engine repo todo cancelled; v2 contracts + corpus harness completed |
| **P1** — text record v2 + overlay | **Yes** | PDF SSIM not run (visual gate) |
| **P2** — colour, layers, light entities | **Yes** | Functional; visual gate pending |
| **P3** — performance (XREF cache, DPR, context loss) | **Yes** | Corpus ms/memory gates not re-run this wave |
| **P4** — conditional UI messages | **Yes** | Locale denylist tests in CI path |
| **P5** — storage font resolver, SHX parser, missingFonts | **Yes** | Hebrew on Canvas + resolver; not full WASM customer TTF |
| **P6** — display list v2 + plot look | **Yes** | Hatch/linetype/lineweight/SORTENTS/CTB; transparency in stride — verify on deployed WASM when rebuilt |
| **P7** — paper space viewports + XCLIP | **Yes** | No viewport skip in compat report |
| **P8** — pf-fonts / WebGL text replacing Canvas for customer SHX | **No** | Handoff chain + heuristics landed; **3096-EL:** `shxGpuEligible: 0`, incomplete glyph coverage on real HEBTXT records; synthetic MIRYL proof only |
| **P9** — MLeader + raster textures from storage | **No** | JSON/clip/unit tests; no Owner storage E2E proof |
| **P10** — licensing, notices, CI denylist | **Yes** | Open-source settings page + denylist script |

**Regression guards (text):** `tests/unit/external-storage/cad-text-regression-guards.test.ts` — ARGB canvas paint, mirror booleans, P8 handoff glyph completeness.

---

## CUSTOMER FONTS VERIFIED

**Answer: NO** (MIRYL / HEBTXT proprietary)

| Font / style family | Verified in product corpus? | Notes |
|---------------------|----------------------------|--------|
| **MIRYL** (incl. MIRYL.SHX, MIRYM, style **TRHEBTXT**) | **No** | Proprietary Israeli SHX; not bundled in repo. Fixture/synthetic minimal shapes prove **pipeline only**, not glyph fidelity. |
| **HEBTXT** (incl. HEBTXT.SHX, entity/table heuristics) | **No** | Proprietary; deps fixtures may ship lowercase copies — **not** Owner-licensed verification. P8 audit: resolvable styles ≠ GPU-complete glyphs on 3096-EL. |
| OFL / Hershey / standard SHX (e.g. TXT, ROMANS) | Partial | Resolver + tests; not a substitute for MIRYL/HEBTXT acceptance. |

**Audit field:** `customerProprietaryFontsStatus: MISSING_IN_CORPUS` in `docs/audits/local-tool-artifacts/cad-audit/p8-glyph-coverage.mjs` output (see `p8-latest.json`).

Owner action to flip this section: place licensed MIRYL/HEBTXT (and related bigfonts) in the project storage folder used by the viewer, re-run P8 glyph coverage, and confirm `shxGpuEligible > 0` and Hebrew strings match plot intent (still subject to visual gate).

---

## OWNER VISUAL ACCEPTANCE

**Status: PENDING**

- Original PDF plots for **3096-EL**, **3621-EL**, **3031-SW** not supplied for region/SSIM comparison (`gate-visual` todo pending).
- No phase is marked “visually compatible” without Owner PDFs (plan §11 + audit).
- Engineering completion and font verification above are independent of this gate; **acceptance for go-live parity claims remains blocked** until Owner sign-off on side-by-side plots.
