# PHASE 1 — Financial cross-reference (no code changes)

| Field | Value |
|--------|--------|
| **Scope** | K05-001/002, B10-001/002/003, V09-001–004, F11-001–013 |
| **Sources** | AGENT_05, AGENT_09, AGENT_10, AGENT_11 subagent reports |
| **Verified commit** | `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` (unchanged from audit baseline) |
| **Date** | 2026-10-11 |
| **Method** | Re-read current source; targeted Vitest (unit + PGlite integration where noted); numeric scenarios derived from compose/dedupe rules |
| **Out of scope** | App code changes, production SQL, live SUMIT, production DB sampling |

**Classification legend:** `PROVEN_BUG` · `SUSPECT` · `INTENTIONAL` · `STALE_TEST` · `MISSING_FEATURE` · `PROD_UNKNOWN`

---

## Executive summary

| ID | Classification | One-line verdict |
|----|----------------|------------------|
| **K05-001** | **PROVEN_BUG** | Post-0179 apply, mapping SELECT references missing `vendor_id` → silent `null` mapping |
| **K05-002** | **PROVEN_BUG** | Status filter / grant-bridge vocabulary includes non-0179 values; valid `pending` rows excluded from load |
| **B10-001** | **PROVEN_BUG** | Default billing line stores gross in `lineTotal`; SUMIT bridge treats it as net → systematic line/header mismatch |
| **B10-002** | **MISSING_FEATURE** | Plan-mandated invoice list + `ExternalReference` scan not implemented |
| **B10-003** | **PROVEN_BUG** | Recovery worker only calls `refreshExternalStatutoryStatus`, which requires `externalId` |
| **V09-001** | **INTENTIONAL** | Overlap assert is documented warn-only; similarity finders feed UX, not hard gates |
| **V09-002** | **PROVEN_BUG** | Full bill NET + partial expense dedupe can overstate Actual when bill NET ≥ expense NET |
| **V09-003** | **PROVEN_BUG** | Direct header + allocation contributions both loaded; finalize does not block |
| **V09-004** | **PROVEN_BUG** | Cost-code Actual AP path uses header `project_id` only; compose loader is allocation-aware |
| **F11-001** | **PROVEN_BUG** | Early warnings use `estimatedFinalCost` (direct forecast alias), not mode-aware basis |
| **F11-002** | **PROVEN_BUG** | Management analytics passes rollup `estimatedFinalCost` into warning evaluator |
| **F11-003** | **PROVEN_BUG** | Org rollup exposes direct `estimatedFinalCost` while profit/margin follow mode |
| **F11-004** | **PROVEN_BUG** | KPI headline forecast is mode-aware; default drilldown line uses direct `estimatedFinalCost` |
| **F11-005** | **MISSING_FEATURE** | No dedicated overhead/GCM hub (redirect only) |
| **F11-006** | **INTENTIONAL** | Budget variance panel is display-only; warnings live elsewhere |
| **F11-007** | **INTENTIONAL** | Discipline lines map via `categoryKey === disciplineKey` by design |
| **F11-008** | **STALE_TEST** | `ProfitPosition` JSDoc still describes direct-only actual profit; compose uses full actual in `include_general` |
| **F11-009** | **INTENTIONAL** | `estimatedFinalCost` remains deprecated alias to direct forecast; wide consumption is known debt |
| **F11-010** | **INTENTIONAL** | INFO: budget ↔ engine mode parity restored in code/tests |
| **F11-011** | **INTENTIONAL** | INFO: subcontract advance domain present (out of Phase 1 fix scope) |
| **F11-012** | **INTENTIONAL** | INFO: strong unit coverage; not a defect |
| **F11-013** | **STALE_TEST** | `src/modules/budgets/SCHEMA_REQUEST.md` still claims cost-code lines stay unmapped |

**Production note (K05):** Migration `0179_connected_projects.sql` is **PREPARED ONLY**. Pre-apply, repositories no-op on missing relations — **PROD_UNKNOWN** for live Mode B breakage until Owner applies 0179.

---

