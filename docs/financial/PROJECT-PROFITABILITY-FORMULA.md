# Project Profitability Formula

**Status:** Wave 3 FINAL  
Legend: **CURRENT** | **FIXED** | **NEW MODEL** | **KNOWN LIMITATION**

```text
PROJECT REVENUE BASIS
  = Current Contract Net (original + approved changes; pending excluded)

PROJECT TOTAL ACTUAL COST  (NEW MODEL — Wave 3)
  = Finalized direct + allocated NET expenses
  + Recognized posted vendor bill NET (expense linked to same bill excluded)
  + Labor actual (Mode C; Mode B labor category excluded when Mode C present)
  − Valid reversals/credits
  (no VAT)

PROJECT REMAINING COMMITMENT
  = Open / partially_consumed PO remaining (consumed on posted PO-linked bill / settlement)

PROJECT EXPECTED REMAINING (ETC)
  = Uncovenanted remaining cost on the project

FORECAST FINAL COST
  = Actual + Remaining Commitment + ETC
  (AP payable and vendor payments are cash-only)

ACTUAL MARGIN   = Revenue Basis − Actual
FORECAST MARGIN = Revenue Basis − Forecast Final Cost
```

**FIXED Wave 3:** Posted vendor bill cannot vanish when commitment is consumed.

See `COST-RECOGNITION-MATRIX.md`.
