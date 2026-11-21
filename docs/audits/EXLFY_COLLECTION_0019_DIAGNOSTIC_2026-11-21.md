# Diagnostic — collection 0019 (חורגין 36) — READ ONLY

Date: 2026-11-21  
DB: PROFLOW `rnjeggpsjchayprygkcw` (eu-west-1)  
Org: `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`  
**No writes executed.**

## Proven amounts

| Leg | Stored value |
|-----|-------------:|
| Billing id | `7181fb32-cd52-4c96-aaf5-35c91eb35932` |
| Reference | `0019` |
| `vat_mode` | **inclusive** |
| Gross / total | **101,675.00** |
| NET / subtotal | **86,165.254237** (not agorot-rounded) |
| VAT / tax | **15,509.745763** |
| Retention | 0 |
| Due date | 2026-11-15 |
| Payment | `86165.250000` NET, basis=`net`, status=`recorded` |
| Application | `86165.250000` NET |

Audit (append-only):
1. `billing_record.created` + `finalized` — 2026-11-20 14:24:34Z — amount 101675
2. `payment.recorded` — 2026-11-20 14:24:55Z — amount 86165.25

No retroactive edit of the invoice after payment.

## Open arithmetic (proof)

```
billed.net  = 86165.254237
paid.net    = 86165.250000
open.net    = 0.004237   → display round 0.00

paid.vat    = 86165.25 × (15509.745763/86165.254237) = 15509.745000
open.vat    = 0.000763   → display round 0.00

open.gross  = 101675 − 101674.995 = 0.005000
            → ROUND_HALF_UP to 2dp = 0.01  ← material / alert / “כולל מע״מ”
```

Inclusive reverse without agorot rounding:
`101675 / 1.18 = 86165.254237…` stored as-is in `subtotal_amount` + `tax_snapshot`.

Payment recorded the **correct agorot NET** (`86165.25` = round half-up of that quotient). The shortfall is **not** underpayment by the customer.

## Org scan — same pattern

| Ref | Project | Stored NET | Paid NET | open.net | open.gross→2dp |
|-----|---------|------------:|---------:|---------:|---------------:|
| 0019 | חורגין 36 | 86165.254237 | 86165.25 | 0.004237 | **0.01** (alert) |
| 0018 | ברנדייס 6 | 35845.762712 | 35845.76 | 0.002712 | 0.00 |
| 0014 | חורגין 36 | 91579.661017 | 91579.66 | 0.001017 | 0.00 |

Dashboard / צפי נכנס **0.01**:
`0.004237 + 0.002712 + 0.001017 = 0.007966` → display **0.01**.

## Root cause class

**Inclusive VAT capture stores NET/VAT at 6dp without rounding to currency agorot**, while payments / UI use 2dp. Not float; not a missing agora payment; not allocation mismatch; not retention; not post-payment edit.

## Correct data repair (proposal only — NOT executed)

For each affected inclusive invoice, **normalize header to agorot** so `net + tax = gross` and paid NET matches. Example for 0019:

- `subtotal_amount` → `86165.250000`
- `tax_amount` → `15509.750000`
- `total_amount` unchanged `101675.000000`
- update `tax_snapshot` subtotal/tax strings to match

**Do not** insert a ₪0.01 payment. After header fix, open = 0; then settle/resolve the overdue notification.

Same pattern for 0018 / 0014 if Owner wants a clean org AR (optional but recommended — they feed the dashboard 0.01 sum).

## Code prevention still required

`computeTaxAmountBreakdown` inclusive path (`netFromInclusiveGross`) must round NET to display scale and set `tax = gross − net` (remainder). Prior session guards (dust / cash-flow ROUND) are **insufficient** alone for the exact `open.gross = 0.005` case (rounds up to material ₪0.01).
