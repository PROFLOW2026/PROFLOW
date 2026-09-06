# ProjectFlow — Ground-Up Business & System Audit

**Date:** 2026-09-06  
**Method:** Fresh read of current code (`src/`), Drizzle schema (`drizzle/schema/`, migrations), unit/integration tests, and Hebrew locale strings (`src/locales/he-IL/`).  
**Authority rule applied:** Existing reports under `docs/audits/` were **not** used as proof of correctness. They were not read for findings.

**Scope:** Report only. No code, DB, data, migration, commit, push, or deploy changes were made.

---

## A. Executive Summary

### What is correct (architecturally sound today)

1. **Core invariants are encoded in schema and domain code**, not only in UI copy:
   - AP bills: NET = recognized vendor cost; GROSS = payable; `ap_payments` = cash only (`drizzle/schema/ap.ts`, `vendor-cost-recognition.ts`).
   - Billing: finalized `subtotalAmount` = project revenue (NET); `totalAmount` = GROSS receivable; `payments` = cash in (`billing.ts`, `outstanding.ts`).
   - PO commitments ≠ Actual (`committed-cost.ts`, `cost-aggregation.ts`).
   - Labor via workforce time entries ≠ internal payroll expense category (`labor-expense-integrity.ts`).
   - Inventory stock purchase ≠ operating Actual (`expenses.ts`, `true-cost.ts`).

2. **VAT separation for billing/revenue** is implemented: `resolveProjectKpiDisplay.billed` uses `netInvoiced`; profit uses contract NET (`billing-net-vs-gross-revenue.test.ts`).

3. **Cash flow module explicitly separates Actual vs Forecast** (`cash-flow.ts`, `cash-flow-forecast.ts`): collections = payment dates; incoming forecast = outstanding + due dates; outgoing = open AP cash outstanding — not expense Actual.

4. **Forecast engine is real**, not merely `contract − actual`:  
   `Direct Forecast Final = Actual + remaining commitments + ETC`; Full Forecast adds allocated general + future general forecast (`cost-aggregation.ts`).

5. **Double-count guards** exist for AP↔Expense matching, labor↔payroll expense, inventory vs expense Actual.

6. **Many Hebrew hints explicitly warn** that עלות מוכרת ≠ כסף ששולם (e.g. `financial.json` → `kpis.actualCostHint`, `basis.actualNotCash`).

### What is misleading (Owner may misread screens)

1. **`kpis.actualMargin` Hebrew label = "רווח צפוי"** but the bound value is **actual profit** (`contract NET − actual cost`), not forecast profit (`financial.json` L67–68 vs `profit.ts`, `resolve-kpi-display.ts`).

2. **Dashboard `ownerHeadline.actualProfit` = "רווח בפועל"** aggregates `Σ(contract − actual)` across active projects — this is **current margin on recognized costs**, not final project result, not cash profit, and ignores open commitments/ETC unless user reads forecast separately.

3. **Expense finalize copy says "נרשמה בעלויות"** — correct accrually, but there is **no parallel "לא שולם"** state; Owner may equate "הוצאה" with cash paid especially when `paymentMethod` is filled.

4. **`reports.columns.profit` = "רווח משוער נטו"** while row field is `estimatedProfit` (forecast margin) — adjacent column `actualCost` is recognized cost; naming mixes "משוער" with forecast formula while actual profit exists separately.

5. **Installment spread on expenses** (`installment_count`, `expense_managerial_schedule_lines`) spreads **recognized cost** across months — not cash payment schedule. Label "מספר תשלומים" on expense form suggests payment timing to a Hebrew reader.

### What is broken / incomplete for business truth

1. **No expense payment lifecycle** — no `due_date`, `paid_at`, or payable entity on `expenses` table. Finalize ⇒ recognized cost immediately (or via installment recognition schedule). **Expense created/finalized ≠ Paid** at data model level, but UI lacks cash counterpart entirely.

