# ProjectFlow — Full Economic Cost Chain / Company + Project Profitability Audit

**MODE:** INSPECT ONLY — current code / schema / runtime  
**HEAD:** `ea02f206e0451c8b4efbbeef127360af132577f5`  
**Repo:** PROFLOW2026/PROFLOW  
**Date:** 2026-08-24  
**No code / migration / commit / push / deploy performed**

---

## Verdict

Project Actual exclusive breakdown **PASSes**.  
Organization-level true cost / profitability chain **FAILs** — unallocated labor, AP remainder, inventory attribution, and equipment economics are not conserved into one Company Actual.

---

## Scorecard

| Gate | Result | Evidence note |
|------|--------|---------------|
| PROJECT ACTUAL RECONCILIATION | **PASS** | Exclusive breakdown reconciles to compose Actual (diff ≤ 0.01 folded). |
| LABOR CONSERVATION | **FAIL** | Monthly pool conservation exists; non-project hourly/daily + monthly unallocated not in Company Actual. |
| VENDOR CONSERVATION | **FAIL** | Bill↔project split works; under-NET remainder and null-project bills omit from Company Actual. |
| SUBCONTRACTOR CONSERVATION | **FAIL** | Agreements are 1:1 project; economic multi-split only via AP lines; unallocated remainder not rolled up. |
| MATERIAL CONSERVATION | **FAIL** | Purchase Actual via Expense/AP; inventory issue/usage never moves cost to projects. |
| EQUIPMENT/ASSET CHAIN | **FAIL** | Asset register has no purchase amount; usage≠Actual; no depreciation/internal charge. |
| UNALLOCATED COST CHAIN | **FAIL** | Expense unallocated disclosed; labor/AP/inventory unallocated not one chain. |
| COMPANY ACTUAL RECONCILIATION | **FAIL** | Only expense-layer identity exists — not Σ Project Actual + all shared/unallocated Actual. |
| COMPANY PROFITABILITY | **FAIL** | Org profit = Σ project (contract − project Actual); unallocated excluded by design. |
| MULTI-PROJECT EMPLOYEE | **PASS** | Same employee can allocate across many projects same day/week/month (hours/days pools). |
| MULTI-PROJECT SUBCONTRACTOR | **FAIL** | Project splits via `ap_bill_project_allocations`; full 30k incl. unallocated 5k not conserved at company. |

```
PROJECT ACTUAL RECONCILIATION = PASS
LABOR CONSERVATION            = FAIL
VENDOR CONSERVATION           = FAIL
SUBCONTRACTOR CONSERVATION    = FAIL
MATERIAL CONSERVATION         = FAIL
EQUIPMENT/ASSET CHAIN         = FAIL
UNALLOCATED COST CHAIN        = FAIL
COMPANY ACTUAL RECONCILIATION = FAIL
COMPANY PROFITABILITY         = FAIL
MULTI-PROJECT EMPLOYEE        = PASS
MULTI-PROJECT SUBCONTRACTOR   = FAIL
```

---

## Domain status

| Domain | Status |
|--------|--------|
| A. Project Actual chain | **PASS** |
| B. Employees | **PARTIAL** |
| C. Subcontractors | **PARTIAL** |
| D. Vendors / AP | **PARTIAL** |
| E. Materials / inventory | **GAP** |
| F. Equipment / assets | **GAP** |
| G. Shared / overhead | **PARTIAL** |
| H. Company reconciliation | **GAP** |
| I. Direct vs fully-loaded | **PARTIAL** |
| J. Owner UX | **PARTIAL** |

---

## A. Project Actual chain — PASS

