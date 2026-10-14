# S01 / OD-51 — `inventory_items` & `inventory_movements` access map (Gate A)

**Date:** 2026-10-14  
**Scope:** Application and DB readers/writers for RLS migration **0192** (prepared only; no journal, no apply).  
**Baseline RLS:** `0011_field_ops_assets.sql` — org membership only on both tables; `0051_review_integrity_closure.sql` — AND `project_id IS NULL OR app.can_access_project(...)` onto **`inventory_movements`** authenticated policies only. **`inventory_items`** never received project or permission predicates. **0185** intentionally excludes `inventory_*` (deferred to 0192).

---

## Schema summary

| Table | Org key | Project scope | Immutability / derived writes |
|-------|---------|---------------|-------------------------------|
| `inventory_items` | `organization_id` | None (org-wide SKU catalog) | `quantity_on_hand` updated by **`inventory_movement_apply_balances`** trigger after movement INSERT; `cost_basis_*` updated via **`app.next_gen_latch_acquire('inventory_cost_basis')`** + `setInventoryItemCostBasis` (service-role local) |
| `inventory_movements` | `organization_id` | Optional `project_id` (issues / project consume) | INSERT-only at app layer; UPDATE/DELETE blocked by **`inventory_movements_immutable_guard`** |

Drizzle: `drizzle/schema/field-ops.ts` (`inventoryItems`, `inventoryMovements`).

Related (not in 0192): `inventory_locations`, `inventory_location_balances`, `inventory_reservations`, `inventory_counts`, `inventory_cost_layers`, `inventory_cost_consumptions` — FK or trigger coupling to the two core tables.

---

## Application readers (`inventory_items`)

| Layer | File | Operation | App permission (when enforced) |
|-------|------|-----------|--------------------------------|
| Repository | `src/modules/assets/data/assets.repository.ts` | `listInventoryItems`, `findInventoryItemById` | Caller |
| Repository | `src/modules/assets/data/inventory-advanced.repository.ts` | `lockInventoryItemRow`, existence checks | Caller |
| Repository | `src/modules/assets/data/inventory-cost.repository.ts` | `getInventoryItemCostBasis`, `lockInventoryItemForCost` | Caller |
| Application | `src/modules/assets/application/inventory.ts` | List/get/low-stock, movement prep | `assets.read` / `assets.manage` |
| Application | `src/modules/assets/application/inventory-cost.ts` | Layer book/unbook, consume | `assets.manage` |
| Application | `src/modules/assets/application/inventory-counts.ts` | Count finalize (lock item) | `assets.read` / `assets.manage` |
| Application | `src/modules/assets/application/usage.ts` | Material usage tied to item | `materials.read` \|\| `assets.read` |
| Application | `src/modules/expenses/application/create-expense.ts` | Stock-purchase field validation | `assets.manage` + `getInventoryItemById` |
| Notifications | `src/modules/notifications/data/scan-sources.repository.ts` | Low-stock scan | Scanner gate: `assets.read` |
| Reports | `src/modules/reports/application/generate-extended-reports.ts` | Inventory movement report KPIs | `assets.read` (via `listInventoryItemsForOrg`) |
| Documents | `src/modules/documents/data/verify-document-owner.ts` | Owner verify `inventory_item` | Document upload path |
| UI loaders | `src/app/[locale]/(app)/assets/inventory/*` | Pages / panels | Session + module gates |
| UI loaders | `src/app/[locale]/(app)/expenses/new/page.tsx` | Stock purchase picker | `assets.manage` before list |
| UI loaders | `src/app/[locale]/(app)/procurement/ap/new/page.tsx` | AP stock lines picker | `assets.read` (`canReadAssets`) |
| UI loaders | `src/modules/expenses/ui/expenses-org-detail-page.tsx` | Edit expense picker | `assets.manage` |
| UI loaders | `src/modules/assets/ui/project-usage-panel.tsx` | Project usage forms | `assets.read` / `assets.manage` |
| Imports | `src/modules/imports/application/confirm-import.ts` | Row create | `assets.manage` (`createInventoryItem`) |

**No direct API routes** under `src/app/api` reference these tables (server actions + RSC loaders only).

---

## Application writers (`inventory_items`)

| Layer | File | Operation | Notes |
|-------|------|-----------|--------|
| Repository | `src/modules/assets/data/assets.repository.ts` | `insertInventoryItem` | Create catalog row; opening qty via movement, not direct qty set |
| Repository | `src/modules/assets/data/assets.repository.ts` | `updateInventoryQuantity` | **Dead code** — no callers; qty path is movement trigger |
| Repository | `src/modules/assets/data/inventory-cost.repository.ts` | `setInventoryItemCostBasis` | `SET LOCAL ROLE service_role` + cost-basis latch (0069 guard) |
| Application | `src/modules/assets/application/inventory.ts` | `createInventoryItem` | INSERT item + optional receive movement |
| Application | `src/modules/assets/application/inventory-cost.ts` | Book/unbook AP/expense layers | Updates cost basis via repository (service role) |
| DB trigger | `0044` / `app.inventory_movement_apply_balances` | UPDATE `quantity_on_hand` | Runs on **`inventory_movements` INSERT** in same txn as caller |

**Not written by:** expense/AP finalize directly on `inventory_items` for qty — stock purchase flows book **`inventory_cost_layers`** and cost basis; physical receive for expense stock purchase is a separate product path (layers without mandatory movement in `bookInventoryPurchaseFromExpenseOnExecutor` — qty receive is operational via `/assets/inventory` or opening/import).