2. **No payroll payable / salary cash lifecycle** — labor cost accrues from approved time entries (`time_entries` + cost snapshots) or monthly `employee_month_costs` allocation; **no** org-level "שכר צפוי לתשלום / שולם בפועל" except optional Mode B lump-sum expense path (restricted category `internal_employee_payroll`, excluded when workforce data exists).

3. **Organization overview `cashPaid`** = AP vendor payments + subcontract advances only (`get-financials-overview.ts`) — **excludes** any expense-paid-by-cash, payroll, or petty cash. Label "שולם בפועל" is **partial cash out**.

4. **Cash-out forecast excludes finalized expenses** by design (`OUTGOING_NO_AP_DISCLOSURE`) — Owner cannot see upcoming cash for expense-only vendors without AP bills.

5. **Active project "רווח צפוי" (forecast margin)** can look like "money left on contract" when ETC is zero and commitments ignored in mental model — formula uses ETC field + commitments but **does not auto-include** expected labor/subcontractors unless entered.

### What is missing (visibility / product gaps)

| Gap | Impact |
|-----|--------|
| Expense payment confirmation | No proof cash left the business for expenses |
| Payroll upcoming / paid | Labor cost visible; salary cash timing invisible |
| Unified cash-out ledger | AP + expenses + payroll not reconciled in one view |
| Expense → AP bridge for non-vendor-card expenses | Owner must choose Expense OR AP path manually |
| Project-level cash profit | Only accrual margin exists |

---

## B. Business Truth Map

| Concept | Current source (SoT) | Current formula / rule | Current UI label (he-IL) | Correct business meaning | Mismatch | Severity |
|---------|---------------------|------------------------|--------------------------|--------------------------|----------|----------|
| Recognized cost (expense) | `expenses.status=finalized`, NET allocations / direct | Full NET or installment lines ≤ current month | "עלות מוכרת" / "נרשמה בעלויות" | Accrual expense recognized | Partial — hints exist | LOW |
| Expense payable | *None* | N/A | *(absent)* | Amount owed to supplier | YES | **HIGH** |
| Expense paid / cash out | *None* | `paymentMethod` text only | "אמצעי תשלום" (optional) | Cash left bank | YES | **HIGH** |
| AP recognized cost | `ap_bills` status open/matched, `netAmount` | Sum NET lines / allocations | "עלות מוכרת" (AP panel) | Vendor cost accrual | NO | — |
| AP payable (GROSS) | `ap_bills.grossAmount` − payments − credits ± retention | `computeBillOutstanding` | "יתרה לתשלום" | Cash owed to vendor | NO | — |
| AP cash paid | `ap_payments` + applications | Sum recorded payments | "שולם בפועל" | Cash out | NO | — |
| Labor recognized cost | `time_entries` cost snapshot (approved) or `labor_allocation_run_lines` | Rate × hours + burden | "עובדים" in breakdown | Employer cost accrual | NO | — |
| Payroll payable | *None* | N/A | *(absent)* | Salary owed to employees | YES | **HIGH** |
| Payroll cash paid | *None* | N/A | *(absent)* | Salary cash out | YES | **HIGH** |
| PO commitment | `purchase_orders` open amounts | Remaining − consumed | "התחייבויות" | Future cost, not actual | NO | — |
| Billing revenue (NET) | `billing_records.subtotalAmount` finalized | `sumNetInvoicedAmounts` | "חיובים ללקוח" / `billed` KPI | Project revenue ex-VAT | NO | — |
| Billing GROSS / AR | `billing_records.totalAmount` | GROSS − paid − retention | "יתרה לגבייה כולל מע״מ" | Customer owes (incl VAT) | NO | — |
| Cash collected | `payments.paymentDate`, status recorded | Sum in date range | "סכום שהתקבל בפועל" / "נגבה" | Cash in (not revenue) | NO | — |
| Actual profit (project) | `computeProfitPosition` | Contract NET − actual cost (direct or full per mode) | **"רווח צפוי"** (`kpis.actualMargin`) | Current margin on recognized costs | **YES — label** | **MEDIUM** |
| Forecast profit (project) | `computeProfitPosition` | Contract NET − forecast final cost | "רווח צפוי" (`estimatedProfit`, ownerStory) | Expected margin at completion | Partial — name collision | **MEDIUM** |
| Forecast final cost | `computeDirectForecastFinalCost` | Actual + commitments + ETC (+ general in full mode) | "תחזית עלות" | Estimated cost at completion | NO | — |
| Open AP on project KPI | Unmatched AP cash outstanding | Not added to Actual | "חשבוניות ספק פתוחים (תחזית)" | Cash exposure only | NO | — |
| General overhead pool | `general_cost_months` | Pool − allocated = unallocatable | "הוצאות כלליות שלא הוקצו" | Org cost awaiting allocation | NO | — |
| VAT in revenue | Excluded by design | Revenue uses subtotal | Hints in `billedVatHint` | VAT separate | NO | — |
| VAT in profit | Excluded | Contract NET − cost NET | `profitNet` basis string | No VAT in margin | NO | — |

