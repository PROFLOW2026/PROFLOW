# External Storage Migration Inventory (2026-09-14)

## Production upload path (after 0087)

All new business uploads via `prepareDocumentUpload` → external org storage (no Supabase fallback).

## Legacy Supabase reads retained

| Surface | Mechanism | New writes |
|---------|-----------|------------|
| Documents module (`DocumentAttachments`) | External via upload API | External |
| Branding assets | Supabase `StoragePort` | Supabase (org logos — not business documents) |
| OCR byte load | External + legacy Supabase | N/A (reads) |
| Offline IndexedDB | Local until sync → external | External after sync |
| E2E harness | In-memory `/e2e-storage` | Test only |

## Domain attachment surfaces (all routed through documents pipeline)

Expenses, AP bills, POs, RFQs, billing, changes/quotes, clients, vendors, employees, field-ops photos, safety, compliance, assets, inventory, warranty, forms, projects/contracts — **30+ owner types** via `document_links`.

## Supabase search tails

`getStoragePort()` remains for `storage_backend = supabase_legacy` reads and branding. No new business file writes to Supabase bucket after this release.
