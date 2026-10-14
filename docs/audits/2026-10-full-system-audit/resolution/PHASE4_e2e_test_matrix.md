# Phase 4 — E2E / integration test matrix (prep only)

**Purpose:** Map audit ledger scenarios `SCENARIO_01`–`SCENARIO_15` to concrete tests, commands, gaps, and **PASS** criteria for Resolution Phase 4. No product fixes in this artifact.

| Field | Value |
|--------|--------|
| Ledger source | `docs/audits/2026-10-full-system-audit/E2E_VERIFICATION_LEDGER.json` |
| Ledger commit | `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` |
| Matrix prepared | 2026-10-11 (local) |
| Playwright / Production | **Not executed** (prep policy) |
| PGlite integration batch | **Executed** (see §3) |

---

## 1. Naming collision (important)

Two different “scenario” numbering schemes exist in the repo:

| Namespace | Where | Meaning |
|-----------|--------|---------|
| **`SCENARIO_01`–`15`** | `E2E_VERIFICATION_LEDGER.json`, this matrix | Full-system **business chains** from the Oct-2026 audit |
| **E2E tests 1–8** | `tests/e2e/authenticated/project-centric-money-chain.spec.ts` | **UI money-chain proofs** (client → profitability, AP overlap UI, etc.) |

They overlap partially (e.g. client→project→money) but are **not 1:1**. Phase 4 closure uses **ledger IDs** only.

---

## 2. Test harness commands

### 2.1 PGlite integration (safe local default)

Integration tests use in-memory **PGlite** unless `TEST_DATABASE_URL` is set (`tests/setup/database.ts`).

```powershell
# Full integration project (excludes tests/integration/migration/**)
npm run test:integration

# Single file
npm run test:integration -- tests/integration/audit-verification/business-flow-chains.test.ts

# Ledger-focused batch (Phase 4 prep run)
npm run test:integration -- `
  tests/integration/audit-verification/business-flow-chains.test.ts `
  tests/integration/crm/opportunity-quote-conversion-flow.test.ts `
  tests/integration/workforce/approve-time-sum-project-labor-cost.test.ts `
  tests/integration/workforce/employee-actual-employer-cost.test.ts `
  tests/integration/dg-claims/claims.test.ts `
  tests/integration/tasks/project-tasks-ux.test.ts `
  tests/integration/contractor-access/session-security.test.ts `
  tests/integration/contractor-access/lifecycle.test.ts `
  tests/integration/expenses/expenses.test.ts `
  tests/integration/rfi-submittals/rfi.test.ts `
  tests/integration/dg-documents/evidence-and-plans.test.ts `
  tests/integration/external-storage/oauth-callback-binding.test.ts `
  tests/integration/ap/payments-hardening.test.ts `
  tests/integration/ap/vat-net-actual.test.ts
```

**Avoid in “safe PGlite only” passes** (unless explicitly scoped): `tests/integration/migration/**`, `tests/integration/documents/real-storage-roundtrip.test.ts`, anything requiring live cloud OAuth/storage.

### 2.2 Unit (domain math / no browser)

```powershell
npm run test:unit -- tests/unit/connected-projects
npm run test:unit -- tests/unit/financials/expense-ap-overlap.test.ts
npm run test:unit -- tests/unit/financials/connected-claim-cash-flow.test.ts
npm run test:unit -- tests/unit/subcontract-claims
npm run test:unit -- tests/unit/commercial/contract-value.test.ts
npm run test:unit -- tests/unit/commercial/change-order-net.test.ts
```

### 2.3 Playwright E2E (local PGlite harness — not run in Phase 4 prep)

Requires build + harness (`tests/e2e/harness/*`, ports in `tests/e2e/harness/config.ts`).

```powershell
npm run playwright:regression
# Subset: money chain only
npx playwright test --project=setup-owner --project=desktop-he-authenticated `
  tests/e2e/authenticated/project-centric-money-chain.spec.ts

