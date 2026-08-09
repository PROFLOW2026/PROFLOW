# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · Pre-launch program · Local HEAD ahead of origin · **Remote migrations:** through `0008` · **Local migrations:** through `0013_document_owner_types`

## OWNER — before next push

```
REMOTE MIGRATIONS REQUIRED
- 0009_wave2_foundations
- 0010_procurement_foundations
- 0011_field_ops_assets
- 0012_ap_vendor_portal
- 0013_document_owner_types
```

Do not push dependent code until these are applied. Local development continues.

Upgrade runbook: `docs/implementation/UPGRADE-FROM-0008.md`  
Optional tenant indexes (deferred LOW/MEDIUM): `docs/implementation/0014-INDEXES-PROPOSAL.md`

## Wave 1 — complete (0008 remote applied)

CI, CSV exports, light scheduling, presets, reports, documents drag/drop.

## Wave 2 — local integrated

| Stream | Status |
|--------|--------|
| Migration 0009 + schema | Done locally |
| Richer AR (summary, payment history, credit/void disclosure) | Done |
| Cash flow Actual vs Forecast (org + project) | Done |
| Structured CSV import (clients/vendors/employees/projects) | Done |
| CRM lifecycle + won conversion | Done |
| Compliance registry | Done |
| Customer portal grants + safe projection | Done |
| Governed custom fields | Done |
| API keys + webhooks foundation | Done |
| Security / financial / UX reviews | In progress |

## Wave 3 — started locally

| Stream | Status |
|--------|--------|
| Migration 0010 procurement + committed cost ≠ expense | Schema + module + UI |
| Migration 0011 field ops / assets / inventory | Schema done; module in progress |
| Vendor portal / AP–PO matching | Done (schema 0012 + `/procurement/ap` + vendor grants) |

## Wave 4 — document experience (local)

| Stream | Status |
|--------|--------|
| Document link UI (upload + link-existing) on supported owners | Done |
| Coherent UX: drag/drop, mobile capture, signed download, image/PDF preview, unlink/soft-delete, empty/loading/error | Done |
| Category labels + project contract docs (via label until 0014) | Done |
| Migration `0013_document_owner_types` (enum add for Wave 3 entities) | Local SQL; not remote |
| Proposed `0014_document_contract_owner` | Proposal only — Lead assigns |
| Residual private `documents` bucket action | See `STORAGE-BUCKET-OWNER-ACTION.md` — do not ask owner yet |
| Compliance / custom fields / CRM idempotent convert / portal candidate review | Done (this pass) |

## Deferred

Notifications / doc 26; marketing/pricing; native apps; fake OCR integrations; public portal login.

## Notes

- Subagent policy: Auto/Composer allowed; subagent APIs forbidden.
- Lead owns migration numbering; CommittedCost ≠ Expense preserved.
