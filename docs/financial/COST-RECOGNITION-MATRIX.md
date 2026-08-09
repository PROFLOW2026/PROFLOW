# Cost Recognition Matrix (Wave 3)

**Status:** FINAL CLOSURE — source of truth for managerial costing  
Legend: Y = yes · N = no · — = not applicable

| EVENT | STATUS | ACTUAL COST? | COMMITMENT? | FORECAST? | AP? | CASH? | PROJECT PROFIT? | ORG PROFIT / COST? |
|-------|--------|--------------|-------------|-----------|-----|-------|-----------------|---------------------|
| Draft expense | draft | N | N | N | N | N | N | N (list only) |
| Final direct expense | finalized | Y (NET) | N | via Actual | N | N | Y | Y (project-touching) |
| Final allocated overhead/shared | finalized + lines/slices | Y (NET share) | N | via Actual | N | N | Y | Y |
| Unallocated org overhead | finalized, no project lines | N on projects | N | N on projects | N | N | N | Y as **Unallocated Business Costs** |
| Void / reversal expense | void / negative finalized | removes / offsets | N | via Actual | N | N | Y (net) | Y (net) |
| PO issued | issued | N | Y (open) | via Commitment | N | N | via Forecast | via Forecast |
| PO partially billed (progress) | bill open/partial | Y (bill NET) | Y (remainder) | Actual+Commit | Y unmatched | N | Y | Y |
| Vendor bill posted (open/partial/matched) | recognized | Y (bill total) | reduced/consumed | via Actual (+ remain commit) | Y if unmatched | N | Y | Y |
| Vendor bill draft | draft | N | N | N | N | N | N | N |
| Vendor bill void | void | N | restored only if business path reopens PO | N from bill | N | N | N | N |
| Expense linked to recognized bill | finalized + accepted match | N (deduped; bill wins) | — | via bill Actual | — | N | Y once | Y once |
| Expense NOT linked to bill | finalized | Y | — | via Actual | — | N | Y | Y |
| Vendor payment | recorded | N | N | N | reduces AP | Y outflow | N | cash only |
| Customer billing finalized | finalized | N | N | N | N (AR) | N | via margin inputs separately | invoiced |
| Customer payment | recorded | N | N | N | N | Y inflow | N | cash |
| Approved change order | approved | N | N | N | N | N | via Current Contract | via Contract |
| Pending change | draft/awaiting | N | N | N (pending KPI only) | N | N | N | N |
| Labor time cost (Mode C) | project time + cost | Y | N | via Actual | N | N | Y | Y |
| Payroll/labor category expense (Mode B) | finalized | Y only if no Mode C on project | N | via Actual | N | N | conditional | conditional |
| Expected Remaining (ETC) | project field | N | N | Y (added) | N | N | Forecast margin | Forecast margin |

## Critical procurement invariant

```text
Known approved vendor cost MUST appear in Actual OR Remaining Commitment (or both as partials).
Never: Actual=0 AND Commitment=0 while a posted bill exists for the project.
```

## Forecast Final Cost

```text
= Actual Cost (expenses NET + recognized vendor bills − linked expense dedupe + labor)
+ Remaining Commitment
+ Expected Remaining Cost
```

Open AP and vendor payments are **cash**, not Forecast Cost.

## Organization reconciliation (expense layer)

```text
PROJECT-TOUCHING EXPENSE NETS
+ UNALLOCATED ORGANIZATION COSTS
= ORGANIZATION FINALIZED EXPENSE TOTAL
```

Org Forecast KPIs roll up from `getProjectFinancials` across all eligible projects (+ disclose unallocated separately).
