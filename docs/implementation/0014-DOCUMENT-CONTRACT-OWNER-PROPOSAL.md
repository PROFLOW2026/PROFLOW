# Document owner-type: `contract` (proposed 0014) — Lead

**Status:** Proposed · **Do not collide with 0009–0013**  
**Proposed migration tag:** `0014_document_contract_owner` (Lead assigns final number)

## Why

Wave 4 product list requires usable Contract linking. Today contracts live on
projects and attachments use `project` + category label `contract` (no new enum).

## Proposed SQL (additive only)

```sql
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'contract';
```

## App mirrors after Lead confirms numbering

- `drizzle/schema/enums.ts`
- `src/modules/documents/domain/types.ts`
- `src/modules/documents/data/verify-document-owner.ts` → `contracts` table
- Project Documents tab: second panel with `ownerType: 'contract'` + contract id

## Interim (no migration)

Project Documents tab + category select `contract` on project-linked uploads.