1. **Current behavior:** One compose engine: expenses (post AP dedup) + workforce `laborActual` + recognized AP bills + `month_close` costNet = `actualCostToDate`. Owner breakdown classifies atoms exclusively into Employees / Subcontractors / Vendors / Materials / Other / Overhead.
2. **Tables:** `expenses`, `expense_allocations`, `time_entries`, `labor_allocation_runs`/`lines`, `employee_month_costs`, `ap_bills`, `ap_bill_project_allocations`, month-close economic corrections.
3. **Loaders/services:** `composeProjectFinancials`, `aggregateProjectCosts`, `getProjectActualBreakdown`, `buildProjectActualBreakdown`, `applyLinkedExpenseDeductionsToContributions`, `withRecognizedVendorBills`.
4. **Pages/components:** `ProjectOwnerActualExperience`, `ProjectActualBreakdownView`, project financials KPI panel.
5. **Recognition:** Finalized expense NET; posted AP bill NET; approved labor cost / monthly applied lines; month-close cost adjustments.
6. **Project allocation:** Display classification only — not a second engine.
7. **Multi-project:** N/A (project scope).
8. **Unallocated/shared:** Out of project scope by design.
9. **Company rollup:** Project Actual rolls into org row sum; does not alone define Company Actual.
10. **Double-count protection:** Expense↔AP match deductions; labor expense excluded when workforce present; `vendor.type === 'both'` ≠ auto-sub.
11. **Existing tests:** `tests/unit/financials/project-actual-breakdown.test.ts`, expense-ap-dedup, labor-expense-integrity, compose-project-financials.
12. **Missing tests:** End-to-end live DB identity asserting breakdown sum == compose for production-shaped fixtures beyond unit seeds.
13. **Finding:** None blocking Project Actual identity. Classification is exclusive.

---

## B. Employees — PARTIAL

1. **Current behavior:** MONTHLY: employer pool ÷ `workingDaysPerMonth` accrual; day units conserved; hours split across projects + `NON_PROJECT`. HOURLY: approved hours × loaded rate on `time_entries`. DAILY: one employer pool per employee/date split by entry hours (never two full days). Displacement: `monthly_allocated` months suppress time_entry Actual.
2. **Tables:** `employees`, `employee_rate_versions`, `labor_cost_components`, `time_entries`, `non_project_time_codes`, `employee_month_costs`, `labor_allocation_runs`, `labor_allocation_run_lines`.
3. **Loaders/services:** employer-cost-pool, monthly-accrual, conserved-hour-allocation, daily-cost-recompute, monthly-cost-recompute, labor-recognition, `sumMonthlyAllocatedLaborByProject`, `sumOrganizationMonthlyLaborUnallocated` (exported, **unused by financials**).
4. **Pages/components:** Employee compensation, monthly employer cost review, time entry form (project/non_project), Project labor Actual summary, Today inbox `unallocated_employee_cost`.
5. **Recognition:** Approved time cost snapshots; applied/closed monthly allocation lines.
6. **Allocation:** Hours/days/percent/fixed monthly; conserved hour split for daily/monthly days.
7. **Multi-project:** PASS — many projects same day/week/month.
8. **Unallocated:** Monthly: `labor_allocation_runs.unallocated_amount`. Hourly/daily `non_project` costs sit on `time_entries` but are excluded from all project labor sums (`kind=project` only) → vanish from Actual.
9. **Company:** Project labor in rollup; unallocated labor NOT added to Company Actual / `unallocatedBusinessCosts`.
10. **Dedupe:** Monthly vs time displacement; Mode B labor expenses excluded when Mode C present.
11. **Tests:** costing-model-acceptance, monthly-accrual, monthly-allocation-resolve, workforce-time-labor-cost.
12. **Missing:** Company identity TotalEmployerCost = Σ project labor + unallocated; hourly/daily admin cost in company Actual; wire `sumOrganizationMonthlyLaborUnallocated` into dashboard.
13. **Finding:** Admin/office employees with no project work: monthly remainder visible in workforce UX but not Company Actual. Hourly/daily non_project cost disappears from economic Actual entirely.

---

## C. Subcontractors — PARTIAL

1. **Current behavior:** Commercial `subcontract_agreements` are project-bound (`project_id` NOT NULL). Economic Actual is AP bill / expense, classified subcontractors if `agreementId` OR category `subcontract*` OR `vendor.type === 'subcontractor'` (strict). Multi-project economic split requires `ap_bill_project_allocations` — not engagements.
2. **Tables:** `subcontract_agreements`, `subcontract_value_events`, `vendor_engagements`, `ap_bills`, `ap_bill_project_allocations`, `vendors`, `expenses`.
3. **Services:** vendor-cost-recognition, vendor-bill-project-attribution, bill-project-allocation, `isReliableSubcontractorAtom`, payables.
4. **UX:** Vendor bill allocation panel, project Actual subcontractors bucket, vendor engagements UI.
5. **Recognition:** Posted/open/matched AP bill NET (not agreement `originalAmount`; not payment).
6. **Allocation:** `ap_bill_project_allocations` applied lines; header `project_id` only if no allocation rows.
7. **Multi-project:** Engagements/agreements = multiple rows per vendor/project — not one source sliced. Bill allocations CAN slice A/G/H.
8. **Unallocated:** Under-NET remainder computed in preview only; schema allows `targetType=overhead` but insert hardcodes `targetType=project` — overhead path unused.
9. **Company:** Allocated slices enter project Actual; remainder + null-project bills do not enter Company Actual.
10. **Dedupe:** Expense↔AP; payment≠Actual; PO≠Actual.
11. **Tests:** vendor-cost-recognition, vendor-bill-project-attribution, project-actual-breakdown subcontractor rules.
12. **Missing:** Persist + roll up bill unallocated; company conservation 10+8+7+5=30; agreement multi-project economic source.
13. **Finding:** GAP vs required 30k identity with unallocated 5k at company. Do not infer support from `vendor.type` or multiple engagements.