---

## Application readers (`inventory_movements`)

| Layer | File | Operation | App permission |
|-------|------|-----------|----------------|
| Repository | `src/modules/assets/data/assets.repository.ts` | `listInventoryMovementsForItem`, `listRecentInventoryMovementsForOrg` | Caller (`assets.read` in app) |
| Repository | `src/modules/assets/data/inventory-advanced.repository.ts` | Idempotency lookup for count adjust | Caller |
| Application | `src/modules/assets/application/inventory.ts` | `listMovementsForInventoryItem`, org recent list | `assets.read` |
| Reports | `src/modules/reports/application/generate-extended-reports.ts` | Recent movements section | `assets.read` |

---

## Application writers (`inventory_movements`)

| Layer | File | Operation | `project_id` set when |
|-------|------|-----------|------------------------|
| Repository | `src/modules/assets/data/assets.repository.ts` | `insertInventoryMovement` | Caller supplies |
| Application | `src/modules/assets/application/inventory.ts` | `createInventoryItem` (opening receive), `recordInventoryMovement`, backfill | Usually NULL; issue/return may set project/work order |
| Application | `src/modules/assets/application/inventory-counts.ts` | Finalize count → adjust movement | NULL |
| Server actions | `src/app/[locale]/(app)/assets/actions.ts` | `createInventoryItemAction`, `recordInventoryMovementAction` | Form input |
| Imports | `src/modules/imports/application/confirm-import.ts` | Via `createInventoryItem` | NULL |

**INSERT only** from app; UPDATE/DELETE rejected by DB guard.

---

## Cross-module effects (RLS must not break)

| Domain | Interaction |
|--------|-------------|
| **Expenses** | `inventoryStockPurchase` on finalize → `bookInventoryPurchaseFromExpenseOnExecutor` reads item, writes **`inventory_cost_layers`** + cost basis (service role). Requires **`assets.manage`** at app layer. |
| **AP** | Recognized bill with stock lines → `bookInventoryPurchaseFromApBillOnExecutor` (same pattern). |
| **Project actual** | Issue movement + `consumeInventoryCostToProjectOnExecutor` → `inventory_cost_consumptions` (references optional `movement_id`); not a movement writer. |
| **Procurement** | PO receive (`receive-purchase-order.ts`) **does not** insert movements (explicit non-scope). |
| **Financial loaders** | `inventory-consumptions.repository.ts` reads consumptions/layers, not base movement table. |
| **Notifications** | Low-stock reads **`inventory_items`** only. |

---

## Current vs proposed RLS (0192)

### Current (production migrations)

- **`inventory_items`:** `app.is_org_member(organization_id)` on all authenticated CRUD (0011).
- **`inventory_movements`:** membership **and** `(project_id IS NULL OR app.can_access_project(organization_id, project_id))` on all authenticated policies (0051 `apply_project_column_rls`, NULL permission args).

### Proposed (0192 — aligns with 0185 asset sibling pattern + UWM project context)

**`inventory_items`** — org-wide assets catalog (no `project_id`):

- **SELECT:** `is_org_member` AND (`uwm_has_permission(..., 'assets.read')` OR `assets.manage`)
- **INSERT/UPDATE/DELETE:** `is_org_member` AND `uwm_has_permission(..., 'assets.manage')`

**`inventory_movements`** — operational ledger with optional project attribution:

- **SELECT:** same read permission as items **AND** `(project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))`
- **INSERT:** `assets.manage` **AND** same project predicate on `WITH CHECK`
- **UPDATE/DELETE:** same write predicate (policies kept for parity; DB trigger still forbids mutation)

**Unchanged:** `{table}_service_all` for `service_role` (0011). Cost-basis and layer tables continue to use **`asServiceRoleWrite`** where 0069 revoked authenticated DML.

**Alignment note:** 0192 replaces 0051’s `can_access_project` AND-chaining on movement policies with explicit DROP/CREATE using **`uwm_can_access_project_context`** (see `0124_employee_operational_rls_alignment.sql` direction).

---

## Test / audit references

- `tests/integration/migration/0051-rls-parity-matrix.json` — movement project predicate expectations  
- `tests/integration/migration/hardening-0036-0045-adversarial.test.ts` — movement FK/trigger behavior  
- `tests/integration/assets/inventory-*.test.ts` — functional inventory flows  
- `tests/unit/database/true-cost-0069-sql-guards.test.ts` — cost basis trusted write on `inventory_items`
- **Gate A (0192 prepared on PGlite):** `tests/integration/audit-verification/rls-0192-inventory-adversarial.test.ts` via `GATE_A_SEC_PREPARED_INVENTORY` in `tests/setup/prepared-migrations.ts`
- **S07 stack:** `tests/integration/audit-verification/sec-s07-cross-org-permission-proof.test.ts` (`GATE_A_SEC_PREPARED_ADVERSARIAL`)

---

## Gate B follow-ups (out of 0192 DDL)

- ~~Tenant isolation / adversarial tests mirroring 0185 hardening for `inventory_*`~~ — **Gate A covered** by `rls-0192-inventory-adversarial.test.ts` (apply SQL still Gate B)  
- Confirm movement INSERT + trigger UPDATE on `inventory_items` under **`assets.manage`** authenticated role (no service role for qty)  
- Optional: promote `inventory_reservations` permission predicates to same `assets.*` + project pattern (0051 project-only today)
