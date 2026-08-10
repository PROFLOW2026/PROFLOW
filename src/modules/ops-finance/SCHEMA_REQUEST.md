# SCHEMA_REQUEST — Ops → Finance expense links (Agent 7)

Lead designs additive `0020+`. `0020` defines `ops_expense_links`.

**App wiring (Agent E):** Drizzle repo + `OPS_FINANCE_PERSISTENCE_READY` (default **false**).
In-memory store is **TEST DOUBLE ONLY**. Flip readiness only after owner applies `0020`.

## TABLE `ops_expense_links`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | FK → organizations; RLS org scope |
| `ops_record_kind` | text NOT NULL | CHECK IN (`maintenance_record`, `compliance_artifact`, `fleet_vehicle`, `recurring_business_cost`) |
| `ops_record_id` | uuid NOT NULL | Polymorphic; same-org integrity enforced in app (+ optional CHECK per kind) |
| `expense_id` | uuid NOT NULL | FK → expenses ON DELETE RESTRICT |
| `link_purpose` | text NOT NULL DEFAULT `'expense_draft'` | CHECK IN (`expense_draft`, `overhead_allocation`) |
| `created_by_user_id` | uuid NULL | FK → profiles |
| `created_at` | timestamptz NOT NULL | |
| `archived_at` | timestamptz NULL | Soft-deactivate duplicate prevention |

### Why

Operational records (maintenance cost metadata, insurance/compliance, fleet holding, recurring business costs) must **not** silently post Actual. An explicit user action creates an Expense **draft** linked to the ops record. Finalize uses the existing expense finalize path. Inventory movements are **never** linkable here.

### Indexes / uniqueness

- UNIQUE (`organization_id`, `ops_record_kind`, `ops_record_id`) WHERE `archived_at IS NULL` — one active link per ops record
- UNIQUE (`organization_id`, `expense_id`) WHERE `archived_at IS NULL` — one ops source per expense
- INDEX (`organization_id`, `expense_id`)
- INDEX (`organization_id`, `ops_record_kind`, `ops_record_id`)

### FK + same-org integrity

- `expense_id` → `expenses.id`; app asserts `expenses.organization_id = ops_expense_links.organization_id`
- Kind-specific existence checks (same org, not archived):
  - `maintenance_record` → `maintenance_records`
  - `compliance_artifact` → `compliance_artifacts`
  - `fleet_vehicle` → `fleet_vehicles`
  - `recurring_business_cost` → may land as compliance artifact or a future costs table; until then app-only kind with UUID placeholder is unacceptable — prefer `compliance_artifact` for insurance premiums

### RLS

- SELECT/INSERT/UPDATE for org members with expenses read/create (mirror expenses RLS pattern)
- No DELETE; archive only

### Explicit non-goals (do not add)

- No trigger that creates expenses from maintenance/inventory inserts
- No `inventory_movement` kind — inventory quantity ≠ financial expense
- If future material-to-project costing posts costs, those rows must participate in vendor-bill / expense **dedupe** (same pattern as `ap_bill` ↔ expense links) so Actual is not double-counted