---

## D. Vendors / AP — PARTIAL

1. **Current behavior:** PO → Commitment only. Posted bill → Actual. Payment → cash only. Receiving ≠ Actual. Bill can be 100% one project, split, or under-allocated. Expense linked to bill deducted from expense Actual.
2. **Tables:** `ap_bills`, `ap_bill_project_allocations`, `ap_matches`, `ap_payments`, `purchase_orders`, `committed_costs`, `expenses`.
3. **Services:** `composeVendorCostRecognition`, `resolveVendorBillProjectAmounts`, `saveBillProjectAllocations`, expense-ap-dedup, committed-cost guards.
4. **UX:** AP bill detail + `VendorBillAllocationPanel`; project vendor Actual panel; home `unallocatedBusinessCosts` is expense-layer only.
5. **Recognition:** Bill statuses `open` | `partially_matched` | `matched`.
6. **Allocation:** `manual_amount` / percent / `active_days` / `equal_split`; under-NET allowed.
7. **Multi-project:** PASS for project slices via allocation lines.
8. **Unallocated:** Preview unallocated; not a company Actual bucket. Null `projectId` bills: Today attention (cash outstanding), not Actual rollup.
9. **Company:** Only project-attributed bill amounts appear in Σ Project Actual.
10. **Dedupe:** Linked expense match amounts removed; payments never call recognition.
11. **Tests:** vendor-cost-recognition, expense-ap-dedup, vendor-payments, payments-hardening.
12. **Missing:** `RecognizedVendorActual = Σ project + UnallocatedVendorActual` company identity.
13. **Finding:** Conservation identity fails at organization for partial/null project attribution.

---

## E. Materials / inventory — GAP

1. **Current behavior:** Financial Actual only via finalized Expense / posted AP (materials category keys). Inventory qty movements (receive/issue/return/adjust/transfer) and `material_usage_records` never create Actual. Optional ops-finance linked expense is draft-only until separately finalized.
2. **Tables:** `inventory_items`, `inventory_movements`, `inventory_locations`, `material_usage_records`, `expenses`, `ap_bills`, material catalog.
3. **Services:** `assets/domain/usage` (`isMaterialUsageRecognizedActual=false`), inventory application, `createLinkedExpenseFromOpsRecord`, `classifyActualAtom` materials keys.
4. **UX:** Assets inventory pages; project Usage tab (qty); materials appear in Actual only if expense/AP classified materials.
5. **Recognition:** Expense finalize / AP bill — not issue, not usage.
6. **Allocation:** None for inventory qty → financial project cost.
7. **Multi-project:** Usage can tag many projects operationally without moving purchase cost.
8. **Unallocated:** Central-stock purchase with null `project_id` stays in expense unallocated until allocated as expense; issue does not attribute.
9. **Company:** No inventory valuation Actual; remaining stock is qty only.
10. **Dedupe:** Usage≠Actual prevents purchase+usage double count; risk if Owner finalizes usage-linked expense AND keeps purchase Actual without dedupe policy.
11. **Tests:** usage-not-actual, ops-expense-bridge, usage-expense-draft integration.
12. **Missing:** Central stock → project financial attribution without double count; inventory cost state on company view.
13. **Finding:** Desired chain (buy stock → use on A/G/H → remainder in stock) is operational only. Financial cost does not follow usage.

---

## F. Equipment / assets — GAP

