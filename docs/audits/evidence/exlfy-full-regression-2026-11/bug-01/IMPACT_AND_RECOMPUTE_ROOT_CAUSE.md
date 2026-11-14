# BUG-001 — Impact scope + why October did not refresh (Prod read-only)

**Investigation date:** 2026-11-14 · No recompute run · No writes.

---

## 1. Eran Yosef — 2026 months

Defined rates: Jan–Jul base 18k / employer 27k · Aug– Oct base 22k / employer 33k.

| Month | Base def | Emp. def | EMC known | Quality/source | Company-only | Pay expected | Paid | Pay status | EMC updated | Gap class |
|-------|---------:|---------:|----------:|----------------|-------------:|-------------:|-----:|------------|-------------|-----------|
| 2026-01 | 18000 | 27000 | 24251 | actual/adjustment | 24251 | 27000 | 24251 | paid | 2026-09-23 | Manual actual (not stale accrual) |
| 2026-02 | 18000 | 27000 | 28197 | actual/adjustment | 28197 | 27000 | 28197 | paid | 2026-09-23 | Manual actual |
| 2026-03 | 18000 | 27000 | 28054 | actual/adjustment | 28054 | 27000 | 28054 | paid | 2026-09-23 | Manual actual |
| 2026-04 | 18000 | 27000 | 23440 | actual/adjustment | 23440 | 27000 | 23440 | paid | 2026-09-23 | Manual actual |
| 2026-05 | 18000 | 27000 | 26962 | actual/adjustment | 26962 | 27000 | 26962 | paid | 2026-09-23 | Manual actual |
| 2026-06 | 18000 | 27000 | 26876 | actual/adjustment | 26876 | 27000 | 26876 | paid | 2026-09-23 | Manual actual |
| 2026-07 | 18000 | 27000 | 26853 | actual/adjustment | 26853 | 27000 | 26853 | paid | 2026-09-23 | Manual actual |
| 2026-08 | 22000 | 33000 | 26900 | actual/adjustment | 26900 | 27000 | 26900 | paid | 2026-10-11 | Manual actual |
| 2026-09 | 22000 | 33000 | 34957 | actual/adjustment | 34957 | 33000 | 34957 | paid | 2026-10-11 | Manual actual |
| **2026-10** | **22000** | **33000** | **25142.86** | **estimated / compensation_derived** · notes 16/21 | **25142.86** | **25142.86** | null | **upcoming** · period_accrual | **2026-10-23** | **STALE open-month accrual** · gap **7857.14** vs full 33000 |

---

## 2. Other employees — past-month accrual notes

Past months (`year_month < current Asia/Jerusalem month`) with `accrued to date` notes:

| Employee | Month | Notes | known | defined | gap |
|----------|-------|-------|------:|--------:|----:|
| מוחמד נציר | 2026-10 | 21 of 21 | 8250 | 8250 | **0** |
| סאלח נציר | 2026-10 | 21 of 21 | 7150 | 7150 | **0** |
| פאדי מנצור | 2026-10 | 21 of 21 | 8250 | 8250 | **0** |
| **ערן יוסף** | **2026-10** | **16 of 21** | **25142.86** | **33000** | **7857.14** |

Nov 2026 open accruals (10 of 22) for other employees = **correct mid-month** — not past-month stale.

**Affected stale count:** 1 employee · 1 month · gap **₪7,857.14**.

---

## 3. Recompute mechanism — proven answers

| Question | Proven answer |
|----------|----------------|
| What triggers recompute? | Attendance/time save; compensation/rate change; manual `bootstrapOpenPeriodWorkforceCosting`; project financials `ensureOpenMonthlyLaborFreshForProject` (only employees with **project** alloc/time) |
| Auto at month end? | **No** dedicated month-end workforce roll-forward found |
| Scheduled cron? | Daily ops worker exists; **no** monthly accrual roll-forward for employer costs |
| Screen entry? | CC/payroll **read does not** recompute |
| Salary change? | **Yes** — `recomputeOpenMonthsAfterCompensationChange` |
| Month close block? | Org/employee `closed` → skip; Eran Oct is `applied` not `closed` |
| Does `applied` skip forever? | **No** — recompute supersedes applied run/month then rewrites (when invoked) |
| Sync payroll? | **Yes** — `syncPayrollExpectedFromLaborRecompute` after successful recompute |
| Why Eran Oct stuck? | Last write 23.10 (16/21). Others refreshed late Oct to 21/21 via attendance/time paths. Eran is `owner_manager`+`company_only` (no project lines → **excluded** from project freshness) and attendance-exempt (fewer incidental triggers). **No month-boundary job** ever ran to promote past open-month accruals to full recognition. |

---

## 4. Financial surfaces — Eran Oct gap 7857.14

| Report / store | Current | Expected if full-month rule | Gap | Proven? |
|----------------|--------:|----------------------------:|----:|---------|
| EMC known / company_only run | 25142.86 | 33000 | 7857.14 | Yes |
| Payroll expected (unpaid) | 25142.86 | 33000 | 7857.14 | Yes |
| Cash paid / bank | 0 | 0 | 0 | Yes (upcoming) |
| Project labor allocation (Eran) | 0 | 0 | 0 | Yes |
| `general_cost_months` Oct `labor_company_only` | **25142.86** (aggregate) | 33000 | **7857.14** | Yes — equals Eran alone |
| Oct general cost pool | 35835.20 | ~43692.34 (+7857.14) | 7857.14 | Yes (pool includes that source) |
| Project profitability (Eran labor) | unaffected | — | 0 | Yes (no project lines) |
| Cash-flow forecast payroll_obligation | uses 25142.86 | 33000 if policy=full | 7857.14 | Yes (reads expected) |
| Paid months Jan–Sep | actuals | intentional | n/a | Not bugs |

---

## 5. Safe repair direction (recommendation only)

1. **Do not** `UPDATE` amounts on `applied` in place → hits `employee_month_costs_immutability_guard` (BUG-002).
2. Use existing **`recomputeMonthlyEmployeeCostForOpenMonth`** (supersede → draft → apply) for Eran `2026-10` only after Owner approval — unpaid `period_accrual` may sync expected.
3. Preserve `known_quality=actual` months (Jan–Sep) via `shouldPreserveRecordedActualEmployerCost`.
4. Prevention: month-boundary / daily job for past open estimated accruals + include `company_only` owners outside project freshness; or auto-bootstrap on first Nov business day.
5. Keep Owner retro path as **supersede/adjustment**, never blind in-place amount edit.
