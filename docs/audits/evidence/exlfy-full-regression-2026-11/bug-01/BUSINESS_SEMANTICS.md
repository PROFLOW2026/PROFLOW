# BUG-001 — Business semantics (read-only)

**Audit date:** 2026-11-14 (calendar after October 2026)

## Four money concepts (must stay separate)

| Concept | Typical source | Oct owner example |
|---------|----------------|-------------------|
| **Base salary** | Compensation `baseRate` monthly | ₪22,000 (`rate_versions` from 2026-08-01) |
| **Employer cost pool (defined)** | base × (1 + burden%) | ₪33,000 |
| **Recognized / accrued employer cost** | open-month workday proration of pool | ₪25,142.86 at **16/21** — **PROVEN in Prod** (see `OCT_2026_16_OF_21_PROOF.md`) |
| **Paid salary (cash)** | `employee_payroll_payments.paidAmount` when confirmed | not paid (`upcoming`) |

Alert amount = **row 3 written into payroll `expectedAmount`**, labeled in UI as salary overdue.

### Proven 16/21 (2026-11-14 Prod read)

- **21** = Sun–Thu dates in Oct 2026 from `labor_cost_defaults.workWeekdays=[0,1,2,3,4]`.
- **16** = same weekdays from 2026-10-01 through as-of **2026-10-23** (EMC `updated_at`).
- Notes on EMC `038917ac-…` literally: `(16 of 21 work days)`.
- Stale after November: still 25142.86; no recompute to full 33000 observed.

## Answers to mandatory questions

1. **Should owner salary accrue by workdays?**  
   **Code after `fd136c18`:** yes, same as monthly employees while month open (`shouldRecognizeFullEmployerMonth` false).  
   **Product correctness:** **AMBIGUOUS** — Owner must decide. Prior behavior was full-month for `company_only` owners.

2. **Does attendance exemption affect the amount?**  
   **No for the 16/21 denominator.** Accrual uses configured work weekdays + compensation coverage, not attendance clock-ins. Exemption only changes missing-day UI flags (`attendanceRequired` / exempt cells). Unpaid absence outcomes can reduce recognized pool via separate unpaid-absence logic in recompute — different path.

3. **Why did prior behavior change?**  
   **Proven:** commit `fd136c18` (“accrue the owner's open month like employees”). Removed owner `company_only` → always `recognizeFullMonth`.

4. **Should alert show base vs employer cost?**  
   **Code:** employer-cost pool (burdened).  
   **Hebrew label «שכר»:** suggests cash salary to employee — **semantic mismatch**. Product decision required.

5. **Cash-to-pay vs recognized cost?**  
   Alert uses payroll obligation `expectedAmount`, which is synced from labor **knownAmount** (recognized/accrued employer cost), not a separate net-pay engine. Paying the alert amount pays toward that obligation — not proven equal to “net salary to bank”.

6. **Is October a closed month as of 2026-11-14?**  
   By calendar: `yearMonth < currentYearMonth` → `shouldRecognizeFullEmployerMonth` = **true** → full ₪33,000 **when recompute runs**.  
   **Whether Production row was refreshed:** **UNVERIFIED** without DB read. Command center does **not** recompute on read.

7. **Updates after month end?**  
   Only when a recompute path runs (compensation save, bootstrap, attendance/time on paths that include the employee, etc.). Owner `company_only` is often skipped by project-scoped labor refresh → **stale risk HIGH**.

8. **Profitability / cashflow / project costs?**  
   Same `knownAmount` feeds allocation/recognition when recompute ran. Cash payroll path is separate (`canonical-payroll-cash`). No code proof of double-count; UX may still confuse cash vs cost.

9. **Other months / employees?**  
   Same engine for all monthly employees. Owner case is special only historically (pre-fd136c18) and via weaker refresh triggers.

10. **Verdict**

| Tag | Meaning |
|-----|---------|
| `ENGINE_MATCHES_CODE` | 25,142.86 is correct open-month accrual math |
| `PRODUCT_SEMANTICS_AMBIGUOUS` | Whether alert should show that figure as «שכר» |
| `LIKELY_STALE_ROW` | If still 25,142 after Nov 1 without recompute |

**Do not change calculation engine without Owner product decision.**
