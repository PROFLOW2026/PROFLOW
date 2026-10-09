# 15 business flows — integration chain resolution (2026-10-09)

**Scope:** AUDIT ONLY. No browser. Master report: §26.5.

**Subagent:** [15 business flows chain](11b51c70-4909-40b9-a680-68bf1cf948c2)

## Test runs (integration only)

| Batch | Log | Result |
|-------|-----|--------|
| Wave 2 (skipped re-run) | `_verification-business-flows-integration-2026-10-09.log` | **56/56** |
| Resolution supplement | `_findings-resolution-15flows-integration-supplement-2026-10-09.log` | **12 files, 73/73** (~319s) |
| Resolution targeted | `_findings-resolution-integration-batch-2026-10-09.log` | **86/88** (2× OPS-B-002 month-close) |
| Executable proof chains | `tests/integration/audit-verification/business-flow-chains.test.ts` | **3/3** (Flows 1, 4, 5 partial) |
| Flow 9 WF-002 | `tests/integration/audit-verification/wf-002-attendance-overwrite-approved.test.ts` | **1/1** (overwrite voids approved — gap **EXEC**) |

**Supplement files (12):** `billing-plan/billing-plan-flow`, `boq/integrity-0035-pattern-sweep`, `expenses/expenses`, `procurement/po-receiving`, `financials/project-financials-wiring`, `post0021/financial-wiring`, `month-close/economic-corrections`, plus others in supplement log header.

**Audit-only chain file:** [`business-flow-chains.test.ts`](../../tests/integration/audit-verification/business-flow-chains.test.ts) — PGlite, no browser.

| Test | Maps to flow | Chain steps proved | Still missing |
|------|--------------|-------------------|---------------|
| Flow 1 chain | **1** CRM→project | opp → CRM quote issue/accept → bridge → product accept → `convertQuote` → `projects` row | Contract row, BOQ/template apply |
| Flow 4 partial | **4** billing leg | `createBillingRecord` finalize → status finalized, subtotal > 0 | SUMIT HTTP, payment, profit rollup |
| Flow 5 chain | **5** attendance→cost | manual attendance → `getProjectLaborCost` > 0 | Explicit timesheet approve path (WF-006 auto-approve is separate finding) |

## Verdict rollup

| Class | Count | Meaning |
|-------|------:|---------|
| **STRONG** | **7/15** | Single integration suite covers linked DB steps end-to-end for that flow |
| **LINKED PARTIAL** | **5/15** | `business-flow-chains` and/or multi-step proof; not full business end-state |
| **VERIFIED MISSING CONNECTION** | **3/15** | Only isolated module tests; no linked chain file |
| **Browser E2E chain** | **0/15** | Out of scope |

## Per-flow map

| # | Flow | Verdict | Best chain (integration) | Gap |
|---|------|---------|--------------------------|-----|
| 1 | CRM→quote→project→**contract** | **LINKED PARTIAL** | `business-flow-chains` Flow 1; `opportunity-quote-conversion-flow.test.ts` (W2 4/4) | Contract + BOQ apply not in one chain |
| 2 | Approved change→contract value | **STRONG** | `dg-subcontract/subcontract-core.test.ts` (W2 8/8) | — |
| 3 | Pending change→no financial effect | **STRONG** | subcontract-core pending paths (W2) | — |
| 4 | Billing→SUMIT→payment→profit | **LINKED PARTIAL** | `business-flow-chains` Flow 4; `billing/integrity` (W2); `billing-plan-flow` (SUP) | No HTTP SUMIT; payment/profit not chained |
| 5 | Attendance→approval | **LINKED PARTIAL** | `business-flow-chains` Flow 5; `timesheet-approval.test.ts` (W2 4/4) | Attendance→labor cost; not full approve container |
| 6 | Hours→allocation→labor→profit | **VERIFIED MISSING CONNECTION** | pre0021 (W2); `post0021/financial-wiring` (SUP) | P&L rollup not one chain; **OPS-B-002** |
| 7 | Employer actual cost | **STRONG** | `employee-actual-employer-cost.test.ts` (W2/resolution 6/6) | — |
| 8 | Retro employer cost | **STRONG** | same suite (retro + company_only) | — |
| 9 | Retro / multi-date attendance | **LINKED PARTIAL** | `attendance-project-atomicity.test.ts` (8/8); **`wf-002-attendance-overwrite-approved`** (EXEC) | Atomicity strong; overwrite policy gap **proved** |
| 10 | PO receive→commitment | **STRONG** | `procurement/po-receiving` (SUP) | — |
| 11 | AP / expense / payment unified | **VERIFIED MISSING CONNECTION** | pre0021 adversarial (W2); `expenses.test` (SUP) | No single PO→AP→expense chain file |
| 12 | Grant→contractor task | **STRONG** | `collaboration/contractor-tasks.test.ts` (W2 7/7) | — |
| 13 | Task→claim→certify | **STRONG** | `dg-claims/claims.test.ts` (W2 4/4) | — |
| 14 | Progress→financial wiring | **LINKED PARTIAL** | `boq/integrity-0035-pattern-sweep`, `project-financials-wiring` (SUP) | Not linked to dashboard |
| 15 | Progress→reports / dashboard | **VERIFIED MISSING CONNECTION** | pre0021; **UI-MOB-001** (PRIOR) | No report engine reconcile chain |

## Security cross-ref

OPS-B-003 / SEC-001 / SEC-002: [Security findings resolution](dcf153cd-78e7-4452-a3b4-137046c2e702) → [`_findings-resolution-security-2026-10-09.md`](./_findings-resolution-security-2026-10-09.md) (tenant-isolation **32/32**; migrations FORCE gate **fail** on 5 tables).
