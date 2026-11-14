# Eran Yosef · 2026-10 stale accrual repair (Owner review)

**Status:** PREPARED — **DO NOT apply to Production** until Owner explicitly approves after reviewing this file and the dry-run script.

**Gap:** EMC / payroll expected `25142.86` (16/21) vs full-month employer cost `33000` → **₪7,857.14**.

**Employee:** `1651af31-5f63-425d-a518-a9fa84931ecd` (ערן יוסף)  
**Month:** `2026-10`  
**EMC id (current applied):** `038917ac-8a25-4949-9e52-c5e15beaeac4`  
**Payroll id (upcoming):** `c35d5f56-7b11-4ea2-835e-f40025715621`

---

## Safe path (required)

1. **Never** `UPDATE` amounts on the applied EMC row (hits `employee_month_costs_immutability_guard` / BUG-002).
2. Use **`recomputeMonthlyEmployeeCostForOpenMonth`** for this employee+month only:
   - supersedes applied run / month as needed
   - writes estimated full-month recognition (`33000`) when `yearMonth < current`
   - syncs unpaid payroll `expected_amount` via `syncPayrollExpectedFromLaborRecompute`
3. **Preserve** Jan–Sep `known_quality=actual` rows (`shouldPreserveRecordedActualEmployerCost`) — do not recompute those months in this repair.
4. Cash paid stays **0** (`payment_status=upcoming`).

---

## Script

| Path | Role |
|------|------|
| `scripts/dry-run-eran-oct-2026-accrual-repair.ts` | Dry-run by default; prints before/after plan. Set `EXECUTE=1` **only** after Owner approval on a non-Production DB first. |

Default mode: **read + plan only** (no writes).

```powershell
npx tsx scripts/dry-run-eran-oct-2026-accrual-repair.ts
```

After Owner approval on an isolated DB (never infer from “קדימה” alone):

```powershell
$env:OWNER_APPROVED='1'; $env:EXECUTE='1'; npx tsx scripts/dry-run-eran-oct-2026-accrual-repair.ts
```

---

## SQL / MIGRATION PREPARED

```
SQL / MIGRATION PREPARED = NO (application recompute path; no new migration)
FILE = scripts/dry-run-eran-oct-2026-accrual-repair.ts
PURPOSE = Promote Eran 2026-10 stale 16/21 accrual → full 33000 via supersede recompute
DATA MUTATION = YES (only when OWNER_APPROVED=1 AND EXECUTE=1)
SCHEMA MUTATION = NO
RISK = MEDIUM (touches EMC + labor run + unpaid payroll expected + general cost month side path)
READY FOR OWNER REVIEW = YES
```

**BLOCKED:** Production apply until Owner explicitly says to run/apply this repair against Production.