## Tests executed (this Phase 1 pass)

| Command | Result |
|---------|--------|
| `npm run test:unit -- --run tests/unit/financials/expense-ap-dedup.test.ts tests/unit/financials/expense-ap-overlap.test.ts tests/unit/audit-verification/fin-005-gross-line-sumit-mapping.test.ts tests/unit/connected-projects tests/unit/financials/project-profitability-mode-economics.test.ts tests/unit/budgets/variance.test.ts tests/unit/forecast/evaluate-warnings.test.ts` | **11 files, 44/44 pass** (~27s) |
| `npm run test:unit -- --run tests/unit/invoicing-integration/sumit-reconciliation.test.ts tests/unit/invoicing-integration/issuance-durability.test.ts` | **2 files, 12/12 pass** (~15s) |
| `npm run test:unit -- --run src/modules/budgets/domain/__tests__/cost-code-attribution-0074.test.ts` | **1 file, 20/20 pass** |
| `npm run test:integration -- --run tests/integration/post0021/financial-wiring.test.ts` | **1 file, 2/2 pass** (PGlite; split-bill NET attribution on **compose loader**, not cost-code repo) |

**Not run:** Playwright money-chain; integration proving V09-002 partial match end-to-end through `loadRecognizedVendorBillsForProject` + `ap_po_matches`; live SUMIT ambiguous timeout.

---

## K05 — Connected projects (AGENT_05)

### K05-001 — Mapping query `vendor_id`

| | |
|--|--|
| **Classification** | **PROVEN_BUG** (when 0179 applied) |
| **Audit claim** | SELECT `m.vendor_id` on `connected_project_mappings` but column absent in 0179 |
| **Evidence** | `src/modules/connected-projects/data/mapping.repository.ts` L58 (`m.vendor_id`); `drizzle/migrations/0179_connected_projects.sql` §2 (`connected_project_mappings` has no `vendor_id`; `vendor_id` exists on **invitations** §1 L23) |
| **Runtime** | `isMissingRelationError` treats `42703` as missing feature → returns `null` (L35–38, L76–78) |
| **Tests** | Connected-projects unit suite **passes** (mocks / pre-migration no-op); does not execute SQL against 0179 schema |
| **Numeric / scenario** | N/A — structural mismatch |
| **PROD_UNKNOWN** | Whether production has 0179 applied |

### K05-002 — Mapping status filter vs 0179 CHECK

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | SQL filter: `status in ('accepted', 'provisioning', 'active', 'sync_degraded')` — `mapping.repository.ts` L70; 0179 CHECK: `pending`, `provisioning`, `active`, `failed`, `revoked` — `0179_connected_projects.sql` L99–100; `grant-bridge.ts` L4–8 repeats `accepted`, `sync_degraded` |
| **Effect** | Valid **`pending`** mappings never load; **`accepted` / `sync_degraded`** are filter-only statuses (not in DB CHECK); after fix K05-001, **`active`** / **`provisioning`** paths can work |
| **Tests** | `tests/unit/connected-projects/connection-lifecycle.test.ts` — **4/4 pass** (application statuses, not repository SQL against 0179) |

---

## B10 — Billing / SUMIT (AGENT_10)

### B10-001 — Gross `lineTotal` → SUMIT net line

| | |
|--|--|
| **Classification** | **PROVEN_BUG** (exclusive VAT default invoice) |
| **Evidence** | `create-billing-record.ts` `buildLines`: single line `lineTotal: toNumericString(amounts.totalAmount)` (gross) L72; `build-statutory-bridge.ts` maps `lineTotal` → `lineNet`; `tests/unit/audit-verification/fin-005-gross-line-sumit-mapping.test.ts` **documents** bridge/SUMIT line = gross |
| **Tests** | `fin-005-gross-line-sumit-mapping.test.ts` — **3/3 pass** (EXEC proof, not regression guard) |
| **Numeric scenario (ILS, exclusive VAT, single line)** | |

