# EXLFY — display rows + collection 0019 (0.01 ₪)

Date: 2026-11-21  
Status: Display fixed in code. Billing systemic guards added. **Production data for 0019 not mutated** — awaiting Owner approval for read-only proof SQL, then a separate approval for any data repair.

## 1. Display — root cause and fix

**Cause:** `MetricDrilldown` (`src/modules/financials/ui/metric-drilldown.tsx`) placed long `surfaceBasis` strings inside the amount column (`flex shrink-0 flex-col items-end`). In RTL the label column (`flex-1 min-w-0`) was squeezed to ~1 character width. Only rows with long basis copy broke (חיוב לפני מע״מ / יתרה לגבייה כולל מע״מ).

**Fix:** Amount column holds only `MoneyText`. `surfaceBasis` is a full-width `break-words` row under the label/amount row (same idea as `ReportMetricShell`).

**Reuse:** Production use of `MetricDrilldown` is only `ProjectFinancialsKpiPanel` (main / jobs / employee financials surfaces share that panel).

## 2. Collection 0019 — what code proves (without Production rows yet)

AR is **derived**, not stored: `billing_records` NET/VAT/GROSS − recorded `payment_applications` (NET) − retention (`computeRecordRevenuePosition` / `computeOpenTriplet`).

Displayed **₪0.01** is **material** (`isMaterialPositiveMoney`): status stays overdue/partial, alerts stay open, cash-flow `isZeroMoney` keeps the row. Sub-agora dust (e.g. 0.004) is already treated as non-collectible for status/alerts.

If UI shows **0.01** on both NET and GROSS for 0019, the ledger almost certainly has **`paid.net = billed.net − 0.01`** (not float math in the core path — Decimal.js @ 6dp). Code alone cannot invent the Owner’s “fully paid” fact; Production amounts must prove payment shortfall vs header edit vs retention.

**Read-only proof script (prepared, not executed):** `scripts/diagnose-collection-0019.sql`

## 3. Systemic vs point fix

| Layer | Change | Hides ₪0.01? |
|-------|--------|--------------|
| `computeOpenTriplet` | Clear when NET covered; clear when GROSS covered **and** open NET is non-material; clear when all open legs are display-zero dust | **No** — ₪0.01 stays open |
| `netStringForPaymentEntry` | Closing snap only when remainder after gross→net is non-material dust | **No** — intentional ₪0.01 shortfall stays |
| Cash-flow SQL open_net | `ROUND(..., 2) = 0` → treat as 0 for forecast | **No** — ₪0.01 remains |

0019’s live ₪0.01 (if confirmed as material open NET) needs a **data** correction after proof — not a display threshold.

## 4. Regression tests added/extended

- `tests/ui/project-financials-kpi-drilldown.test.tsx` — long `surfaceBasis` layout
- `tests/unit/billing/revenue-position.test.ts` — keep ₪0.01 open; clear dust; gross cover
- `tests/unit/billing/payment-entry.test.ts` — do not auto-close intentional ₪0.01

## 5. Local verification

- `vitest`: revenue-position, payment-entry, project-financials-kpi-drilldown — pass
- `tsc --noEmit -p .` — pass after locale fix (`he-IL`)
- eslint on touched files — clean

## 6. Git / deploy

No commit, push, or Production deploy in this wave. No Production SQL executed.

## 7. Owner approvals still required

1. **Read-only SELECT** via `scripts/diagnose-collection-0019.sql` (or equivalent) on the Owner org.
2. After results: **exact data repair** proposal (preferred: additive ₪0.01 recorded payment/application with audit note — no deletion of payment history), then separate approval to apply.
3. After repair: re-scan overdue notifications / settle alerts for that billing record; confirm dashboard AR + צפי נכנס = 0.00.
