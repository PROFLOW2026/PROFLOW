# Material / equipment usage — integration notes

## Non-Actual invariant (hard)

| Event | Financial effect |
|-------|------------------|
| Expense / AP purchase of materials or assets | Actual (existing recognition paths only) |
| Inventory receive / issue / adjust / return | Quantity on hand only — **not** Actual |
| `material_usage_records` | Operational attribution — **not** Actual |
| `equipment_usage_records` | Operational attribution — **not** Actual |

Usage must **never** post Expense, GL, Committed PO cost, or Forecast. Purchase Actual that already exists stays once — do not double-count by valuing consumption.

## Costing mode

Do **not** invent FIFO / average / standard inventory costing for usage. Catalog unit prices on materials are planning/vendor reference only.

## Stock vs usage

- Low stock = reorder_level indicator on inventory items (operational alert).
- Recording usage does **not** auto-issue inventory. Update stock with inventory movements when needed.
- Full warehouse/ERP (locations, reservations, transfers) is out of scope.

## Permissions

- Materials catalog + material usage: `materials.read` / `materials.manage`
- Assets, fleet, inventory stock, equipment usage: `assets.read` / `assets.manage`
