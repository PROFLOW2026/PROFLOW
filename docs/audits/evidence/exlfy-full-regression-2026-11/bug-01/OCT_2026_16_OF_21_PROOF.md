# BUG-001 — Proof: why 16 of 21 for Eran Yosef · October 2026

**Mode:** Production read-only (`rnjeggpsjchayprygkcw`). No writes.  
**Date of investigation:** 2026-11-14.

---

## Exact source rows

### A. Employer month cost (authoritative accrual write)

| Field | Value |
|-------|--------|
| id | `038917ac-8a25-4949-9e52-c5e15beaeac4` |
| employee_id | `1651af31-5f63-425d-a518-a9fa84931ecd` (ערן יוסף) |
| year_month | `2026-10` |
| status | `applied` |
| known_amount / estimated_amount | `25142.860000` |
| source | `compensation_derived` |
| recognition_source | `monthly_allocated` |
| **notes (engine-written)** | `Defined monthly employer cost 33000.000000; accrued to date 25142.860000 (16 of 21 work days)` |
| created_at | `2026-10-11 13:42:50.038601+00` |
| **updated_at** | **`2026-10-23 09:22:23.123545+00`** |

### B. Payroll obligation (alert amount)

| Field | Value |
|-------|--------|
| id | `c35d5f56-7b11-4ea2-835e-f40025715621` |
| expected_amount | `25142.860000` |
| payment_status | `upcoming` |
| obligation_source | `period_accrual` |
| due_date | `2026-11-10` |
| created_at | `2026-10-11 13:42:50.038601+00` |
| updated_at | `2026-10-23 09:22:24.809+00` |

### C. Active labor run (company cost bucket)

| Field | Value |
|-------|--------|
| id | `0cf05681-5f6a-4320-91f9-bdf7f5e97c98` |
| status | `applied` |
| company_only_amount | `25142.860000` |
| allocated_amount | `0` |
| applied_at | `2026-10-23 09:22:24.303+00` |

---

## Function chain (proven)

1. `computeMonthlyEmployeeLaborAllocationDraft` / recompute path — `src/modules/workforce/application/monthly-cost-recompute.ts`
2. `listConfiguredWorkDatesInRange` + `recognizeMonthlyEmployerPoolByCalendar` — `src/modules/workforce/domain/monthly-accrual.ts`
3. Notes via `describeMonthlyEmployerCostRecognition` — same file (exact string template)
4. Payroll sync: `syncPayrollExpectedFromLaborRecompute` + `ensurePayrollObligationFromAccrual` — `payroll-payments.ts` (called from recompute ~L594)

---

## Source of **21** (denominator) — PROVEN

Org setting `labor_cost_defaults`:

```json
"workWeekdays": [0, 1, 2, 3, 4]
```

(= Sunday–Thursday, JS `getUTCDay`).

`resolveMonthlyAccrualDenominator` uses **calendar eligible workday count** when `> 0` (not the rate-field `working_days_per_month=5`).

Eligible Sun–Thu dates in **2026-10** (full month):

```
01,04,05,06,07,08,11,12,13,14,15,18,19,20,21,22,25,26,27,28,29
```

**Count = 21.** Matches notes `of 21 work days`.

---

## Source of **16** (numerator) — PROVEN

Open-month path: `asOfDate = today` in org timezone (`Asia/Jerusalem`) while month not complete.

Last recompute timestamp: **2026-10-23 09:22:23 UTC** → local **2026-10-23**.

Eligible workdays from `2026-10-01` through `2026-10-23`:

```
01,04,05,06,07,08,11,12,13,14,15,18,19,20,21,22
```

(23 Oct 2026 is Friday → **not** in `[0,1,2,3,4]`.)

**Count = 16.** Matches notes `(16 of 21 work days)`.

Math: `33000 × 16 / 21 = 25142.857…` → stored `25142.860000` (engine rounding).

---

## Why owner got proration despite attendance exemption — PROVEN

| Layer | Behavior |
|-------|----------|
| Attendance | `owner_manager` → `attendanceRequired = false` (`attendance-requirement.ts`) — **clock-in UI only** |
| Accrual (pre-`fd136c18`) | `owner_manager` + `company_only` forced `recognizeFullMonth = true` |
| Accrual (commit `fd136c18`, 2026-10-23) | Same as employees: open month accrues elapsed workdays |
| Eran row | `compensation_class=owner_manager`, `default_labor_allocation_intent=company_only` |

Exemption does **not** feed `listConfiguredWorkDatesInRange`.

---

## Should October have refreshed after month end? — PROVEN stale

As of investigation calendar **2026-11-14**: `shouldRecognizeFullEmployerMonth` → true for `2026-10` (`yearMonth < currentYearMonth`).

EMC/payroll **still** `25142.86`; **last write 2026-10-23**. No later recompute observed. CC read path does not recompute.

---

## Other months (Eran applied EMC)

| Month | known_amount | notes pattern |
|-------|--------------|---------------|
| 2026-01…07 | actuals ~24k–28k (≠ defined 27k) | no accrual notes |
| 2026-08 | 26900 (est 33000) | no accrual notes |
| 2026-09 | 34957 (est 33000) | no accrual notes |
| **2026-10** | **25142.86** | **only row with `(N of W work days)` notes** |

Open-month accrual label is unique to October among applied rows.

---

## Business impact — PROVEN scope

| Surface | Affected? | Evidence |
|---------|-----------|----------|
| Alert / CC `payroll_overdue` | Yes | `expected_amount=25142.86`, `obligation_source=period_accrual` |
| Employer cost recognition (EMC) | Yes | `known_amount=25142.86` |
| Company-only labor allocation | Yes | `company_only_amount=25142.86` |
| Project allocated labor | No (0) | `allocated_amount=0` |
| Cash paid | No yet | `payment_status=upcoming`, `paid_at` null |
| Recompute also calls `tryRecomputeOpenGeneralCostMonth` | Possible side path | code L608–611 — Oct general-cost refresh at that timestamp **not separately dumped** |

Not “alert-only”: the same known amount is the labor cost pool for the owner month.
