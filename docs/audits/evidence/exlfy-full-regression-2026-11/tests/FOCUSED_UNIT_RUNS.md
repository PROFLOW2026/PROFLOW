# Focused unit runs (audit wave)

**Date:** 2026-11-14  
**Policy:** Targeted checks only; no full CI.

## Passed

| Suite | Result |
|-------|--------|
| `bug-03/pdf-transform-scroll-probe.test.ts` (`bug-03/vitest.config.mts`) | 4/4 PASS |
| `bug-05/isFocusedComposerPath-unused-proof.test.ts` (`bug-05/vitest.config.mts`) | 3/3 PASS |
| `tests/unit/dg-documents/drawing-visibility.test.ts` | 4/4 PASS (runtime UI UNVERIFIED) |
| `tests/unit/infra-mapping/live-share.test.ts` | 17/17 PASS |
| `tests/unit/infra-mapping/access-isolation.test.ts` | 7/7 PASS |
| `tests/unit/workforce/owner-employer-cost-invariant.test.ts` | 7/7 PASS (re-run 2026-11-14) |
| `tests/unit/workforce/payroll-labor-decoupling.test.ts` | 7/7 PASS (re-run 2026-11-14; with owner suite = 14/14) |
| `bug-02` PGlite + flight evidence vitest | 7/7 PASS |
| `tests/unit/shell/mobile-layout-regression.test.ts` | PASS |
| `tests/unit/shell/quick-create-fab.test.ts` | PASS |
| `tests/unit/database/migration-journal.test.ts` | PASS |
| `tests/unit/migrations/migration-0201-rls.test.ts` | PASS |
| `tests/unit/migrations/migration-0202-automation-presets.test.ts` | PASS |
| `tests/unit/command-center/alert-deep-links.test.ts` | PASS |

**BUG-001 semantics:** `bug-01/BUSINESS_SEMANTICS.md` — ENGINE_MATCHES_CODE · PRODUCT_SEMANTICS_AMBIGUOUS · LIKELY_STALE_ROW.  
**BUG-002:** `bug-02/BUG-02-RUNTIME.md` — Flight-Date sole cause weakened; browser stack UNVERIFIED.

Additional finance-focused suites reported PASS by finance sub-audit (net-actual, tax, org-report-aggregate, installment recognition, pre0021 gates).

## Not run

Full unit/integration/E2E/CI; Production DB probes; Playwright viewport matrix.