---

## C. Full Chain Maps

### C.1 Application map (current code)

| Layer | Count | Notes |
|-------|------:|-------|
| Pages (`page.tsx`) | **165** | Includes project hub tabs, financials, workforce, AP, billing |
| API routes | **9** | Health, exports, webhooks — not primary business UI |
| Server action entry files | **48** | Expenses, AP, billing, workforce, projects, etc. |
| Repository modules | **118** | Financials, billing, AP, workforce, expenses, procurement, vendors |
| Drizzle schema modules | **39** | Plus **77** SQL migrations (0000–0077 observed) |
| Financial KPI surfaces mapped | **52** | Project KPIs (18), org rollup (12), dashboard (8), overview (8), cash flow (6) |

**Primary financial routes**

| Route | Role |
|-------|------|
| `/projects/[id]` (tabs: financials, expenses, billing, budgets, …) | Project hub |
| `/projects/[id]/financials` | Deep financials |
| `/financials/overview` | Org period summary |
| `/cash-flow` | Cash forecast 2.0 |
| `/reports` | Org analytics |
| `/expenses`, `/procurement/ap`, `/billing` | Operational sources |
| `/workforce/*` | Labor input |
| `/subcontracts`, `/vendors/[id]` | Subcontract/AP |
| `/overhead` | General cost months |
| `/month-close` | Period freeze |

**Project financial composition pipeline**

```
loadProjectFinancialsReadBundle
  → composeProjectFinancials
      commercial (contracts + change orders)
      billing (NET/GROSS/paid/outstanding)
      aggregateProjectCosts (expenses + labor + vendor bills)
      + month-close adjustments
      + general cost allocation
      + commitments + open AP (excluded from actual, in forecast/cash)
      → computeProfitPosition
```

### C.2 Employees → labor cost → project

| Step | SoT | Enters Actual? | Cash? | UI |
|------|-----|----------------|-------|-----|
| Employee master | `employees` | No | No | `/workforce/employees` |
| Compensation | `rate_versions` | No until time | No | Employee detail |
| Assignment | `employee_project_assignments` | No | No | Team tab |
| Attendance | `attendance_days` | No | No | `/workforce/attendance` |
| Time entry | `time_entries` | On approval + cost snapshot | No | `/workforce/time` |
| Timesheet approval | `timesheets` / entry status | Gates recognition | No | Approvals |
| Labor cost | Snapshot on entry or recompute | **Yes** → `laborActual` | **No** | Project breakdown |
| Monthly mode | `employee_month_costs` + `labor_allocation_runs` | **Yes** when applied | **No** | Employee month UI |
| Unallocated labor | Pool in `general_cost_month_sources` | Org pool | No | Dashboard missing-data |
| Payroll payable | **Missing** | — | — | — |
| Salary paid | **Missing** | — | — | — |

