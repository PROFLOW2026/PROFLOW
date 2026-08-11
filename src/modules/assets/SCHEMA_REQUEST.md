# SCHEMA_REQUEST — Agent 9 Materials / Equipment Usage

Lead-owned migrations only. Do **not** edit 0024–0028 from feature agents.

## Requested (optional hardening — not blocking V1 ops UI)

Composite org-scoped FKs for usage tables in a future Lead migration:

1. `material_usage_records.material_id` → `material_items (id, organization_id)` ON DELETE SET NULL  
2. `material_usage_records.inventory_item_id` → `inventory_items (id, organization_id)` ON DELETE SET NULL  
3. `material_usage_records.employee_id` → `employees (id, organization_id)` ON DELETE SET NULL  
4. `equipment_usage_records.asset_id` → `assets (id, organization_id)` ON DELETE RESTRICT (or CASCADE with care)  
5. `equipment_usage_records.employee_id` → `employees (id, organization_id)` ON DELETE SET NULL  

Application layer already validates these refs by org. Tables from `0028_forms_usage_command_recurring.sql` are sufficient for overnight operational usage.

## Not requested

- Inventory costing columns / valuation modes  
- Auto Actual from usage  
- Warehouse locations / reservations  