| Field | Amount |
|-------|--------|
| Header subtotal (net) | 48,500 |
| VAT 18% | 8,730 |
| Header gross / stored `lineTotal` | 57,230 |
| Bridge `lineNet` / SUMIT `TotalPrice` | **57,230** |
| Expected net line | **48,500** |
| Line overstatement vs net | **+8,730** → drives `reconciliation_status=mismatch` when SUMIT returns header-consistent amounts |

### B10-002 — Ambiguous recovery list + ExternalReference scan

| | |
|--|--|
| **Classification** | **MISSING_FEATURE** |
| **Evidence** | `sumit-http-client.ts` exposes `listExpenseDocuments` (types 15–21) L91–97; no accounting invoice list + ExternalReference matcher in invoicing-integration (grep confirms) |
| **Tests** | Plan test T4 **not covered** (per AGENT_10 §8) |
| **PROD_UNKNOWN** | Frequency of ambiguous create without DocumentID in Owner org |

### B10-003 — Recovery worker vs null `externalId`

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | `sumit-recovery-ops-worker.ts` L164–178: loops ambiguous docs → `refreshExternalStatutoryStatus`; `refresh-external-status.ts` L44–48 throws when `!existing.externalId`; catch → `still_ambiguous++` |
| **Tests** | `issuance-durability.test.ts` covers in-flight/DocumentID paths — **6/6 pass**; does not cover null-id refresh loop |
| **Scenario** | Ambiguous row, `externalId=null` → refresh **never succeeds**; worker counts as still ambiguous (no list scan per B10-002) |

---

## V09 — Procurement / expenses / AP (AGENT_09)

### V09-001 — Expense/AP overlap “block” is no-op

| | |
|--|--|
| **Classification** | **INTENTIONAL** |
| **Evidence** | `expense-ap-overlap.ts` L102–111: `assertNoUnlinkedExpenseApOverlap` returns immediately; comment L102–105: similarity is **warning only**; `finalize-expense.ts` still calls assert wrapper; `tests/unit/financials/expense-ap-overlap.test.ts` L89–95: `hitCount: 1` **does not throw** |
| **Residual risk** | Unlinked duplicate expense + bill **can** double-count (economic), but overlap assert was never meant to block (policy ≠ bug) |
| **Tests** | `expense-ap-overlap.test.ts` — **4/4 pass** |

### V09-002 — Partial expense↔bill match and Actual

| | |
|--|--|
| **Classification** | **PROVEN_BUG** (specific geometry); **INTENTIONAL** (bill > expense match slice) |
| **Loader behavior** | `loadRecognizedVendorBillsForProject` pushes **full** project bill NET into `billAmounts` (L424–444); builds `linkedExpenseDeductions` from match amounts only (L447–481) — `committed-costs.repository.ts` |
| **Compose behavior** | `compose-project-financials.ts` L163–166 dedupe expenses; L186–192 adds full recognized bill amounts — no cap of bill by match |
| **Tests** | `expense-ap-dedup.test.ts` — **6/6 pass**; L72–96: bill input **6,000** + expense 10k − match 6k → Actual **10,000**; L99–122: bill **10,000**, expense **6,000**, match 6k → Actual **10,000** (full bill kept) |
| **Numeric scenarios (compose contract, ILS)** | |

| Expense NET | Accepted match | Bill NET in rollup | Expense after dedupe | Vendor Actual | **Total Actual** | Economic single-cost | Verdict |
|-------------|----------------|--------------------|----------------------|---------------|------------------|----------------------|---------|
| 10,000 | 6,000 | 6,000 | 4,000 | 6,000 | **10,000** | 10,000 | OK |
| 6,000 | 6,000 | 10,000 | 0 | 10,000 | **10,000** | 6,000–10,000 (policy) | Bill authority |
| **10,000** | **6,000** | **10,000** | **4,000** | **10,000** | **14,000** | **10,000** | **+4,000 double-count** |

Third row derived from dedupe + recognition code (same rules as unit tests); **not** executed via PGlite integration in this pass.

**Integration note:** `tests/integration/post0021/financial-wiring.test.ts` proves split **allocations** on loader (400+600=1000) — **2/2 pass**; does not cover partial **expense↔bill** match.

