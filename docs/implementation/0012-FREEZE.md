# 0012 FREEZE READY — AP / vendor portal

**Status:** FREEZE READY  
**Migration:** `drizzle/migrations/0012_ap_vendor_portal.sql` (local, not remotely applied)  
**Verified:** 2026-08-09 · Wave 3 product depth closeout  
**Do not:** renumber · push · request remote apply

## Freeze gate results

| Check | Result |
|-------|--------|
| Journal/file parity (0009–0012) | PASS — tags match SQL files; consecutive journal idx. Later `0013_document_owner_types` is separate Lead Wave 4 work and does not reopen 0012. |
| 0012 patches (`0012-PATCH-NOTES.md`) in SQL + Drizzle | PASS — kind-scoped `external_access_grants_scope_present` |
| AP matching + vendor portal app layer | PASS — candidates never mutate financial truth |
| Conflicting migration numbers | PASS — single `0012`; later `0013` is separate additive enum work |
| `tsc --noEmit` | PASS |
| Unit: `tests/unit/ap`, `portal`, `procurement` | PASS (56) |

## Included in this freeze

### Schema (`0012_ap_vendor_portal.sql` + mirrors)

- Permissions seed: `ap.read`, `ap.manage`
- `external_access_grants.vendor_id` + vendor index
- Kind-scoped grant CHECK (vendor ⇒ `vendor_id` only; customer ⇒ client/project, no vendor)
- Tables: `ap_bills`, `ap_bill_lines`, `ap_po_matches` (target = PO and/or existing expense)
- Tenant RLS + FORCE RLS on AP tables
- Drizzle: `drizzle/schema/ap.ts`, `drizzle/schema/portal.ts`

### App layer (Wave 3 depth)

- AP bills CRUD + propose/accept/reject matches (`src/modules/ap`)
- Match integrity: currency, over-match, vendor alignment; accept updates status/links only — **never creates Expense**
- Procurement committed-cost path remains ≠ Expense
- Vendor portal grants, scopes allowlist, admin preview (`src/modules/portal`)
- Vendor AP bill + compliance candidates: process-local store only (`mutatesFinancialTruth: false`); no `ap_bills` / expenses / payments writes
- Vendor quote intake: `supplier_quotes.status = 'received'` only
- UI: `/procurement/ap`, Settings → Portal vendor grants/candidates

### Reviews closed into freeze

W3-F01–F08 FIXED (see `WAVE3-REVIEW-FINDINGS.md`). Residual **LOW only** (W3-L01, W3-L02) — not freeze blockers.

## Explicitly out of freeze / next

- Remote apply of 0009–0012 (owner gate; not requested here)
- `0013_document_owner_types` — separate Wave 4 enum expansion (not part of 0012)
- Public vendor/customer portal login UX (deferred)
- Durable persistence for portal AP/compliance candidates (semantics already freeze-safe)

## Verification commands (re-run)

```
npm run typecheck
npx vitest run tests/unit/ap tests/unit/portal tests/unit/procurement tests/unit/database/migration-journal.test.ts
```