npm run audit:verification:e2e   # route matrix (408 routes), not ledger chains
```

**Production smoke:** `tests/e2e/authenticated/release-smoke.spec.ts` via `npm run playwright:smoke` — **out of scope** for Phase 4 prep.

---

## 3. Phase 4 prep — PGlite batch results (2026-10-11)

| Metric | Result |
|--------|--------|
| Files | 14 |
| Tests | **79** total — **77 passed**, **2 failed** |
| Duration | ~334s |

### Failures (blockers for SCENARIO_11 partial → FAIL until fixed)

| File | Test | Failure |
|------|------|---------|
| `contractor-access/lifecycle.test.ts` | invite → activate → sign in | `activationPath` is `/he-IL/contractor/activate?...` but test expects `/en/contractor/activate?...` |
| `contractor-access/session-security.test.ts` | external principal reads no org tables | `subcontractAgreements` select returned **1 row** (expected **0**) |

### Warnings (tests still green — functional gap)

| File | Signal |
|------|--------|
| `dg-claims/claims.test.ts` | stderr: `claim cash projection delivery failed` — `DatabaseNotConfiguredError: DATABASE_URL is not configured` during `certifyClaim` / `reassessClaim` admin delivery path |

Certification assertions in-file still **PASS**; **forecast/projection persistence** is not proven under PGlite-only harness.

---

## 4. Global PASS definition (Phase 4 closure)

For each `SCENARIO_XX`, **PASS** means:

1. **All mapped integration tests** in §5 for that scenario are **green** on PGlite (or documented `TEST_DATABASE_URL` throwaway Postgres with same migrations).
2. **All mapped unit tests** for that scenario are **green** when listed as required evidence.
3. **No known HIGH/BLOCKER** audit finding remains open for that chain (see subagent reports), unless Owner accepts residual risk in writing.
4. **E2E tier** (where marked **Required for PASS**): Playwright spec(s) green on local harness **or** explicit Owner waiver for headless-only modules.
5. **Cross-surface checks** (where expected): profitability / financials / reports agree within documented tolerance (E2E reconciliation test or integration aggregate).

**PARTIAL:** (1)–(2) mostly green but missing payment/SUMIT live, browser, connected Mode B, or projection delivery.  
**FAIL:** schema/code blocker (e.g. SCENARIO_05) or red tests on required evidence.  
**NOT VERIFIED:** no test run in audit or prep batch for required files.

---

## 5. Scenario matrix (summary)

| ID | Ledger status | Phase 4 PGlite | E2E required for full PASS? |
|----|---------------|----------------|----------------------------|
| SCENARIO_01 | PARTIAL | Core chains **PASS** | **Yes** — payment + profitability UI |
| SCENARIO_02 | PARTIAL | **PASS** | Optional — board/calendar browser |
| SCENARIO_03 | PARTIAL | Expenses **PASS**; AP overlap unit only | **Yes** — PO→bill chain + overlap |
| SCENARIO_04 | PARTIAL | Claims **PASS** (projection warn) | Optional — DG UI |
| SCENARIO_05 | FAIL | **No integration** | **Yes** — Mode B connect flow |
| SCENARIO_06 | NOT VERIFIED | evidence-and-plans **PASS** (batch) | **Yes** — consultant publish UX |
| SCENARIO_07 | PARTIAL | tasks **PASS** | **Yes** — board/list/calendar |
| SCENARIO_08 | NOT VERIFIED | rfi **PASS** (batch) | Optional |
| SCENARIO_09 | PARTIAL | Unit only cited | Integration CO→billing TBD |
| SCENARIO_10 | PASS | employee EMC **PASS** | No |
| SCENARIO_11 | PARTIAL | session **FAIL** (1 test); lifecycle **FAIL** | **Yes** — multi-developer UI |
| SCENARIO_12 | PARTIAL | Unit only | Integration idempotency TBD |
| SCENARIO_13 | NOT VERIFIED | OAuth binding **PASS** | **Yes** — share/copy UI |
| SCENARIO_14 | NOT VERIFIED | Related AP **PASS**; PO receive not in batch | Integration PO receive + payment |
| SCENARIO_15 | PARTIAL | Claims + unit | Projection delivery + partial certify |

---

## 6. Per-scenario detail

### SCENARIO_01 — Client → quote → contract → project → billing → payment → profitability

**Expected:** Single chain without duplicate revenue; profitability matches financials.

| Layer | Files / commands |
|-------|------------------|
| Integration | `audit-verification/business-flow-chains.test.ts` — Flow 1 (CRM→project), Flow 4 partial (finalize billing, no SUMIT) |
| Integration | `crm/opportunity-quote-conversion-flow.test.ts` — flows A–D |
| Integration (add for Phase 4) | `billing/payment-applications.test.ts`, `billing/integrity.test.ts`, `clients/client-financials.test.ts` |
| Unit | Financials/profitability suites (audit: 88/88 pattern) |
| E2E | `project-centric-money-chain.spec.ts` test **1** (full chain UI); `mobile-money-journeys.spec.ts` test **7** (profitability KPI) |
| E2E cmd | `npx playwright test ... project-centric-money-chain.spec.ts -g "full money chain"` |

**Gaps**

- Flow 4 does not record payment or SUMIT issuance.
- No single integration test spans CRM → payment → profitability snapshot.
- Playwright not run in audit or Phase 4 prep.

**PASS requires**

- All integration files above green.
- E2E full money chain green including billing → payment → profitability reconciliation (same project).
- No duplicate AR/revenue rows after payment (billing integrity + payment-applications).

---

### SCENARIO_02 — Employee → attendance → project hours → approve → project cost → profitability

**Expected:** Approved hours flow to labor cost without auto-filling unallocated gap.

| Layer | Files |
|-------|--------|
| Integration | `business-flow-chains.test.ts` Flow 5; `workforce/approve-time-sum-project-labor-cost.test.ts`; `workforce/employee-actual-employer-cost.test.ts` (estimate path) |
| Unit | Workforce suites (audit AGENT_08) |
| E2E | Partial: labor surfaces in `project-centric-money-chain.spec.ts`; workforce discoverability: `workforce-discoverability.spec.ts` |

**Gaps:** No test proves “unallocated gap” is **not** auto-filled; browser approval UX not verified.

**PASS requires:** Flow 5 + approve-time-sum + labor cost > 0 after approval; documented behavior for unallocated hours (test or spec).

---

### SCENARIO_03 — Vendor → PO → supplier invoice → expense → project allocation → profitability

**Expected:** Commitment ≠ expense double count; allocation updates margin.

| Layer | Files |
|-------|--------|
| Unit | `unit/financials/expense-ap-overlap.test.ts` |
| Integration | `expenses/expenses.test.ts` (allocation, void nets); `procurement/po-receiving.test.ts` (not in prep batch) |
| Integration (AP) | `ap/vat-net-actual.test.ts`, `ap/subcontract-agreement-guard.test.ts` |
| E2E | `project-centric-money-chain.spec.ts` — PO create/issue; test **2** AP overlap warning UI |

**Gaps:** Audit **V09-001/002** double-count risk; no integration asserting overlap cap end-to-end.

**PASS requires:** `expense-ap-overlap` unit green + new or existing integration proving bill+expense recognition rules + E2E overlap warning; PO receive → bill path (`po-receiving.test.ts`) green.

---

### SCENARIO_04 — Developer → subcontractor → contract → execution → claim → approve → cash forecast

**Expected:** Certified NET updates forecast, not payment/income.

| Layer | Files |
|-------|--------|
| Integration | `dg-claims/claims.test.ts` (4 tests — certify, reassess, isolation, no AP bill on certify) |
| Unit | `tests/unit/subcontract-claims/*` (audit 55/55) |
| Integration (add) | `dg-financial-projection/financial-projection.test.ts` |

**Gaps:** Cash projection delivery uses `getAdminDb()` → fails without `DATABASE_URL` in PGlite run (stderr only today).

**PASS requires:** Claims integration green **without** projection delivery errors **or** harness sets admin DB to test transaction; forecast rows visible in financial projection / cash API; no AP bill on certify.

---

### SCENARIO_05 — Developer code → registered contractor → connected project → costs → claim → profitability

**Expected:** No duplicate project/income; tenant isolation.

| Layer | Files |
|-------|--------|
| Unit | `tests/unit/connected-projects/*` (14 tests — accept-code idempotency, grants, lifecycle) |
| Integration | **None** for connect-developer / mapping resolution |
| E2E | **None** |

**Gaps:** **K05-001** (`mapping.vendor_id` vs migration 0179); ledger **FAIL**; zero PGlite chain for code→accept→provision.

**PASS requires:** Schema/code alignment on 0179; new integration: issue code → accept → mapping row → resolve connected context → single project; optional Mode B E2E; connected claim → profitability without duplicate income.

---

### SCENARIO_06 — Consultant → plan revision → approve → publish → contractor sees authorized version

**Expected:** Version discipline + capability gates.

| Layer | Files |
|-------|--------|
| Integration | `dg-documents/evidence-and-plans.test.ts` — publish Rev 4 supersedes Rev 3; contractor ack current revision only (7 tests) |
| E2E | No dedicated consultant persona spec; `persona-matrix.spec.ts` / `master-completion-journeys.spec.ts` may touch adjacent surfaces |

**Gaps:** Consultant **role** vs drawing distribution not fully separated in one test; browser not verified.

**PASS requires:** `evidence-and-plans.test.ts` green + E2E or integration with consultant capability template + contractor sees only published revision.

---

### SCENARIO_07 — PM task → assignee update → close → history

**Expected:** Consistent across board/list/calendar.

| Layer | Files |
|-------|--------|
| Integration | `tasks/project-tasks-ux.test.ts` (3 tests — assignees, remove assignee, access) |
| Unit | `tests/unit/tasks` (audit 58/58) |
| E2E | Not mapped to board/list/calendar views |

**Gaps:** No Playwright on Kanban/calendar; dependency enforcement out of scope (AGENT_07).

**PASS requires:** Integration UX tests green + E2E covering at least two views with same task id/state/history.

---

### SCENARIO_08 — RFI → response → document link → close

**Expected:** Status transitions + tenancy.

| Layer | Files |
|-------|--------|
| Integration | `rfi-submittals/rfi.test.ts` (6 tests — lifecycle, permissions, contractor isolation) |

**Gaps:** Document **link** to RFI not asserted in test names (verify in file body for close-out); not re-run in Oct audit lead pass — **re-run in Phase 4 prep batch: PASS**.

**PASS requires:** All 6 RFI integration tests green; add or confirm test linking document artifact on close if missing.

---

### SCENARIO_09 — Change request → approve → contract/CCV → budget → billing → profitability

**Expected:** Pending vs approved CO handling.

| Layer | Files |
|-------|--------|
| Unit | `unit/commercial/contract-value.test.ts`, `change-order-net.test.ts`, `unit/financials/calculations.test.ts` |
| Integration | `commercial/change-request-list-sql.test.ts`; `projects/contract-amount-tax.test.ts` (adjacent) |

**Gaps:** No single integration from CO approve → billing line → profitability dashboard.

**PASS requires:** Contract-value unit suite green + integration proving approved CO updates CCV and flows to billing/profitability without counting pending CO in current value.

---

### SCENARIO_10 — Retro employer cost correction → profitability history

**Expected:** Actual month cost updates labor actuals.

| Layer | Files |
|-------|--------|
| Integration | `workforce/employee-actual-employer-cost.test.ts` — especially `retro correction updates effective cost without double counting` |

**Phase 4 prep:** **6/6 PASS** — only ledger **PASS**.

**PASS requires:** All 6 tests in file green (already met for integration layer).

---

### SCENARIO_11 — Contractor multi-developer isolation

**Expected:** Separate grants; no cross-org leak.

| Layer | Files |
|-------|--------|
| Integration | `contractor-access/session-security.test.ts`; `contractor-access/lifecycle.test.ts` |
| Unit | Portal / connected grant parity tests |

**Phase 4 prep:** **2 failures** (locale activation path; subcontract agreement visible to external principal).

**PASS requires:** Fix failures or align product contract; prove developer A grant cannot read developer B project/data (extend session-security test).

---

### SCENARIO_12 — Mid-process failure → retry → no duplicate rows

**Expected:** Idempotency on billing + connected provision.

| Layer | Files |
|-------|--------|
| Unit | `connected-projects/accept-code.test.ts` (idempotent replay); `unit/invoicing-integration/*idempotency*`; `unit/subcontract-claims/cash-projection-idempotency.test.ts` |
| Integration | Billing integrity (partial) |

**Gaps:** No integration simulating retry after partial failure for billing finalize or connected provision.

**PASS requires:** Unit idempotency tests green + integration retry harness for at least one of billing issue or accept-code with row-count assertions.

---

### SCENARIO_13 — Developer storage share → contractor view/copy

**Expected:** No unauthorized sync.

| Layer | Files |
|-------|--------|
| Integration | `external-storage/oauth-callback-binding.test.ts` (OAuth bind only); `dg-documents/evidence-and-plans.test.ts` (contractor sharing) |
| E2E | No cross-org copy spec |

**Gaps:** OAuth test does not prove contractor **view/copy** from developer share; real cloud sync not tested.

**PASS requires:** evidence-and-plans sharing tests + integration or E2E for contractor copy action under grant; OAuth binding green.

---

### SCENARIO_14 — Commitment → invoice → partial payment → no double cost

**Expected:** FIN2-010 PO receive warn-only preserved.

| Layer | Files |
|-------|--------|
| Integration | `procurement/po-receiving.test.ts`; `ap/payments-hardening.test.ts` (partial pay); `ap/void-credit-economics.test.ts` |
| E2E | PO leg in `project-centric-money-chain.spec.ts` |
| Static | AGENT_09 procurement audit |

**Gaps:** Ledger NOT VERIFIED; prep batch ran AP partial pay but **not** `po-receiving.test.ts`.

**PASS requires:** PO receive → AP bill → partial payment with **single** Actual recognition; explicit FIN2-010 behavior test/document preserved.

---

### SCENARIO_15 — Partial contractor claim approval → forecast update without duplicate

**Expected:** Forecast only; not cash receipt.

| Layer | Files |
|-------|--------|
| Unit | `unit/financials/connected-claim-cash-flow.test.ts`; `unit/subcontract-claims/certified-receipt-cash-flow.test.ts` |
| Integration | `dg-claims/claims.test.ts` (partial certify / reassess) |

**Gaps:** Same projection delivery `DATABASE_URL` issue as SCENARIO_04; connected-claim path mostly unit-level.

**PASS requires:** Partial certification updates forecast rows once (idempotency key); no cash receipt / AR; integration verifies projection table under test DB.

---

## 7. Playwright inventory ↔ ledger (secondary)

| Playwright spec | Relevance to ledger |
|-----------------|---------------------|
| `project-centric-money-chain.spec.ts` | SCENARIO_01, 03 (partial), 14 (PO UI) |
| `mobile-money-journeys.spec.ts` | SCENARIO_01 profitability mobile |
| `worker.spec.ts` | Permission-limited financial slice (not ledger 04) |
| `master-completion-journeys.spec.ts` | Broad DG/GC journeys |
| `boq-happy-path.spec.ts` | BOQ, not ledger-critical |
| `audit/verification-route-matrix.spec.ts` | Route load matrix (**408 routes**), not business chains |
| `release-smoke.spec.ts` | Production-oriented — **excluded** Phase 4 prep |

---

## 8. Recommended Phase 4 execution order

1. Fix or classify **contractor-access** failures (SCENARIO_11) — blocks portal confidence.
2. Run **`procurement/po-receiving.test.ts`** + **`billing/payment-applications.test.ts`** for SCENARIO_01/14 closure.
3. Address **claim cash projection** admin DB in integration harness (SCENARIO_04/15).
4. Add **connected-projects integration** (SCENARIO_05) after K05-001 resolution — do not apply 0179 without Owner SQL approval.
5. Run **`npm run playwright:regression`** on target SHA and attach results to ledger JSON (separate Phase 4 artifact).

---

## 9. References

- `E2E_VERIFICATION_LEDGER.json`
- `PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md` — Part 11
- Subagent gaps: `subagents/AGENT_05_contractors_portal.md` (K05), `AGENT_09_procurement_expenses.md` (V09)
