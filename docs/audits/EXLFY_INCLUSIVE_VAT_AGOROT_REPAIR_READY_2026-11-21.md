# Inclusive VAT agorot — code ready + SQL prepared (not executed)

Date: 2026-11-21  
Status: **Code fixed locally. Production SQL prepared with `ROLLBACK` default. No push/deploy. No Production mutation.**

## Verification of 0014 / 0018 / 0019 (read-only)

| Ref | Gross | Stored NET (broken) | Paid NET | Match rounded NET? | Statutory docs | Lines |
|-----|------:|--------------------:|---------:|:------------------:|:--------------:|:-----:|
| 0014 | 108064.00 | 91579.661017 | 91579.66 | yes | none | none |
| 0018 | 42298.00 | 35845.762712 | 35845.76 | yes | none | none |
| 0019 | 101675.00 | 86165.254237 | 86165.25 | yes | none | none |

Same root cause on all three. No Sumit/statutory issued document blocking internal header correction. Open overdue notification only on **0019**.

## Code changes (local)

1. `src/modules/tax/domain/amounts.ts` — inclusive: `net = roundMoney(gross/(1+rate))`, `tax = gross − net`; exclusive: round tax to display scale.
2. Prior wave still in tree: `metric-drilldown.tsx` layout; `revenue-position` / payment-entry / cash-flow dust guards.
3. Regression tests: `tests/unit/tax/amounts.test.ts`, `tests/unit/billing/revenue-position.test.ts`, UI drilldown layout.

Paths covered via shared engine: billing `resolveTaxAmounts`, expenses tax, quotes totals, project entry baseline, billing-plan report, forms preview.

## Production SQL (prepared, not run)

File: `scripts/repair-inclusive-vat-agorot-0014-0018-0019.sql`

| Ref | subtotal → | tax → | total (unchanged) |
|-----|------------:|------:|------------------:|
| 0014 | 91579.660000 | 16484.340000 | 108064.000000 |
| 0018 | 35845.760000 | 6452.240000 | 42298.000000 |
| 0019 | 86165.250000 | 15509.750000 | 101675.000000 |

Also: update `tax_snapshot` strings; insert 3 audit events; resolve open `billing_overdue` notifications. **Payments/applications untouched.** Script ends in `ROLLBACK` until Owner swaps to `COMMIT`.

## Local tests

- tax/amounts, billing revenue-position + payment-entry, expenses vat/tax, UI kpi-drilldown — pass
- `tsc` / eslint on touched files — run as part of gate

## Still needs Owner approval

1. Execute the repair SQL (COMMIT) on Production  
2. Commit / push / deploy of code  
