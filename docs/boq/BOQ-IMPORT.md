# BOQ Import

## Kind

Import kind `boq_items` (Agent A7 owns implementation + fixtures under `tests/fixtures/boq/**`).

## Rules

- Imports create / update **draft** BOQ nodes only through canonical manage-BOQ APIs
- Never invent Actual, Commitment, or Payment from an import file
- Never write pending change-order amounts into BOQ
- After activation, imports must not silently rewrite `original_*` columns — use change allocation for approved COs
- Opening quantities (`opening_approved_quantity`, `opening_billed_quantity`) may seed mid-project baselines; they do not create historical `billing_records`

## Suggested columns

| Column | Required | Notes |
|--------|----------|-------|
| item_code | recommended | Unique per BOQ when present |
| description | yes | |
| unit | no | Free text; domain suggests catalog |
| quantity | for items | Decimal string |
| unit_price | for items | Client **revenue** rate — never a subcontractor cost rate |
| chapter / parent | no | Hierarchy |
| work_package / cost_category / budget_line | no | Related mappings only |

## Export

Export mirrors active/current BOQ item codes and quantities for offline review. Export of unit prices is permission-gated (workers without manage/financials should not see rates).

## Portal

Import/export stay internal app surfaces. Portal remains OFF.