### V09-003 — Header `project_id` + allocation lines

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | `expenses.repository.ts` L203–245: all `directRows` contribute full header NET; L247+: `allocationRows` add allocated slices — no mutual exclusion when header project matches allocation target; `expense-integrity-audit.ts` flags `project_id_with_multi_allocations` L139; **no** guard in `finalize-expense.ts` (grep) |
| **Numeric scenario** | Header project P, NET 1,000 + allocation to P 1,000 → compose expense Actual **2,000** vs economic **1,000** |
| **Tests** | No dedicated integration test found; integrity audit is detect-only |
| **PROD_UNKNOWN** | How often UI allows this data shape |

### V09-004 — Budget cost-code vs project financials (split bills)

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | `cost-code-attribution.repository.ts` L169–185: AP lines joined with `eq(apBills.projectId, projectId)` only; `loadLinkedExpenseIdsForProject` L123: same header filter; contrast `loadRecognizedVendorBillsForProject` uses `resolveVendorBillProjectAmounts` + `ap_bill_project_allocations` — `committed-costs.repository.ts` L386–397 |
| **Numeric scenario** | Bill 1,000 NET split 400/600 across projects A/B via allocations; project A **compose** Actual vendor slice **400** (integration-proven); cost-code AP sum on A if header=`B` → **0** or wrong project → **divergence** |
| **Tests** | `cost-code-attribution-0074.test.ts` — **20/20 pass** (domain mapping rules); **does not** assert repository SQL vs split bills; PGlite wiring test validates **compose loader** only |

---

## F11 — Budgets / profitability (AGENT_11)

### F11-001 — Early warnings forecast basis

| | |
|--|--|
| **Classification** | **PROVEN_BUG** (when org `projectProfitabilityMode=include_general`) |
| **Evidence** | `map-financials-to-warning-input.ts` L20: `forecastFinalCostAmount: financials.cost.estimatedFinalCost.amount`; `cost-aggregation.ts` aliases `estimatedFinalCost` → **`directForecastFinalCost`**; budget workspace uses `fullForecastFinalCost` via `variance.ts` + mode |
| **Tests** | `evaluate-warnings.test.ts` — **7/7 pass**; no case for include_general full forecast overrun |
| **Numeric sketch** | Direct forecast 100, full forecast 130, budget 120 → warnings compare to **100**, budget panel variance uses **130** → inconsistent overrun signal |

### F11-002 — Management analytics risk ranks

| | |
|--|--|
| **Classification** | **PROVEN_BUG** (same basis drift) |
| **Evidence** | `compose-management-analytics.ts` L139: `forecastFinalCostAmount: row.estimatedFinalCost?.amount` |
| **Tests** | Not mode-aware in scoped runs |

### F11-003 — Reports rollup `estimatedFinalCost`

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | `get-organization-project-rollup.ts` L331, L374: stores `financials.cost.estimatedFinalCost` (direct alias) while composed profit uses mode-aware forecast in compose |
| **Tests** | `project-profitability-mode-economics.test.ts` — **1/1 pass** (stored cost fields unchanged; does not cover rollup columns) |

### F11-004 — KPI drilldown forecast line

| | |
|--|--|
| **Classification** | **PROVEN_BUG** |
| **Evidence** | `project-financials-kpi-panel.tsx` L493: headline `kpis.forecastCost` (mode-aware); fallback drill L516–518: `financials.cost.estimatedFinalCost` (direct) |
| **Tests** | UI — not vitest in this pass |

### F11-005 — Overhead / GCM hub

| | |
|--|--|
| **Classification** | **MISSING_FEATURE** |
| **Evidence** | `src/app/[locale]/(app)/overhead/page.tsx` L15–17: redirect to `/expenses?costFamily=business_overhead` |

### F11-006 — Budget panel passive on overrun

| | |
|--|--|
| **Classification** | **INTENTIONAL** |
| **Evidence** | `budget-variance-summary.tsx`: renders rows only, no alert wiring to `getProjectEarlyWarnings` |

