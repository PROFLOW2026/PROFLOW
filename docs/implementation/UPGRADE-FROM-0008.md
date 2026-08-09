# Upgrade from remote `0008` → local `0013`

**Audience:** Owner / release gate  
**Remote today:** through `0008_light_scheduling`  
**Local HEAD:** through `0013_document_owner_types`  
**Do not push** application code that depends on 0009–0013 until these are applied on the target database.

## Journal parity (verified)

`drizzle/migrations/meta/_journal.json` lists consecutive tags matching SQL files:

| idx | tag |
|-----|-----|
| 8 | `0009_wave2_foundations` |
| 9 | `0010_procurement_foundations` |
| 10 | `0011_field_ops_assets` |
| 11 | `0012_ap_vendor_portal` |
| 12 | `0013_document_owner_types` |

`tests/unit/database/migration-journal.test.ts` enforces file ↔ journal parity. Re-run before apply:

```
npx vitest run tests/unit/database/migration-journal.test.ts
```

## Apply order (strict)

Apply **only** via the ProjectFlow migrator (`drizzle/scripts/migrate.ts` / approved release runbook). Order:

1. `0009_wave2_foundations` — Wave 2 CRM / compliance / portal / API / custom fields foundations  
2. `0010_procurement_foundations` — materials, RFQ, quotes, POs, committed costs (≠ expense)  
3. `0011_field_ops_assets` — daily logs, punch, inspections, assets, fleet, maintenance, inventory  
4. `0012_ap_vendor_portal` — AP bills/matches + vendor grant columns (**frozen**; see `0012-FREEZE.md`)  
5. `0013_document_owner_types` — additive `document_owner_type` enum values (**frozen**; see `0013-FREEZE.md`)

Do not skip, renumber, or squash. Do not apply 0013 before 0009–0012.

## Post-apply checks

- Confirm `__drizzle_migrations` (or runner equivalent) shows tags through `0013_document_owner_types`
- Spot-check RLS: new tenant tables have ENABLE + FORCE RLS
- App smoke: procurement list, AP list, field-ops list, document attach on a Wave 3 owner
- Residual storage bucket action remains separate (`STORAGE-BUCKET-OWNER-ACTION.md`) — not a migration step

## Out of scope / deferred schema

- Optional tenant `organization_id` indexes proposed in `0014-INDEXES-PROPOSAL.md` — **not** shipped as `0014` (accepted LOW/MEDIUM residual; 0012/0013 frozen)
- OCR persistence numbering (if approved later) must not collide with indexes proposal — Lead assigns next free number