**Finding:** Labor cost correctly accrues without implying cash paid. **Gap:** No visibility for "שכר שיצא / צפוי לצאת".

### C.3 Expenses

| Step | SoT | Field / query | Paid implied? |
|------|-----|---------------|---------------|
| Create | `expenses` draft | `expense_date`, NET/GROSS | No |
| Classify | `cost_category_id`, `classification_status` | Required at finalize | No |
| Finalize | `status=finalized`, `finalized_at` | Triggers allocation / installments | **No — but no unpaid state shown** |
| Recognized in project | `expenses.repository` contributions | NET, installment proration | **Accrual only** |
| Payment terms | **Not stored** | — | — |
| Due date | **Not stored** | — | — |
| Paid | **Not stored** | `payment_method` optional metadata | **Owner may assume** |

**Installments:** `installment_count` + `expense_managerial_schedule_lines` — spreads **recognition** across `year_month`, statuses `scheduled|recognized`. Comment in schema: *"Cash payments never create Actual"* (`expenses.ts` L154–156).

### C.4 Vendors / AP

| Concept | SoT | Formula |
|---------|-----|---------|
| PO commitment | `purchase_orders` | Open / partial − received |
| Bill draft | `ap_bills.status=draft` | Not in Actual |
| Bill recognized | status ∈ {open, partially_matched, matched} | `netAmount` → vendor Actual |
| Payable GROSS | `grossAmount` / `totalAmount` | Outstanding after payments, credits, retention |
| Payment | `ap_payments` + `ap_payment_applications` | Cash out |
| Credit | `ap_vendor_credits` + applications | Reduces payable / cost per rules |
| Retention | `retention_held_remaining` | Cash timing only |

**Invariant holds:** Commitment ≠ Actual ≠ Payable ≠ Paid.

### C.5 Subcontractors

| Step | Table / module | Actual vs cash |
|------|----------------|----------------|
| Agreement | `subcontract_agreements` | Commitment value from events |
| Progress / value events | `subcontract_value_events` | Contract value |
| AP bill link | `ap_bills.subcontract_agreement_id` | NET → Actual |
| Advances | `subcontract_advances` | **Cash paid**, not Actual |
| Paid / outstanding | Derived in `subcontracts.repository` | Cash vs billed GROSS |
| Retention | Bill-level fields | Cash holdback |

### C.6 Materials / equipment

| Path | Recognition |
|------|-------------|
| Expense inventory stock | `inventory_stock_purchase` → `inventory_cost_layers`, **not** operating Actual |
| Consumption to project | `inventory_cost_consumptions` | Actual on project when consumed |
| AP bill materials | AP NET recognition |
| Unassigned purchase | Stays in inventory / org until consumed or allocated |

**Finding:** Data does not silently drop when `project_id` null — routes to inventory or general pool with visibility flags.

### C.7 Overhead

| Layer | Mechanism |
|-------|-----------|
| Business overhead expense | `cost_family=business_overhead`, allocations |
| General cost month pool | `general_cost_months` + sources (unallocated expense, labor, AP remainder) |
| Project allocated general | `general_cost_month_allocations` → `allocatedGeneralBusinessCost` |
| Full Actual | Direct + allocated general (`withAllocatedGeneralBusinessCost`) |

**Double-count guard:** Unallocated org costs reported separately; not folded into project profit unless mode `include_general`.

### C.8 Project financial chain (KPIs)

