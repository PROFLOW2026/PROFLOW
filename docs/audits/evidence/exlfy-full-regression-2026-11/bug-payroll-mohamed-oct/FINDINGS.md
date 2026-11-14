# Payroll · מוחמד נציר · 2026-10 — FINDINGS

**Date:** 2026-11-14  
**Org:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`  
**Employee:** מוחמד נציר · `4922ae6a-346b-4b99-9829-76d272cef484`  
**Scope:** Production read-only SQL · code trace · targeted fixes (no Prod data writes)

---

## Production evidence (read-only)

### Active employer month cost chain (2026-10)

| id (short) | status | estimated | actual | known | known_quality | notes |
|------------|--------|-----------|--------|-------|---------------|-------|
| `5e7d6c2f…` | **superseded** | 8250 | — | 8250 | estimated | Oct accrual (21/21) |
| `26a2e33c…` | **superseded** | 8250 | **8205** | **8205** | **actual** | correction adjustment |
| `12fb7c91…` | **applied** | 8250 | — | 8250 | estimated | **«Return to estimate»** |

Timestamps (UTC): correction supersede `2026-11-14 09:59–10:01`; return-to-estimate applied `2026-11-14 10:01:19`.

### Payroll obligation

| payment_id | expected | paid_at | payment_status (stored) | due_date |
|------------|----------|---------|-------------------------|----------|
| `1b3cd3cb…` | **8250** | **null** | **upcoming** | **2026-11-10** |

No voided duplicate rows.

### Alert semantics

Command Center derives **`payroll_overdue`** from **due date vs org today**, not from stored `payment_status`. With today **2026-11-14** and due **2026-11-10**, an unpaid row correctly surfaces as overdue even when stored status is still `upcoming`.

---

## Owner five questions

1. **Was employer cost correction persisted in DB?**  
   **Partially, then reverted.** A superseded adjustment row holds actual **8205** / known_quality **actual**, but the **active applied** row was replaced at 10:01 UTC via **`returnMonthlyEmployerCostToEstimate`** (note: *Return to estimate*). Effective truth is **8250 estimated**, not 8205.

2. **Did expected payroll amount update?**  
   **No.** `employee_payroll_payments.expected_amount` remains **8250** (last updated 2026-10-29). The correction path did not sync unpaid obligations; reverted EMC again matches 8250.

3. **Was actual payment recorded?**  
   **No.** `paid_at` and `paid_amount` are null.

4. **Does the alert correctly reflect payment state?**  
   **Yes.** Unpaid obligation past due → overdue alert is correct. Alert amount (8250) matches active EMC known amount, not the brief 8205 correction.

5. **Does UI clearly separate employer-cost correction vs confirm-paid?**  
   **Improved.** Cost-review already had `payrollConfirmSeparateHint` and hid «sync paid» unless `payrollObligationPaid`. Payroll panel now derives badge from **due date vs today** (so Mohamed shows **באיחור**, not stale **צפוי**), plus explicit copy that cost correction ≠ confirm paid. **Still never auto-marks paid.**

---

## Root cause

1. **Owner workflow:** Successful supersede correction to 8205, then **explicit return-to-estimate** (secondary button visible when `monthRow.actualAmount` is set), restoring 8250 on the active row.
2. **Product gap (fixed in repo):** `correctMonthlyEmployerCostActual` re-applied labor but **did not** call `syncPayrollExpectedFromLaborRecompute`, so unpaid `expected_amount` would stay at the pre-correction accrual even when a correction sticks.
3. **Not a false overdue:** Payment is genuinely unpaid and past due; overdue notification is expected until Owner uses **confirm paid** on the payroll panel (separate from employer-cost correction).
4. **Stale badge:** Panel used stored `payment_status` (`upcoming`) while Command Center already used due-date urgency — fixed via `resolveDisplayedPayrollPaymentStatus`.

---

## Code changes (this investigation)

| File | Change |
|------|--------|
| `src/modules/workforce/application/employer-month-costs.ts` | Sync unpaid payroll `expected_amount` after owner cost correction |
| `src/modules/workforce/domain/payroll-obligation.ts` | Shared unpaid + displayed status resolvers |
| `src/modules/command-center/data/collect-owner-payments.ts` | Use shared resolver |
| `src/modules/workforce/ui/monthly-employer-cost-review.tsx` | Hide «sync paid» unless obligation already paid |
| `src/modules/workforce/ui/employee-payroll-month-panel.tsx` | Due-date badge + cost≠paid copy |
| `src/app/.../workforce/employees/[employeeId]/page.tsx` | Pass `payrollObligationPaid` |
| `tests/unit/workforce/unpaid-payroll-alert-status.test.ts` | Focused unit tests |

---

## Recommended Owner actions (Prod — manual, not automated here)

1. Re-enter actual employer cost **8205** via **תיקון עלות מעסיק** (after deploy: obligation should sync to 8205).
2. Do **not** press **חזור להערכה** unless estimate-only is intended.
3. When cash is paid, use **אשר ששולם** on the payroll panel (not the employer-cost CTA).

**No Production SQL or payment rows were modified by this investigation.**