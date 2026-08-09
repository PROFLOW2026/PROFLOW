# Financial Flow Audit — Wave 3 Final Closure

**Status:** Consolidated Lead (2026-08-09)  
Agents: Vendor recognition · Periodic proration · Org forecast · Category/correction UX

Legend: **CURRENT** | **FIXED** | **NEW MODEL** | **KNOWN LIMITATION**

---

## CRITICAL GAP FIXED

Posted vendor bill now recognizes **Actual Vendor Cost**. Matching/consuming PO commitment can no longer leave Actual=0 + Commitment=0 with known bill amount missing from Forecast.

See `COST-RECOGNITION-MATRIX.md` and `src/modules/ap/domain/vendor-cost-recognition.ts`.

---

## NEW MODEL summary

| Area | Model |
|------|--------|
| Vendor bill | Posted → Actual; payment → cash; linked expense deduped |
| Periodic overhead | Annual/custom → monthly slices; frozen runs |
| Org forecast | Full rollup of project KPIs + unallocated disclosure |
| Category policy | Family + method + period behavior; visible on capture |
| Correction | תיקון הוצאה = reverse + replacement |

---

## Migrations (do not edit 0000–0015)

| Tag | Purpose |
|-----|---------|
| `0014_allocation_engine` | Wave 2 allocation methods/runs |
| `0015_project_expected_remaining_cost` | ETC |
| `0016_category_allocation_policy` | Category period behavior |
| `0017_periodic_allocation` | Schedule mode + slice metadata |

---

## Formulas (final)

```text
PROJECT ACTUAL =
  finalized expense NET (direct + allocated slices)
  + recognized posted vendor bills (dedupe linked expenses)
  + labor (Mode C; Mode B excluded when Mode C present)
  − reversals/credits

PROJECT REMAINING COMMITMENT =
  open/partially_consumed committed_costs (post bill/match consumption)

PROJECT FORECAST FINAL =
  Actual + Remaining Commitment + ETC

ACTUAL MARGIN  = Current Contract Net − Actual
FORECAST MARGIN = Current Contract Net − Forecast Final
```

VAT excluded from profitability paths.

---

## FIXED (micro-closure)

Partial-month active-day exposure inside monthly slices (`contract_weight` / `equal_split` multiply by activeDays/sliceDays; labor/direct inherent). See `COST-ALLOCATION-MODEL.md`.

## FIXED (0018 integrity review)

| Gap | Fix |
|-----|-----|
| Cross-tenant run/expense/project linkage | Composite FKs |
| Duplicate draft\|applied per expense+slice | Partial unique index |
| Duplicate project lines per run | Unique (run_id, project_id) |
| Silent UPDATE/DELETE of applied snapshots | DB triggers |

## KNOWN LIMITATION (non-blocker)

| ID | Item |
|----|------|
| L1 | Nested correction chains are one hop at a time |

## BLOCKER / HIGH

None remaining after 0018 + partial-month micro-closure.
