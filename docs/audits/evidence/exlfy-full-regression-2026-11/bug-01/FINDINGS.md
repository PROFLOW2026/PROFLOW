# BUG-01 — Owner salary alert ₪25,142.86 vs settings ₪33,000

**Audit mode:** READ-ONLY (code + tests)  
**Date:** 2026-11-14  
**Subject:** ערן יוסף (`owner_manager`), Oct 2026 payroll overdue alert  

## Amount identity (verified)

| Interpretation | Oct 2026 value | Matches ₪25,142.86? |
|----------------|----------------|---------------------|
| Full monthly **employer cost** (22k + 50%) | ₪33,000.00 | No |
| Full **base salary** only | ₪22,000.00 | No |
| **Prorated employer cost** (open-month accrual) | ₪33,000 × (16 ÷ 21) = **₪25,142.857… → ₪25,142.86** | **Yes** |

Denominator 21 = configured work weekdays in Oct 2026; numerator 16 = elapsed eligible workdays through **2026-10-23** (canonical test fixture in `owner-employer-cost-invariant.test.ts`).

## Alert pipeline (verified)

1. `collectPayrollDueToday` → `listUnpaidPayrollPayments` → `employee_payroll_payments.expectedAmount`
2. Display: `moneyLabel(fromNumericString(row.expectedAmount))` in `why` / metadata
3. `expectedAmount` written by `syncPayrollExpectedFromLaborRecompute` / `ensurePayrollObligationFromAccrual` from `knownAmountStr` after `recomputeMonthlyEmployeeCostForOpenMonth`
4. `knownAmountStr` = **accrued** employer pool from `computeMonthlyEmployeeLaborAllocationDraft` (not defined full month while month is open)

## Regression commit

**fd136c18** (2026-10-23): removed owner `company_only` exemption from `recognizeFullMonth`; introduced `shouldRecognizeFullEmployerMonth`. Owner open months now accrue like standard monthly employees.

Listed SHAs (787623f0, 3cffcab7, b2f0b9e7, 0c43a36e) — **not payroll-related** (BOQ client, CI/locales, EXLFY sprint packaging).

## Staleness risk (hypothesis, code-supported)

Command center **does not** call `recomputeMonthlyEmployeeCostForOpenMonth` before listing payroll. Owner `company_only` is excluded from `ensureOpenMonthlyLaborFreshForProject` (project time/allocation scoped). Daily accrual tick depends on attendance/time/compensation/bootstrap paths.

If UI is observed **after** Oct 2026 closed (Nov 2026+) still showing ₪25,142.86 on Oct row → likely **stale `expectedAmount`** until recompute (expected ₪33,000 when `yearMonth < currentYearMonth`).

## Cross-check checklist

| # | Result |
|---|--------|
| Calculation source | `monthly-cost-recompute.ts` + `monthly-accrual.ts` → `payroll-payments.ts` → `collect-owner-payments.ts` |
| Amount semantics | Employer cost accrual (burden included), not net base |
| Settings vs EMC/payroll | Settings = defined full month; open obligation = accrued pool |
| Proration | Intentional calendar workday proration for open months |
| Other employees | Same engine; tests use similar accrual (e.g. ₪5,449.09 unpaid fixture) |
| Project profitability | Same `knownAmount` path when recompute ran; not double-counted with cash payroll per `canonical-payroll-cash.ts` |
| Historical preservation | Closed month skip; `knownQuality=actual` preserves without payroll sync |
| Post-correction alerts | `syncPayrollExpectedFromLaborRecompute` updates unpaid rows; paid via `reviseConfirmedPayrollAmount`; no recompute on CC read |
