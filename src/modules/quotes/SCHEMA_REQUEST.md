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

## SCHEMA_REQUEST — quote discount (Lead 0036+)

**Agent:** APPROVALS-QUOTE  
**Do not apply in 0000–0035.** Portal stays off. Do not merge with CRM or commercial change-order quotes.

Standalone estimates (`estimates` / `src/modules/quotes`) have **no customer-discount column**. Line `unit_price_amount` is the quoted selling price; `estimated_unit_cost_amount` is pre-win cost (margin, not discount). There is no list/catalogue total.

The `quote_discount` approval gate is wired on **issue to `sent`** (customer-facing lock). Until these columns exist, the gate only fires when an in-memory discount basis is present (tests / future writers). Quotes with no discount keep current behavior.

### Requested columns on `app.estimates`

| Column | Type | Null | Purpose |
|---|---|---|---|
| `discount_amount` | `numeric(18,6)` money | yes | Explicit customer discount. **This is the amount `quote_discount` rules should compare.** |
| `list_subtotal_amount` | `numeric(18,6)` money | yes | Catalogue/list commercial net. Implied discount = `list_subtotal_amount − subtotal_amount` when list is higher. |
| `discount_percent` | `numeric` percent | yes | Optional percent when no money discount is stored. Gate then uses quoted `total_amount` (money threshold). |

No line-level list price is required for V1 if header discount/list is stored.

### After 0036

- Map the columns in `quotes.repository` `mapQuote`
- Accept them on create/update schemas
- Do **not** treat estimated margin or cost as a discount
- Do **not** wire CRM sales quotes or `src/modules/commercial` change-order quotes to `quote_discount`
