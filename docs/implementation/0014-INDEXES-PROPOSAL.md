# 0014 proposal — tenant `organization_id` indexes (deferred)

**Status:** ACCEPTED RESIDUAL — **do not ship** `0014_tenant_indexes` in this pre-launch wave  
**Severity:** LOW / MEDIUM (not HIGH)  
**Why deferred:** `0012_ap_vendor_portal` and `0013_document_owner_types` are freeze-ready. Additive indexes are optional polish (also noted in `0012-PATCH-NOTES.md`). Pre-launch policy: ship `0014` only if clearly HIGH.

## Prior finding

Wave 3 / migration review: several child and field-ops tables filter by `organization_id` in app code (and RLS `app.is_org_member(organization_id)`) but only have parent/project/item indexes.

## Candidate indexes (if Lead later approves)

Suggested names — illustrative; Lead owns final SQL + journal entry.

### From `0011_field_ops_assets` (org-scoped lists)

| Table | Existing indexes | Proposed |
|-------|------------------|----------|
| `daily_logs` | `(project_id, log_date)` | `(organization_id)` or `(organization_id, log_date desc)` |
| `punch_list_items` | `(project_id)` | `(organization_id)` |
| `inspections` | `(project_id)` | `(organization_id)` |
| `maintenance_records` | `(asset_id)` | `(organization_id)` |
| `inventory_movements` | `(inventory_item_id)` | `(organization_id)` |

Already indexed by org: `assets`, `fleet_vehicles`, `inventory_items`.

### From `0010_procurement_foundations` (child rows)

| Table | Existing | Proposed |
|-------|----------|----------|
| `material_vendor_prices` | `(material_item_id)` | `(organization_id)` optional |
| `procurement_rfq_lines` | `(rfq_id)` | usually unnecessary if always keyed by `rfq_id` |
| `supplier_quote_lines` | `(supplier_quote_id)` | same |
| `purchase_order_lines` | `(purchase_order_id)` | same |

Parent headers already have org indexes.

### From `0012_ap_vendor_portal`

| Table | Existing | Proposed |
|-------|----------|----------|
| `ap_bill_lines` | `(ap_bill_id)` | `(organization_id)` optional |
| `ap_po_matches` | `(ap_bill_id)` | `(organization_id)` optional |

`ap_bills` already has `ap_bills_org_idx`.

## Why not HIGH for V1 launch

- Org sizes expected small; project/item filters cover common detail paths
- App always passes `organizationId`; missing org btree is a scale/latency concern, not a correctness or tenancy hole
- RLS still evaluates `organization_id`; indexes help plans under growth, not security correctness
- No production evidence of seq-scan pain on these tables yet

## When to promote to HIGH and ship `0014_tenant_indexes`

Ship only if **any** of:

- Org list pages on field-ops / maintenance regularly exceed ~10k rows and EXPLAIN shows seq scans on `organization_id`
- p95 list latency regressions attributed to these tables
- Lead explicitly prioritizes index migration before scale testing

Until then: **accepted LOW/MEDIUM residual**. Prefer app-layer list limits/pagination (this hardening pass) over a frozen-migration reopen.

## Numbering collision note

`OCR-SCHEMA-PROPOSAL.md` also reserved a possible `0014_ocr_foundations`. If both are approved, Lead assigns distinct numbers (e.g. indexes `0014`, OCR `0015`) — do not double-book.
