# Document owner-type expansion (Wave 4) — Lead

**Migration:** `0013_document_owner_types` (LOCAL, not remotely applied)

## Included owner types (additive enum values)

- `procurement_rfq`
- `purchase_order`
- `ap_bill`
- `daily_log`
- `punch_list_item`
- `inspection`
- `compliance_artifact`
- `asset`
- `inventory_item`

## App mirrors

- `drizzle/schema/enums.ts`
- `src/modules/documents/domain/types.ts`
- `src/modules/documents/data/verify-document-owner.ts`

## UI

Wire `DocumentAttachments` / `getEntityDocumentPanelData` on entity detail pages using these owner types. Storage remains private + signed-access.

## Owner bucket action

If the private documents bucket is still missing on Supabase, document it once at the next release gate after migrations 0009–0013 are final. Do not request remote apply early.
