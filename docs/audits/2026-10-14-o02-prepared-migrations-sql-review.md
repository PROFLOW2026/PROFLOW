# O02 — Prepared migrations 0184–0192 (Lead SQL review)

**Date:** 2026-10-14  
**Status:** PREPARED ONLY — not in journal, not applied  
**Gate:** Owner Gate B required before `MIGRATION_APPROVED_TAGS` / `--owner-approved`

## Inventory

| Tag | File | Purpose |
|-----|------|---------|
| 0184 | `drizzle/migrations/0184_crm_permission_rls.sql` (pending journal) | CRM tenant RLS (read/manage predicates) |
| 0185 | `drizzle/migrations/0185_rls_0009_0011_sibling_tables.sql` | Custom-field sibling RLS + helper GRANT |
| 0186 | `drizzle/migrations/0186_contract_value_events_rls_and_0174_grants.sql` | Contract value events RLS + 0174 grant repair |
| 0187 | `drizzle/migrations/0187_statutory_document_share_links.sql` | B04 share links table; service_role SELECT+UPDATE only |
| 0188 | `drizzle/migrations/0188_task_collaboration.sql` | Task collaboration tables + RLS |
| 0189 | `drizzle/migrations/0189_expenses_closed_period_guard_payment_columns.sql` | Closed-period guard on payment columns |
| 0190 | `drizzle/migrations/0190_connected_contract_value_projections.sql` | Connected contract projections |
| 0191 | `drizzle/migrations/0191_project_cover_image.sql` | Project cover image column |
| 0192 | `drizzle/migrations/0192_inventory_rls.sql` | S01 inventory UWM RLS — see `2026-10-s01-inventory-rls-map.md` |

All pending SQL lives in `drizzle/migrations/` only (no separate prepared folder). **0180** exists once in journal + on disk.

## Findings (Gate B)

### MEDIUM — `service_role` policies (addressed in Gate A SQL review pass)

- **0188** — narrowed: no service access on `task_comment_mentions`; `notification_preferences` SELECT only; `notification_deliveries` SELECT/INSERT/UPDATE; `calendar_feed_tokens` SELECT/UPDATE (no service INSERT/DELETE).
- **0190** — SELECT/INSERT/UPDATE for sync worker; no service DELETE.

**0187** remains the reference pattern (SELECT + UPDATE on share links).

### LOW — ordering / overlap

- **0186** references 0174 grants — verify no conflict with live journal order before apply.
- **0189** touches expense payment columns — coordinate with F04 ledger work and 0180/0182 already applied. Gate A fix: trigger uses `cost_category_id` / `tax_amount` (not legacy `category_id` / `vat_amount`).

### S01 / 0192

- Predicates documented in [2026-10-s01-inventory-rls-map.md](./2026-10-s01-inventory-rls-map.md) (`assets.read` / `assets.manage` + `uwm_can_access_project_context` on movements).
- **Gate A (PGlite, prepared-only apply):** `tests/integration/audit-verification/rls-0192-inventory-adversarial.test.ts` — worker deny/allow, cross-tenant, project-scoped movements, write tier, FORCE RLS on both tables.
- **Gate B:** confirm movement INSERT + trigger-driven `inventory_items` qty update under authenticated `assets.manage` (no service_role); optional `inventory_reservations` predicate alignment (map § Gate B follow-ups).

### S02 / 0186

- Replaces 0174 `has_org_permission` / `can_access_project` on audit/contracts/value-events SELECT with **UWM** helpers (employee grants + project context).
- **Gate A:** `tests/integration/audit-verification/rls-0186-s02-uwm-parity.test.ts` — employee `audit.read` / `contracts.read` grants vs `has_org_permission` false.
- **Gate B:** apply after confirming no duplicate policy names vs live 0174; smoke contract_value_events on Production read-only (EB-1).

### S03 / 0173 (journal — not prepared)

- Five-table FORCE RLS shipped in journal `0173_force_rls_five_tables.sql`; **no additive prepared file required** if EB-1 confirms applied.
- **Gate A:** `tests/integration/database/migrations.test.ts` (global org_id FORCE sweep) + `tests/integration/audit-verification/rls-s03-0173-force-five-tables.test.ts` (named 0173 tables + service policy on `attendance_correction_requests`).

### S07 closure

- **Gate A:** `tests/integration/audit-verification/sec-s07-cross-org-permission-proof.test.ts` — full adversarial prepared stack (`GATE_A_SEC_PREPARED_ADVERSARIAL`: 0184–0186 + 0192) with cross-org and same-org permission tiers.

## Approval gate (code)

- `drizzle/scripts/migration-approval-gate.ts` — exact tag match for pending journal entries.
- Production migrate requires `--owner-approved`.
- **No journal edits** without separate Owner approval.

## Tests

- `tests/unit/database/migrate-approval-gate.test.ts`
- `tests/unit/database/prepared-dir-consistency.test.ts`
- `tests/setup/pending-journal-migrations.ts` — `GATE_A_SEC_PREPARED_*` tag bundles for PGlite apply (no journal / no production)
- Gate A SEC EXEC: `rls-0192-inventory-adversarial`, `rls-0186-s02-uwm-parity`, `rls-s03-0173-force-five-tables`, `sec-s07-cross-org-permission-proof` (plus existing `rls-0009-0011-siblings`, `rls-permission-gaps`, CRM tenant isolation — S04)