| KPI | SoT | Formula | NET/GROSS | Accrual/Cash |
|-----|-----|---------|-----------|--------------|
| Current contract | `contracts` + approved COs | CCV NET | NET | Commercial |
| Billed (revenue) | Billing finalized | Σ signed subtotal | NET | Accrual revenue |
| Billed GROSS | Billing | Σ totalAmount | GROSS | AR basis |
| Paid / collected | Payments | Σ payment amounts | GROSS typically | **Cash** |
| Outstanding AR | Billing − paid − retention | GROSS | **Receivable** |
| Actual cost | Expenses + labor + AP NET + inventory consume + month-close | NET | **Accrual** |
| Committed | Open PO | NET | Commitment |
| Open AP payable | AP outstanding | GROSS cash | **Payable** |
| Forecast cost | Actual + commitments + ETC (+ general) | NET | Forecast |
| Actual profit | CCV − actual (direct/full) | NET | Accrual margin |
| Forecast profit | CCV − forecast final | NET | Forecast margin |

### C.9 Billing / collections

- Draft editable; finalized immutable; void/credit via reversal rows.
- `signedBillingNetAmount` for revenue; `recordOutstanding` for AR.
- `deriveCollectionStatus`: **paid** when outstanding ≤ 0 — from **payments**, not due date alone.
- Split payments: `payment_applications` (migration 0039).

### C.10 Organization summary

`getOrganizationProjectRollup` + `aggregateOrgReport` — sums project rows in base currency; excludes FX projects with disclosure.

Reconciliation identity (documented in UI):  
`Σ project expense-layer actuals + unallocated org costs = org finalized expense recognition` (labor via time is project-scoped).

### C.11 Cash flow

| Direction | Actual | Forecast |
|-----------|--------|----------|
| In | `computeCollectedActual` (payment dates) | Outstanding billing by `dueDate` |
| Out | AP payments in overview period | Open AP outstanding by `dueDate` |
| Expenses | **Not in cash out** | **Not in forecast** (unless recurring draft forecast item) |
| Payroll | **Not in cash out** | **Not in forecast** |

### C.12 Forecast

True forecast components in code:

```
DirectForecastFinal = ActualDirect + RemainingCommitments + ExpectedRemainingCost
FullForecastFinal    = FullActual + RemainingCommitments + ETC + FutureGeneralForecast
ForecastProfit       = ContractNET − ForecastFinal (per profitability mode)
```

Billing-plan module adds expected progress billing (`billing-plan/data/forecast.repository.ts`).

### C.13 Month close / historical

- `month_close_periods` + DB freeze (migration 0037).
- `monthCloseEconomic` adjustments applied once in compose — closed months not silently rewritten.
- Retro edits blocked via `assertMonthOpenForRewrite` on expense finalize.

### C.14 Permissions (light)

Financial slices gated by `PERMISSIONS.*` (e.g. `PROJECT_FINANCIALS_READ`, `PROJECT_PROFIT_READ`, `AP_READ`, `BILLING_READ`). Org scoping via `organizationId` on all financial tables; RLS in migrations 0001, 0073.

### C.15 Mobile / desktop

Financial KPIs use shared `resolveProjectKpiDisplay` / server loaders — same formulas. Layout differs; **semantics intended identical**. Owner story panel and breakdown available on project financials responsive views.

### C.16 Auto-paid audit (Section 21)

| Location | Behavior | Auto-paid on due/create? |
|----------|----------|-------------------------|
| Billing collection status | `deriveCollectionStatus` | **No** — paid only if outstanding ≤ 0 |
| AP bills | Outstanding derived from payments | **No** |
| Expenses finalize | Recognition only | **No paid flag** |
| Recurring auto-finalize expense | Creates finalized expense (accrual) | **Not cash paid** |
| Subcontract advance `paid_date` | Sets advance status paid | **Cash event for advance**, not expense Actual |
| Cash flow forecast | Due date → bucket only | **No paid inference** |

**No instance found** where due-date alone marks vendor/expense as cash-paid without payment records.

---

## D. Findings

