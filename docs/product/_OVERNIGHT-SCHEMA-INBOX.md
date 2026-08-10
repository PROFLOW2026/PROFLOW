# Overnight SCHEMA_REQUEST inbox (Lead)

Collect agent schema asks here before designing `0020+`.  
**Never edit 0000–0019. Never apply to Supabase.**

## Final migration plan (Lead — integrated)

**Tag:** `0020_overnight_foundations`  
**File:** `drizzle/migrations/0020_overnight_foundations.sql`  
**Journal:** `meta/_journal.json` idx 19  

Single additive migration (no 0021 split). Includes:

| Area | Objects |
|------|---------|
| AP payments (priority) | `ap_payments`, `ap_payment_applications` |
| Banking | `bank_accounts`, `bank_import_batches`, `bank_transactions`, `bank_match_suggestions`, `bank_match_decisions` |
| Invoicing integration | `external_statutory_documents`, `external_invoicing_provider_connections` |
| Portals | `vendor_portal_ap_candidates`, `vendor_portal_compliance_candidates`; `document_links.portal_visible`; `project_milestones.portal_visible`; `external_access_grants_org_status_idx` |
| Planning | `planning_work_items`, `planning_dependencies` |
| Ops→Finance | `ops_expense_links` |
| OCR | `ocr_extraction_jobs` |
| Permissions seed | `banking.read` / `banking.manage`; `planning.read` / `planning.write` |

**Deferred (explicit):**
- `external_portal_sessions` / public portal auth (DISABLED)
- `ocr_extraction_candidates` (normalized; jsonb on jobs sufficient for V1)
- `offline_sync_receipts` (IndexedDB sufficient)
- `bank_feed_connections` / live feed credentials

**Drizzle schema:** `ap.ts` (+payments), `banking.ts`, `planning.ts`, `ocr.ts`, `ops-finance.ts`, `invoicing-integration.ts`, `portal.ts` (+candidates), `documents.ts` / `projects.ts` (`portal_visible`), `index.ts` exports.

**App wiring:**
- `MESSAGE_NAMESPACES`: `banking`, `planning`, `invoicingIntegration`
- Permissions catalog + role templates (manager/finance defaults)
- Settings nav: Banking (`banking.read` / manage)
- `AP_PAYMENTS_PERSISTENCE_READY=false` until owner applies 0020 (UI `schemaPending` + gated writes). Flip checklist in `src/modules/ap/SCHEMA_REQUEST.md`.
- OCR remains gated OFF by default (`OCR_INGESTION_ENABLED`)

**0000–0019:** untouched / immutable.

---

## Agent reports (source)

### Agent 4 — Invoicing integration — COMPLETE
Source: `src/modules/invoicing-integration/SCHEMA_REQUEST.md`

### Agent 6 — Planning / Gantt — COMPLETE
Source: `src/modules/planning/SCHEMA_REQUEST.md`

### Agent 3 — Banking / Reconciliation — COMPLETE
Source: `src/modules/banking/SCHEMA_REQUEST.md`

### Agent 7 — Ops→Finance bridges — COMPLETE
Source: `src/modules/ops-finance/SCHEMA_REQUEST.md`

### Agent 5 — Portals V1 — COMPLETE
Source: `src/modules/portal/SCHEMA_REQUEST.md`

### Agent 1 — Vendor Payments / AP — PARTIAL → schema landed
Source: `src/modules/ap/SCHEMA_REQUEST.md`

### Agent 8 — Offline field hardening — COMPLETE
Source: `src/modules/offline/SCHEMA_REQUEST.md` (optional only — skipped)

### Agent 2 — OCR — COMPLETE
Source: `src/modules/ocr/SCHEMA_REQUEST.md`
