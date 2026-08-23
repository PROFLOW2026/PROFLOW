# PROJECTFLOW — FULL SYSTEM REPAIR CLOSURE

**Wave:** Project-centric profitability repair  
**Date:** 2026-08-23  
**Source remap:** `docs/audits/PROJECTFLOW-FULL-SYSTEM-REMAP.md`  
**Status:** READY FOR OWNER REVIEW  
**Commit / push / deploy:** NONE  
**Owner SQL applied:** NO  
**Migrations 0000–0067 modified:** NO  
**Deferred findings:** 0  

---

## Closure table (R-001–R-052)

```text
R-001 = CLOSED
R-002 = CLOSED
R-003 = CLOSED
R-004 = CLOSED
R-005 = CLOSED
R-006 = CLOSED
R-007 = CLOSED
R-008 = CLOSED
R-009 = CLOSED
R-010 = CLOSED
R-011 = CLOSED
R-012 = CLOSED
R-013 = CLOSED
R-014 = CLOSED
R-015 = CLOSED
R-016 = CLOSED
R-017 = CLOSED
R-018 = CLOSED
R-019 = CLOSED
R-020 = CLOSED
R-021 = CLOSED
R-022 = CLOSED
R-023 = CLOSED
R-024 = CLOSED
R-025 = CLOSED
R-026 = CLOSED
R-027 = CLOSED
R-028 = CLOSED
R-029 = CLOSED
R-030 = CLOSED
R-031 = CLOSED
R-032 = CLOSED
R-033 = CLOSED
R-034 = CLOSED
R-035 = CLOSED
R-036 = CLOSED
R-037 = CLOSED
R-038 = CLOSED
R-039 = CLOSED
R-040 = CLOSED
R-041 = CLOSED
R-042 = CLOSED
R-043 = CLOSED
R-044 = CLOSED
R-045 = CLOSED
R-046 = CLOSED
R-047 = CLOSED
R-048 = CLOSED
R-049 = CLOSED
R-050 = CLOSED
R-051 = CLOSED
R-052 = CLOSED
```

---

## New findings (wave)

```text
N-001 = CLOSED
N-002 = CLOSED
```

### N-001 — Residual hardcoded English domain errors
- **Fix:** Shared `mapServerActionError` + sweep of server-action catch paths; inventory/attendance domain throws use `DomainRuleError.messageKey`; locales en/he-IL for `assets.errors.*`.
- **Files:** `src/shared/errors/map-server-action-error.ts`, action modules under `src/app/**/actions.ts`, `src/modules/assets/domain/inventory.ts`, locale files.
- **Tests:** `tests/unit/shared/map-server-action-error.test.ts`, `tests/unit/assets/inventory.test.ts`

### N-002 — Org batch / rollup denied slice → false zero
- **Fix:** `load-project-financials-batch.ts` keeps denied expenses as `null`, passes `sliceAvailability` + `kpiAvailability`; overview snapshot delegates to full `getProjectFinancials()`; org rollup/dashboard withhold incomplete KPI money via `org-rollup-kpi-money.ts` and nullable org aggregates.
- **Files:** `load-project-financials-batch.ts`, `get-project-financials-overview-snapshot.ts`, `org-rollup-kpi-money.ts`, `get-organization-project-rollup.ts`, `aggregate-org-report.ts`, `get-home-dashboard.ts`, dashboard UI/locales.
- **Tests:** `org-batch-permission-slices.test.ts`, `org-rollup-kpi-money.test.ts`, `org-report-aggregate.test.ts`, `dashboard-missing-data.test.ts`

---

## R-035 — Mobile financial journeys (FULL closure)
- **Decision:** No separate mobile layout rewrite required.
- **Proof:** `tests/e2e/authenticated/mobile-money-journeys.spec.ts` (7 core money journeys @ 390×844, no horizontal overflow) + `tests/ui/mobile-money-surfaces.test.tsx` (KPI panel, snapshot, expense form @ 390px).

---

## End-to-end scenarios (1–8)

| # | Scenario | Proof |
|---|----------|-------|
| 1 | Full project money chain | `tests/e2e/authenticated/project-centric-money-chain.spec.ts` |
| 2 | Expense/AP dedup | E2E overlap warning + unit `expense-ap-overlap.test.ts`, `expense-ap-dedup.test.ts` |
| 3 | No contract → no fake profit | E2E `priceNotSet` + unit `work-pricing.test.ts` |
| 4 | Permission-limited slices | `worker.spec.ts` + unit `financial-slice-availability.test.ts` |
| 5 | Subcontract forecast | E2E remaining in financials + unit `subcontract-commitment.test.ts` |
| 6 | Owner UX (checklist, sales redirect) | E2E in money-chain spec |
| 7 | Simple mode | E2E complexity nav filter + unit `nav-grouping.test.ts` |
| 8 | Mobile core journeys | `mobile-money-journeys.spec.ts` + UI mobile surfaces |

**Reconciliation:** Seeded project Overview actual === Financials actual; contract KPI aligned across Overview / Financials / Reports / Dashboard org contract KPI (see money-chain spec).

---

## QA gates (local CI-equivalent)

| Gate | Result |
|------|--------|
| lint | PASS |
| typecheck | PASS (0 errors) |
| unit | PASS (326 files / 3260 tests) |
| ui | PASS (37 files / 135 tests) |
| integration | PASS (403 tests) |
| migration | PASS (91 tests) |
| build | PASS |
| playwright:ci (+ mobile-he) | PASS — 41 passed, 1 skipped, 2 flaky (setup-owner RLS retry, worker project heading retry) |

---

## Financial invariants preserved

- Commercial ≠ Billing ≠ Payment  
- Actual ≠ Commitment  
- Payment ≠ Expense  
- PO receive ≠ Actual  
- Attendance ≠ Actual  
- Single compose engine: `composeProjectFinancials`  
- Permission-denied slices → unavailable/partial, never silent zero Actual  

---

## Owner actions still required (post-review)

1. Review diff + closure evidence  
2. Apply any future migration **0068+** if introduced later (none applied this wave)  
3. Explicit approval before commit / push / deploy  