| ID | Domain | Severity | Current behavior | Expected behavior | Root cause | System-wide impact | Recommended solution | Owner decision? |
|----|--------|----------|------------------|-------------------|------------|-------------------|---------------------|-----------------|
| F-001 | Expenses | **HIGH** | Finalize ⇒ full recognized cost (or installment recognition); no payable/paid | Recognized cost ≠ cash; Owner sees when cash expected/paid | No payment entity on `expenses` | Understates cash out; overstates "done paying" mentally | Add expense payable + paid model (see §E) | **YES** |
| F-002 | Payroll | **HIGH** | Labor accrues to Actual; no salary payable/cash | Accrued labor visible; payroll due/paid separate | By design — not payroll system | Owner cannot answer "כמה יצא על שכר" | Payroll payable ledger (manual confirm) or integration | **YES** |
| F-003 | Labels | **MEDIUM** | `kpis.actualMargin` → "רווח צפוי" | Label matches actual margin | Locale key wrong | Misread dashboard/project KPI | Rename to "רווח נוכחי (על בסיס עלות מוכרת)" etc. | **YES** |
| F-004 | Labels | **MEDIUM** | `estimatedProfit` and `actualMargin` both translated "רווח צפוי" in places | Distinct names for forecast vs current | Duplicate/overloaded Hebrew strings | Confusion on active projects | Adopt 2–4 precise terms (§E) | **YES** |
| F-005 | Org overview | **MEDIUM** | `cashPaid` = AP + advances only | Full cash out or relabel | Narrow definition in `get-financials-overview.ts` | Owner thinks expenses/payroll included | Relabel "תשלומי ספק ומקדמות" OR extend ledger | **YES** |
| F-006 | Cash flow | **MEDIUM** | No expense cash forecast | Optional upcoming expense cash | Architectural split Expense≠AP | Blind spot for petty-cash vendors | Future expense due/paid model feeds forecast | **YES** |
| F-007 | Expenses UX | **LOW** | `paymentMethod` optional field | Should not imply paid | Legacy capture field | Minor misleading | Rename "איך שולם (מידע)" + never tie to cash KPI | NO |
| F-008 | Expenses UX | **LOW** | "מספר תשלומים" on expense | Managerial recognition spread | Label from installment feature | Confusion with supplier payment terms | Rename "פיזור עלות לחודשים" | NO |
| F-009 | Profit semantics | **MEDIUM** | Active project forecast profit with ETC=0 looks like "all contract left" | Forecast requires explicit ETC/commitments | Formula correct; mental model gap | Overoptimistic reading | UI guardrail copy + optional "remaining work unset" badge | NO |
| F-010 | Dashboard | **LOW** | `costsThisMonth` uses broad recognized cost SQL | Accrual month costs | Documented in repository comment | Not cash | Hint already partial; strengthen | NO |
| F-011 | Data completeness | **LOW** | Missing time cost → excluded, not zero | Partial actual with flag | `workforce_entries_missing_cost` partial | Understated labor | Existing confidence badges — ensure visible on dashboard | NO |
| F-012 | AP/Expense | **LOW** | Overlap warning on capture | Prevent double Actual | `expense-ap-overlap` module | Duplicate if ignored | Keep; promote in workflow | NO |

---

## E. Owner Decisions Required

### E.1 Profit terminology (do not change UI without approval)

| Field (code) | Formula | What it really is | Suggested Hebrew options |
|--------------|---------|-------------------|--------------------------|
| `actualProfit` / `actualMargin` | CCV NET − actual cost NET | **Current accrual margin** (not cash, not final) | א. "רווח נוכחי (מוכר)" · ב. "מרווח עד היום" · ג. "תוצאה מצטברת מוכרת" |
| `estimatedProfit` / `forecastMargin` | CCV NET − forecast final NET | **Expected margin at completion** (incl. commitments + ETC) | א. "רווח צפוי לסיום" · ב. "מרווח מתוכנן" · ג. "תחזית רווח" |
| Dashboard `actualProfit` sum | Σ row actual profit | Org **current accrual margin** across projects | "סך מרווח נוכחי (מוכר)" |
| `companyProfit` | Org rollup forecast/actual per reports section | Depends on section — often forecast | Disambiguate in reports header |