1. **Current behavior:** `assets` table is registry (kind/status/`assigned_project_id`) with no acquisition amount. Purchase economics only if Expense `cost_family=asset_capital` or AP/expense otherwise. `equipment_usage_records` are attribution metrics only. Maintenance `cost_amount` is metadata. No depreciation engine.
2. **Tables:** `assets`, `fleet_vehicles`, `maintenance_records`, `equipment_usage_records`, `expenses` (`asset_capital`).
3. **Services:** assets application, usage domain guards, ops map `defaultCostFamilyForOpsKind` → `asset_capital` when no project, `aggregateOrgCost` assetCapital from project rows only.
4. **UX:** Assets module; project Usage; project financials `byFamily.assetCapital` when expense landed on project; reports `ops.assets.capitalExpenseActual` = Σ project asset_capital only.
5. **Recognition:** Expense/AP only — never asset create, never usage.
6. **Allocation:** None for usage→financial; optional expense allocation engine if Owner posts shared expense.
7. **Multi-project:** Usage rows can span projects; no financial split of purchase.
8. **Unallocated:** Null-project `asset_capital` expense → expense `unallocatedBusinessCosts`. Registry-only assets with no expense: invisible to Actual.
9. **Company:** No company equipment Actual beyond expense family on projects + expense unallocated.
10. **Dedupe:** Usage never invents second purchase Actual.
11. **Tests:** usage-not-actual, ops-expense-bridge.
12. **Missing:** Purchase without `project_id` always visible; depreciation; internal usage charge; allocate equipment cost A/G/H.
13. **Finding:** Critical GAP: equipment purchased with no `project_id` only appears if captured as finalized expense/AP; asset card alone loses economics; usage has no money.

---

## G. Shared / overhead — PARTIAL

1. **Current behavior:** `cost_family` `business_overhead` | `shared` on expenses; allocation runs to projects (weights/manual). Allocated overhead lands inside project Actual (`byFamily.businessOverhead`). Unallocated finalized org expense NET disclosed separately.
2. **Tables:** `expenses`, `expense_allocations`, allocation_runs (+lines), `cost_categories`.
3. **Services:** expenses allocation domain, get-overhead-home, org-cost-reconciliation, `aggregateProjectCosts`, `coverage.basis` `fully_loaded` vs `direct_only`.
4. **UX:** `/overhead` home; expenses list filtered by family; home + reports `unallocatedBusinessCosts`.
5. **Recognition:** Expense finalize.
6. **Allocation:** Optional; modifies Direct project Actual when applied (not a parallel fully-loaded layer).
7. **Multi-project:** One expense → many projects via allocation lines.
8. **Unallocated:** `orgFinalizedExpense − projectTouchingExpense`.
9. **Company:** Unallocated expense disclosed beside rollup; not in project profit.
10. **Dedupe:** Same expense not double-counted as direct + allocation when loaders follow contribution rules.
11. **Tests:** allocation tests, org-report-aggregate `expenseTotalsReconcile`, overhead-home-access.
12. **Missing:** Unify with labor/AP unallocated into one Shared Actual.
13. **Finding:** Overhead that is allocated is already inside Project Actual — terminology “fully loaded profit” must not subtract it again.

---

## H. Company reconciliation — GAP

1. **Current behavior:** Existing identity is **EXPENSE-ONLY**: `projectTouching + unallocated = org finalized expenses`. Org “Actual” KPI = Σ project `actualCost` (labor+expense+AP+month_close). No function implements `CompanyActual = Σ ProjectActual + Shared/UnallocatedRecognizedActual` across all sources.
2. **Tables:** Same as A–G; no `company_actual` table.
3. **Services:** `getHomeDashboard` `collectOrgExpenseLayer`, `getOrganizationReportsAnalytics` `loadUnallocatedBusinessCosts`, `aggregateOrgCost`, org-cost-reconciliation.
4. **UX:** Home forecast cards; Reports analytics cost section.
5. **Recognition:** Mixed — incomplete at company.
6–8. N/A / Expense only in KPI.
9. **Company:** GAP.
10. **Dedupe:** N/A at company identity.
11. **Tests:** org-report-aggregate expense reconcile; no company full-chain test.
12. **Missing:** Canonical Company Actual + difference=0.00 across labor/AP/expense/assets.
13. **Finding:** Primary product goal for organization economics is not implemented as one identity.

---

## I. Direct vs fully-loaded profit — PARTIAL

