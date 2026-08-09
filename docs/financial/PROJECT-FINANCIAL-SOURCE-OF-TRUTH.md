# Project Financial Source of Truth

**Status:** Wave 3 FINAL CLOSURE  
Legend: **CURRENT** | **FIXED** | **NEW MODEL** | **KNOWN LIMITATION**

## Canonical engine

`getProjectFinancials` is the project SOT.

| Metric | Definition |
|--------|------------|
| Current Contract Net | Events NET; pending excluded |
| Actual Cost | Expense NET + **recognized posted vendor bills** (dedupe linked expenses) + labor |
| Remaining Commitment | Open/partial committed_costs after bill/match consumption |
| Expected Remaining | Project ETC field |
| Forecast Final Cost | Actual + Remaining Commitment + ETC |
| Actual / Forecast Margin | CCV − Actual / CCV − Forecast |
| Open AP | Cash disclosure only |

Org: rollup of all eligible projects + **Unallocated Business Costs** (expense layer).  
Matrix: `COST-RECOGNITION-MATRIX.md`.

## FIXED Wave 3

- Vendor bill recognition closes Actual=0∧Commitment=0 gap
- Monthly/annual periodic allocation slices
- Org forecast KPIs + unallocated disclosure
- Category policy UX + תיקון הוצאה workflow

## Migrations

0014–0018 (see FINANCIAL-FLOW-AUDIT.md). Do not edit 0000–0013.

## KNOWN LIMITATION

Full Gate owner-held; equal monthly slices (not day-weighted).