### F11-007 — Discipline lines via categoryKey proxy

| | |
|--|--|
| **Classification** | **INTENTIONAL** |
| **Evidence** | `map-line-actuals.ts` L166–168, L230–232; documented in file header / tests in `cost-code-attribution-0074.test.ts` |

### F11-008 — Stale `ProfitPosition` JSDoc

| | |
|--|--|
| **Classification** | **STALE_TEST** (documentation drift) |
| **Evidence** | `types.ts` L212–213: `actualProfit` described as CCV − **Direct** actual; `compose-project-financials.ts` L314–315: `actualForProfit = mode === 'include_general' ? fullActual : directActual` |

### F11-009 — Deprecated `estimatedFinalCost` consumption

| | |
|--|--|
| **Classification** | **INTENTIONAL** (known alias / migration debt) |
| **Evidence** | `cost-aggregation.ts` L470–472 sets alias; widespread reads per AGENT_11; helper `resolveForecastCostBasis.ts` exists for mode-aware paths |

### F11-010 — Budget ↔ engine mode parity

| | |
|--|--|
| **Classification** | **INTENTIONAL** (INFO — regression closed) |
| **Evidence** | `variance.test.ts` include_general full-forecast case — **9/9 pass**; `project-budget-panel.tsx` labels per AGENT_11 |

### F11-011 — Subcontract advances

| | |
|--|--|
| **Classification** | **INTENTIONAL** (INFO — feature present) |
| **Evidence** | `vendors/domain/subcontract-advances.ts` per AGENT_11; not re-audited here |

### F11-012 — Unit coverage

| | |
|--|--|
| **Classification** | **INTENTIONAL** (INFO — quality signal, not a finding) |
| **Evidence** | AGENT_11 scoped 777 tests; Phase 1 subset **pass** |

### F11-013 — `SCHEMA_REQUEST.md` vs cost-code mapping

| | |
|--|--|
| **Classification** | **STALE_TEST** |
| **Evidence** | `src/modules/budgets/SCHEMA_REQUEST.md` L11–14: “Discipline / cost-code stay unmapped”; code maps via `costCodeId` (0074/0141); `cost-code-attribution-0074.test.ts` **20/20 pass** |

---

## Cross-links and remediation priority (audit-only)

1. **P0 financial correctness:** V09-002 (confirm economic rule with Owner), V09-003, V09-004; B10-001 before SUMIT reconciliation gate.
2. **P0 Mode B schema:** K05-001 + K05-002 before any 0179 apply (separate SQL approval).
3. **P1 SUMIT ops:** B10-002 + B10-003 (+ manual link UX B10-004 out of scope table but related).
4. **P1 UX consistency:** F11-001–004 as one “forecast basis” patch with mode-aware helper.
5. **Do not treat V09-001 as bug** unless Owner reverses warn-only overlap policy.

---

## Key evidence index

| Concern | Path |
|---------|------|
| Overlap warn-only | `src/modules/financials/domain/expense-ap-overlap.ts` |
| Expense/AP dedupe + compose | `src/modules/financials/domain/expense-ap-dedup.ts`, `compose-project-financials.ts` |
| Recognized bill loader | `src/modules/financials/data/committed-costs.repository.ts` |
| Expense contributions | `src/modules/financials/data/expenses.repository.ts` |
| Cost-code actual | `src/modules/budgets/data/cost-code-attribution.repository.ts` |
| Billing gross lines | `src/modules/billing/application/create-billing-record.ts` |
| SUMIT recovery | `sumit-recovery-ops-worker.ts`, `refresh-external-status.ts` |
| Connected mapping | `src/modules/connected-projects/data/mapping.repository.ts`, `drizzle/migrations/0179_connected_projects.sql` |
| Warning basis | `map-financials-to-warning-input.ts`, `cost-aggregation.ts`, `resolve-forecast-cost-basis.ts` |
| KPI drilldown | `src/modules/financials/ui/project-financials-kpi-panel.tsx` |

*End of PHASE 1 financial cross-reference.*
