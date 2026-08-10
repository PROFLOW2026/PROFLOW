# PRE-SQL Closure & Persistence Hardening — Lead Contract

**Status:** BINDING  
**Commit / push / Supabase migrate:** FORBIDDEN  
**0020:** editable (not applied persistently) — fix in place, no 0021  

## Immutable

- Migrations `0000`–`0019` — never edit
- Existing Actual / Commitment / ETC / Forecast / open-price / opening-reduction formulas

## File ownership (no overlap)

| Owner | Owns exclusively |
|-------|------------------|
| **Lead / Agent A** | `drizzle/migrations/0020_overnight_foundations.sql`, `drizzle/migrations/meta/_journal.json`, `drizzle/schema/**` (overnight tables only: ap payments bits, banking, planning, ocr, ops-finance, invoicing-integration, portal candidates) |
| **Agent B — AP** | `src/modules/ap/**` (payments domain/app/repo/tests), AP integration scenarios A/D/E/F/G/H |
| **Agent C — Banking** | `src/modules/banking/**` (Drizzle repo, wire app behind gate, tests B/L banking) |
| **Agent D — Planning + OCR** | `src/modules/planning/**`, `src/modules/ocr/**` (Drizzle repos, hierarchy/cycles, OCR target shape, tests C/I/J/K/L) |
| **Agent E — Ops + Invoicing + Portal** | `src/modules/ops-finance/**`, `src/modules/invoicing-integration/**`, `src/modules/portal/data/**` candidates persistence |

Agents B–E must **not** edit `0020` or `drizzle/schema/**`. If schema needs change → note in final report for Lead.

## Same-org philosophy (0018)

`(id, organization_id)` unique anchors + composite FKs.  
Polymorphic `target_id` / `ops_record_id` → APP GUARD + tests, not fake FK.

## Readiness flags

- Production paths use Drizzle when schema-ready flags are true
- Flags stay **false** until owner applies 0020 (except disposable PGlite tests may force-enable)
- In-memory = TEST DOUBLE ONLY after this pass (or REMOVED from production default)

## External honesty

Azure OCR live HTTP, statutory invoicing provider, live bank feed, public portal auth — remain disabled / not faked.