1. **Current behavior:** `coverage.basis` is `direct_only` | `fully_loaded` when shared/overhead allocation sources present. Project profit = contract − (`actualCostToDate` | `estimatedFinal`). No separate DirectProjectProfit vs FullyLoadedProjectProfit fields. Allocated overhead already inside Actual.
2. **Tables:** N/A (derived).
3. **Services:** `coverage.ts`, `profit.ts`, `composeProjectFinancials`.
4. **UX:** Financials panel shows basis label; single profit figures.
5–7. Expense allocation bases exist for overhead — not a second profit engine.
8. Unallocated explicitly excluded from project profit.
9. Org profit mirrors project sum exclusions.
10. **Risk:** future “allocated shared” subtracted again from Actual that already includes overhead.
11. **Tests:** calculations coverage basis; profit tests.
12. **Missing:** Named Direct vs Fully Loaded profit metrics; allocation of remaining shared costs onto projects as a separate layer.
13. **Finding:** Do not implement by subtracting overhead already in Actual.

---

## J. Owner UX — PARTIAL

1. **Current behavior:** PROJECT story Contract → Actual → Breakdown → Commitments → Forecast → Billing → Collection → Profit is implemented. ORGANIZATION: Revenue/contract + Project Actual + expense Unallocated + project profit — missing dedicated Shared labor/AP/equipment/stock Actual panes that close the chain.
2–4. `project-owner-actual-experience`, home-dashboard, reports-analytics-view, command-center collectors, overhead page, assets pages.
8. **Unallocated visibility:** Expense: home/reports. Labor: monthly review + Today. Vendor bill: allocation preview + Today cash attention. Inventory value: absent. Equipment capital without expense: absent.
12. **Missing:** Org view: Unallocated Labor Actual, Unallocated Vendor/Sub Actual, Equipment/Assets Actual, Central stock cost state.
13. **Finding:** Sources without `project_id` can vanish from Owner economic understanding (especially hourly admin labor, under-allocated AP, registry-only assets, stock).

---

## All findings

| ID | Severity | Title | Detail |
|----|----------|-------|--------|
| F-01 | HIGH | No Company Actual identity | Desired COMPANY ACTUAL = Σ Project Actual + Shared/Unallocated Recognized Actual does not exist. Only expense-layer reconcile is implemented. |
| F-02 | HIGH | Company profit excludes unallocated costs | `aggregateOrgProfit` sums project margins only; `unallocatedBusinessCosts` listed as exclusion. |
| F-03 | HIGH | Hourly/daily non-project labor vanishes from Actual | Labor loaders filter `kind=project` only. Non-project `time_entry.cost_amount` never enters Project or Company Actual. |
| F-04 | HIGH | Monthly unallocated labor not in Company Actual | `sumOrganizationMonthlyLaborUnallocated` exists but is unused by `getHomeDashboard` / reports. |
| F-05 | HIGH | AP under-NET / null-project bills omit from Company Actual | Bill allocation preview shows unallocated; insert only writes project `targetType`. Null-project recognized bills do not roll into org Actual KPI. |
| F-06 | HIGH | Subcontractor 30k conservation incomplete | Cannot prove 10+8+7+5=30 at company. Agreements are single-project. |
| F-07 | HIGH | Inventory usage does not attribute purchase cost | Central stock → project usage is qty-only. Financial cost remains on original Expense/AP. |
| F-08 | HIGH | Equipment purchase can disappear without expense/AP | Asset registry has no money fields. Usage/maintenance never Actual. No depreciation. |
| F-09 | MEDIUM | AP overhead `targetType` unused | Schema allows `targetType=overhead`; repository insert hardcodes project. |
| F-10 | MEDIUM | Fully-loaded terminology risk | `coverage.basis fully_loaded` means allocated overhead already inside Actual — a future FullyLoadedProfit must not subtract those amounts again. |
| F-11 | MEDIUM | Ops usage→expense bridge is draft-only | `createLinkedExpenseFromOpsRecord` never auto-finalizes; good against double Actual, but no automatic conserved transfer from stock/purchase. |
| F-12 | LOW | `vendor.type both` is not subcontract classifier | `isReliableSubcontractorAtom` requires `type===subcontractor` (or agreement/category). |
| F-13 | LOW | Today unallocated vendor attention is cash outstanding | `collectUnallocatedVendorBills` filters null `projectId` by outstanding — not recognized Actual conservation. |
| F-14 | LOW | Asset capital org report is project-sum only | `operations.assets.capitalExpenseActual` sums rollup `assetCapitalActual` — null-project `asset_capital` expenses appear only under `unallocatedBusinessCosts` if finalized. |

No LOW findings deferred. Inspect-only — no repairs in this audit.  
**Owner review required before any implementation.**