### E.2 Expense payment confirmation model (options — not implemented)

| Option | Flow | Pros | Cons |
|--------|------|------|------|
| **A — Manual** | Recognized on finalize → due date → Owner marks "שולם" | True cash proof; matches AP pattern | Manual discipline |
| **B — Auto on due** | Due date ⇒ paid | Low friction | **Misstates cash** — not recommended |
| **C — Hybrid** | Due ⇒ "ממתין לאישור תשלום" → Owner confirms | Balance automation + truth | Two-step UX |
| **D — Status quo** | Expense = cost only; cash only via AP | Clean accrual | Expense-only vendors invisible in cash |

**Recommendation:** **C or A** for expenses that are not AP-backed; keep **AP path** for formal vendor invoices. **Do not** auto-paid on due date (B).

### E.3 Payroll payment confirmation model

| Option | Description |
|--------|-------------|
| **P1 — Visibility only** | Monthly "שכר מוכר" vs manual "שכר ששולם" entry (no full payroll) |
| **P2 — Payable per employee-month** | Link to `employee_month_costs` + paid date |
| **P3 — Status quo** | Labor cost only; cash out via AP/expense manually |

**Recommendation:** **P1 or P2** — minimal ledger, not full payroll engine.

### E.4 Automatic vs manual payment status

Current: **Manual payments for AR/AP**; **no paid state for expenses**.  
Proposal: Keep billing/AP manual; add optional manual (or hybrid) for expenses/payroll.

---

## F. End-to-End Scenarios (expected vs actual)

### Employee — September work, salary paid next month

| Check | Expected | Actual system |
|-------|----------|---------------|
| Labor cost recognized in Sep | YES (approved time → snapshot) | **PASS** |
| Salary cash paid in Sep | NO | **PASS** (no paid flag) |
| Payroll due/upcoming visible | YES | **FAIL** — not modeled |
| Project actual includes labor | YES | **PASS** |
| Cash out includes salary | NO until payment recorded | **PASS** (nothing recorded) |

### Expense — Net 30

| Check | Expected | Actual |
|-------|----------|--------|
| Sep 1 finalize ⇒ recognized cost Sep | YES (or installment month) | **PASS** (accrual) |
| Paid = NO | YES | **PASS** (no paid field) |
| Upcoming cash Oct 1 | YES | **FAIL** — no due date |
| Oct 1 auto-paid | NO | **PASS** — no auto-paid |

### Vendor bill NET 100k + VAT 18k, due 60 days

| Check | Expected | Actual |
|-------|----------|--------|
| Actual = 100k NET | YES | **PASS** |
| Payable = 118k | YES | **PASS** |
| Paid = 0 until payment | YES | **PASS** |

### Billing NET 100k + VAT 18k

| Check | Expected | Actual |
|-------|----------|--------|
| Revenue = 100k | YES | **PASS** (`netInvoiced`) |
| Receivable = 118k | YES | **PASS** (outstanding GROSS) |

### Collection 50k

| Check | Expected | Actual |
|-------|----------|--------|
| Cash in = 50k | YES | **PASS** |
| Revenue delta = 0 | YES | **PASS** |

### Active project contract 1M, actual 100k

| Check | Expected | Actual |
|-------|----------|--------|
| Do NOT show 900k "profit" without ETC | YES | **PASS** if ETC=0 → forecast cost ≈ actual + commitments only |
| User misreads "רווח צפוי" KPI | Risk | **FINDING F-003/F-004** |

---

## G. Reconciliation (design-level)

