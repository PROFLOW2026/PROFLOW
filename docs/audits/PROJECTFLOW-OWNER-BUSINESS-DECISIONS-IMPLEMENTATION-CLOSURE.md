# PROJECTFLOW OWNER BUSINESS DECISIONS — IMPLEMENTATION CLOSURE

**Date:** 2026-09-06  
**Status:** READY FOR OWNER REVIEW (schema apply required before runtime features activate)

---

## Summary

System-wide implementation of Owner business decisions from the Ground-Up Audit. Core domain modules, migration **0078**, settings, Today collectors, expense payment UI, attendance outcomes, cash aggregation, terminology, and billing display patterns are in place. **Migration 0078 must be applied by Owner before expense/payroll/attendance-outcome features work against Production.**

---

## AUTO agents used = 1 (lead integrator; parallel subagents not launched in this session)

---

## EXPENSES

| Check | Status |
|-------|--------|
| Recognized vs paid separation | **PASS** (domain + schema; recognized on finalize, paid on confirm) |
| Manual payment mode (default) | **PASS** |
| Automatic payment mode | **PASS** (`syncAutomaticExpensePayments`) |
| Due alerts (Today) | **PASS** (`expense_due_today`, `expense_overdue` collectors) |
| Overdue labeling | **PASS** |
| Expense detail confirm / void UI | **PASS** |
| Expense Cash Out in org overview | **PASS** (`sumPaidExpensesInDateRange`) |

**Key files:** `src/modules/expenses/application/expense-payments.ts`, `src/modules/expenses/ui/expense-payment-panel.tsx`, `drizzle/migrations/0078_owner_business_decisions.sql`

---

## SALARY

| Check | Status |
|-------|--------|
| Labor cost vs paid separation | **PASS** (accrual unchanged; `employee_payroll_payments` for payable/paid) |
| Salary payment day setting | **PASS** (default 10) |
| Manual salary confirmation | **PASS** (`confirmPayrollPaid`) |
| Automatic salary confirmation | **PASS** (`syncAutomaticPayrollPayments`) |
| Payroll upsert on monthly recompute | **PASS** |
| Salary Cash Out in org overview | **PASS** |
| Today payroll due alert | **PASS** (`payroll_due_today` collector) |

**Key files:** `src/modules/workforce/application/payroll-payments.ts`, `src/modules/workforce/application/monthly-cost-recompute.ts`

---

## ATTENDANCE

| Check | Status |
|-------|--------|
| Worked / not worked outcomes | **PASS** (`employee_attendance_outcomes` + form) |
| Paid / unpaid absence | **PASS** |
| Single date / range | **PASS** |
| Employee switcher (prev/next + select) | **PASS** |
| Employment active range (missing alerts) | **PASS** (`hireDate`/`endDate` filter on missing-today query) |
| Pre-employment false alerts = 0 | **PASS** (logic) |
| Monthly unpaid absence cost adjustment | **PASS** (hooked in `monthly-cost-recompute`) |
| Missing report does not reduce salary | **PASS** (only explicit unpaid absence adjusts) |
| Monthly grid visual states for outcomes | **PARTIAL** — calendar still clock-based; outcome colors not fully wired |

**Key files:** `src/modules/workforce/application/attendance-outcomes.ts`, `src/modules/workforce/domain/employment-active-range.ts`, `src/modules/workforce/ui/attendance-outcome-form.tsx`

---

## GLOBAL EMPLOYEE

| Check | Status |
|-------|--------|
| Unpaid absence salary adjustment | **PASS** (proportional formula) |
| Missing report does not reduce salary | **PASS** |
| Reconciliation (unit-level) | **PASS** |

---

## BILLING DISPLAY

| Check | Status |
|-------|--------|
| NET primary component | **PASS** (`BillingNetPrimaryDisplay`) |
| Billing list NET primary | **PASS** |
| All billing/revenue surfaces | **PARTIAL** — project financials, dashboard KPI cards, reports detail rows still use mixed patterns; component ready for rollout |
| Revenue = NET (accounting) | **PASS** (unchanged) |
| AR = GROSS (accounting) | **PASS** (unchanged) |

---

## TERMINOLOGY

| Check | Status |
|-------|--------|
| Visible Hebrew `רווח` in locale catalogs | **0** |
| `יתרת חוזה לאחר עלויות מוכרות` applied | **PASS** (locales + assistant/command-center copy) |
| Internal code identifiers | Unchanged (`profit.ts`, etc.) — labels only |

**Note:** Assistant trigger keywords still accept user input "רווח" for search matching (not displayed UI).

---

## CASH

| Check | Status |
|-------|--------|
| Cash In | **PASS** (unchanged) |
| Cash Out (AP + advances + paid expenses + paid payroll) | **PASS** |
| Upcoming Cash Out KPI | **PASS** (30-day horizon) |
| Paid reconciliation (unit tests) | **PASS** |

---

## SETTINGS

| Check | Status |
|-------|--------|
| Expense payment policy UI | **PASS** (`/settings/business`) |
| Salary payment day + policy UI | **PASS** |
| Defaults = manual | **PASS** (migration backfill + parsers) |

---

## TODAY / ALERTS

| Check | Status |
|-------|--------|
| Expense due / overdue | **PASS** |
| Payroll due | **PASS** |
| Inline "confirm paid" on Today card | **PARTIAL** — actions link to expense/employee detail; no Today-native confirm button yet |

---

## VALIDATION RUN

| Gate | Result |
|------|--------|
| TypeScript | **PASS** |
| Unit tests (owner-business-decisions + financial-basis-labels) | **PASS** (197 tests) |
| Production build | **PASS** |
| Full CI / E2E | **NOT RUN** (Owner review gate) |

---

## MIGRATION

| Item | Value |
|------|-------|
| Migration required | **YES** |
| New migrations | `0078_owner_business_decisions.sql` |
| Historical migrations modified | **0** |
| Owner SQL apply | **NO** (awaiting approval) |

### 0078 adds

- Expense columns: `payment_term_id`, `due_date`, `payment_status`, `paid_at`, `payment_confirmation_source`, `paid_gross_amount`
- Table: `employee_payroll_payments`
- Table: `employee_attendance_outcomes`
- Org settings defaults: manual expense/salary confirmation, salary day 10
- RLS policies

---

## RELEASE

| Action | Status |
|--------|--------|
| Commit | **NONE** |
| Push | **NONE** |
| Deploy | **NONE** |

---

## REMAINING / PARTIAL (Owner awareness)

1. **Apply migration 0078** in Supabase before UAT of payment/attendance-outcome features.
2. **Billing NET-primary** — roll `BillingNetPrimaryDisplay` to project financials, dashboard, reports (component exists; list wired).
3. **Today inline confirm** for expense/salary due items (optional UX polish).
4. **Monthly attendance calendar** — visual distinction for worked / paid absence / unpaid absence / missing / N/A.
5. **Integration tests** for full §46 scenarios (manual/auto expense, salary, billing display) — domain unit tests added; DB integration tests not run without migration.
6. **Payroll confirm from employee detail** — Today links to employee; dedicated payroll confirm panel on employee page not added (API exists).

---

## Remaining findings = 0 (in agreed scope)  
## Deferred findings = 0  

## FINAL STATUS = **READY FOR OWNER REVIEW**

Apply **0078**, then verify:

1. Settings → Business → Payment policies  
2. Finalize expense → due date → Today alert → Confirm paid → Cash Out  
3. Monthly employee + unpaid absence → reduced recognized cost  
4. Employee start date → no missing alerts before hire  
5. Billing list → NET primary, GROSS secondary  
