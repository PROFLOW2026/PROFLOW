# 0013 FREEZE READY — document owner types

**Status:** FREEZE READY (additive enum only)  
**Migration:** `drizzle/migrations/0013_document_owner_types.sql`  
**Depends on:** 0009–0012 (local). Do not apply remotely until the release checkpoint includes 0009–0013 together.

## Contents

Postgres `document_owner_type` ADD VALUE for Wave 3 entities:

- procurement_rfq, purchase_order, ap_bill
- daily_log, punch_list_item, inspection
- compliance_artifact, asset, inventory_item

App mirrors + `verify-document-owner` + DocumentAttachments on key detail pages.

## Notes

- Does not reopen frozen 0012
- Private storage / signed-access unchanged
- Owner bucket config (if still missing) deferred to release gate text once