| Identity | Designed to hold? | Notes |
|----------|-------------------|-------|
| Project Actual vs expense+labor+AP sources | **Yes** | Dedup rules in compose |
| Labor allocated + unallocated = pool | **Yes** | Dashboard labor reconciliation card |
| AP NET Actual vs bills | **Yes** | Single recognition path |
| AP cash vs payments | **Yes** | Applications sum |
| Billing NET vs revenue KPI | **Yes** | Test covered |
| VAT in revenue | **0** | NET subtotal used |
| VAT in profit | **0** | NET contract − NET cost |
| Collections vs payments | **Yes** | `payment_applications` |
| Open AR formula | GROSS − paid − retention | **Yes** (`recordOutstanding`) |
| Expense cash vs paid | **N/A** | No expense paid entity |

---

## H. Misleading Labels (Hebrew sample)

| Label | User thinks | Code calculates | Mismatch |
|-------|-------------|-----------------|----------|
| רווח צפוי (`kpis.actualMargin`) | Future profit | Contract − **actual** cost | **YES** |
| רווח בפועל (dashboard headline) | Cash or final | Sum accrual margins | Partial |
| שולם בפועל (overview costs) | All cash out | AP payments + advances | **YES** |
| מספר תשלומים (expense) | Payment schedule | Cost recognition spread | **YES** |
| הוצאה / רישום הוצאה | Money paid | Cost recognized | Partial (banner helps) |
| חשבוניות ספק (תחזית) on project | Cost | Cash payable | NO (hint ok) |
| נגבה | Cash received | Payment sum | NO |
| תחזית עלות | May include all future | Actual+commitments+ETC | NO if ETC entered |

---

## I. Do Not Fix Yet

This document completes **Phase 1 — REPORT FIRST**. No repairs were applied. Implementation waits Owner review of §E decisions.

---

## FINAL REPORT SUMMARY

```
PROJECTFLOW GROUND-UP BUSINESS AUDIT

Existing reports used as authority = NO

Routes mapped = 165 pages + 9 API routes + 48 action files
Financial/business surfaces mapped = 52 KPI/card surfaces
Sources of truth mapped = 14 domains (expense, AP, billing, labor, PO, subcontract, inventory, overhead, cash, profit, forecast, month-close, collections, org rollup)
Repositories referenced = 118

Employees = PASS (master data) / FINDINGS (no payroll cash)
Attendance = PASS
Labor cost = PASS (accrual) / FINDINGS (missing cost partials)
Payroll cash lifecycle = FINDINGS (not modeled)

Expenses = PASS (accrual recognition) / FINDINGS (no payment lifecycle)
Expense payment lifecycle = FINDINGS (missing)

Vendors/AP = PASS
Subcontractors = PASS (Actual vs cash split incl. advances)
Materials = PASS (inventory layer)
Overhead = PASS (pool + allocation)

Billing NET/VAT/GROSS = PASS
Collections = PASS
AR = PASS
Cash In = PASS
Cash Out = PARTIAL (AP+advances only; no expense/payroll)

Project Actual = PASS
Project Forecast = PASS (real formula)
Profitability = FINDINGS (labels + semantics)
Organization result = PASS with FINDINGS (cashPaid scope)

Misleading financial labels = 8 documented
Incorrect business calculations = 0 critical formula bugs found in code review
Missing lifecycle states = 2 major (expense paid, payroll paid)
Missing owner visibility = 3 (payroll cash, expense cash, full cash-out)

VAT in Revenue = 0.00 (NET subtotal) — PASS
VAT in Profit = 0.00 (NET basis) — PASS

Actual vs Paid semantics = FAIL (expenses/labor conflated visually)
Due vs Paid semantics = PASS (AP/AR) / FAIL (expenses — no due)
Expected vs Actual semantics = PARTIAL (forecast exists; labels overload "צפוי")

Owner decisions required = 4 areas (profit terms, expense payment model, payroll cash model, cashPaid scope)

Code changed = NO
DB changed = NO
Data changed = NO
Commit = NONE
Push = NONE
Deploy = NONE

FINAL STATUS = READY FOR OWNER BUSINESS REVIEW
```

---

*End of audit report.*
