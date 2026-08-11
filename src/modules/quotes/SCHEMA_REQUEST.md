# SCHEMA_REQUEST — Quotes / Estimates (Agent 5)

## RESOLVED by Lead (2026-08-11)

Collision with change-order `quotes` fixed:

| Was (broken) | Now |
|--------------|-----|
| `quotes` | `estimates` |
| `quote_line_items` | `estimate_line_items` |

- Drizzle: `drizzle/schema/next-gen.ts` exports `estimates` / `estimateLineItems`
- Migration: `0025_quotes_estimates.sql` rewritten
- Product permissions/module remain `quotes.*` / `quotes`
- Repository updated to map `estimateId` → domain `quoteId`

## Remaining non-blockers

- `tax_rule_id` FK optional
- `work_order` convert target still deferred to service path
- Draft in-place edit UI still optional
