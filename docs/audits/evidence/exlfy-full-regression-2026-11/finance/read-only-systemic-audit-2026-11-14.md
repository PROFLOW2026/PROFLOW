# Finance + payroll systemic audit (read-only)

**Date:** 2026-11-14  
**HEAD:** `b2f0b9e7`  
**Scope anchor commits:** `0c43a36e`, `787623f0`, `3cffcab7`, `b2f0b9e7`  
**Method:** Static code trace + focused vitest (no DB, no prod writes)

## Commit-range finance touch

`git log 0c43a36e~5..b2f0b9e7 -- src/modules/{financials,expenses,ap,billing,workforce}` → **empty** (no finance/payroll source changes in range).

Migrations in range: `0201` planning/goals, `0202` automation presets, `0203` tasks `work_package_id` — no finance schema.

Indirect: `session.ts` adds `organizationOpenTaskCounts` for org switcher only.

## Targeted tests (pass)

- `tests/unit/financials/net-actual-and-money-input.test.ts`
- `tests/unit/expenses/tax.test.ts`
- `tests/unit/financials/org-report-aggregate.test.ts` (vatNotProfit)
- `tests/unit/workforce/pre0021-ux-gates.test.ts`
- `tests/unit/expenses/installment-payment-recognition.test.ts`

## Salary / payroll approval route map

| Route | Role | Error surface |
|-------|------|---------------|
| `/workforce/employees/[employeeId]?yearMonth&focus=payroll&paymentId` | Month cost review + payroll confirm (`MonthlyEmployerCostReview`, `EmployeePayrollMonthPanel`) | Broad `catch` → `notFound()` (no segment `error.tsx`) |
| `/workforce/time/approvals` | Time/OT approval (feeds labor actual) | `workforce/time/approvals/error.tsx` → generic `errors.errorPage` |
| `/workforce/attendance/monthly` | Attendance grid (costing input) | Throws `AuthorizationError`; no local `error.tsx` |
| Command Center → `payrollAlertHref` | Deep link to employee payroll focus | Same as employee detail |

## Business-rule anchors (code)

- VAT ≠ profit: `aggregate-org-report.ts` (`vatNotProfit`), `expenses.repository.ts` net authoritative
- Payment-month recognition: `installment-payment-recognition.ts`
- Owner month rewrite bypass: `month-close/manage-periods.ts` `assertMonthOpenForRewrite` + `isOrganizationOwner`
- Owner payroll retro: `payroll-payments.ts` `reviseConfirmedPayroll*`
- Owner employer-cost retro: `employer-month-costs.ts` `correctMonthlyEmployerCostActual`
