# OCR — SCHEMA_REQUEST (Agent 2)

**Status:** Request only — Lead designs additive `0020+`. Do not apply migrations here.  
**In-memory store:** Sufficient for review → confirm → draft until persistence is approved.

## Env / provider keys still required for live OCR

```bash
# Feature gate — OFF by default. Stub alone never counts as live OCR.
OCR_INGESTION_ENABLED=false

# Provider id: stub | azure  (extend registry for more adapters)
OCR_PROVIDER=stub

# SERVER ONLY — never NEXT_PUBLIC_*
OCR_PROVIDER_API_KEY=

# Required when OCR_PROVIDER=azure
OCR_PROVIDER_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
# Optional. Default: prebuilt-receipt (expense) or prebuilt-invoice (AP/general).
OCR_PROVIDER_MODEL=

# Azure pricing tier: F0 (default) | S0 — drives effective size/page limits
OCR_AZURE_TIER=F0
# Paid Query Fields add-on — S0 only, OFF by default. Hebrew does NOT require this.
OCR_AZURE_QUERY_FIELDS=false

# Local tooling only (never production): sample review jobs, not real OCR
OCR_ALLOW_FIXTURE=false
```

Live mode requires `OCR_INGESTION_ENABLED=true` **and** a non-stub provider with credentials (`azure` needs key + endpoint).

### Azure Hebrew (2024-11-30) — native first

Official Microsoft language support lists Hebrew (`he`) for both `prebuilt-invoice`
and `prebuilt-receipt`. The normal Hebrew path uses native prebuilt extraction.

| Layer | What it provides |
|-------|------------------|
| Native `prebuilt-invoice` | VendorName, VendorTaxId, InvoiceId, dates, totals, Items, … |
| Native `prebuilt-receipt` | MerchantName, TransactionDate, Total/Tax/Subtotal, Items, … |
| Free `keyValuePairs` | Supplemental KVP text for Israeli labels when present |
| Israeli normalize (app) | Company number cleanup, Hebrew doc-type labels, ILS default, review warnings |
| Optional `queryFields` (S0 + opt-in) | Only for truly missing Israel-specific names — never required for Hebrew |

### F0 vs S0 capability handling

Effective limits = min(app abuse ceiling, Azure tier). F0 = 4 MB / 2 pages.
Over-limit files fail **before** the provider call with a clear message — no silent
2-page truncate while claiming the whole PDF was processed.

---

## TABLE: `ocr_extraction_jobs`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations | RLS + app filter |
| `document_id` | uuid FK → documents NULL | original document retained |
| `source_filename` | text NULL | |
| `source_mime_type` | text NULL | |
| `status` | text/enum | `queued` \| `running` \| `succeeded` \| `failed` \| `needs_review` \| `rejected` |
| `review_status` | text/enum | `awaiting_review` \| `accepted` \| `rejected` |
| `provider_id` | text | adapter id (`azure`, …) |
| `overall_confidence` | numeric NULL | 0–1 |
| `error_code` | text NULL | `not_configured`, `empty_result`, `feature_disabled`, … |
| `error_message` | text NULL | |
| `extracted_candidates` | jsonb NULL | immutable provider snapshot |
| `review_overrides` | jsonb NULL | retained user corrections |
| `accepted_fields` | jsonb NULL | string[] of accepted field keys |
| `rejected_fields` | jsonb NULL | string[] of rejected field keys |
| `raw_metadata` | jsonb NULL | **safe** provider metadata only (no secrets / full binaries) |
| `confirmed_expense_id` | uuid FK → expenses NULL | set **only** after explicit confirm → draft expense |
| `confirmed_vendor_bill_id` | uuid FK → ap_bills NULL | set **only** after explicit confirm → **draft** bill |
| `confirmed_vendor_credit_id` | uuid FK → ap_vendor_credits NULL | set **only** after explicit confirm → **draft** credit (**0031**) |
| `confirmed_draft_target` | text NULL | `expense` \| `vendor_bill` \| `vendor_credit` (**0031**) |
| `created_at` / `updated_at` | timestamptz | |

### Why
Survive restarts / multi-instance; audit provider + confidence + accepted/rejected; link draft financials without making OCR ledger truth.

### FK + same-org integrity
- `organization_id` NOT NULL; all FKs must share org (composite / trigger / app assert).
- `confirmed_vendor_bill_id` → `ap_bills` where `status = 'draft'` at write time (app invariant).
- RLS: `organization_id IN (memberships for auth.uid())`.

### Indexes
- `(organization_id, status, updated_at DESC)`
- `(organization_id, review_status)`
- `(organization_id, document_id)` where document_id IS NOT NULL

### Checks
- `status` / `review_status` / `confirmed_draft_target` known enums
- NOT both finalized financial writes: OCR never stores “posted” flags

---

## Optional TABLE: `ocr_extraction_candidates` (normalized)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid FK | denormalized for RLS |
| `job_id` | uuid FK → ocr_extraction_jobs | |
| `field_key` | text | canonical keys |
| `value` | text NULL | |
| `confidence` | numeric NULL | 0–1 |
| `provenance` | jsonb | `{ source, providerId, model, extractedAt, rawTextSnippet }` |
| `is_extracted_snapshot` | boolean | true = immutable provider output |

### Why
Queryable confidence / provenance without large jsonb churn.

---

## Hard rules (schema + app)

- OCR rows are never canonical ledger truth.
- Confirm creates **draft** Expense **or** **draft** Vendor Bill only — never finalize expense, never open/recognized AP bill from OCR.
- Project/category suggestions are labels only — never UUIDs.
- `raw_metadata` must exclude API keys, full file bytes, and unbounded PII dumps.

## Permissions (reuse — no catalog edit in this wave)

- List / review UI: `documents.read`
- Enqueue extraction / seed sample: `documents.manage`
- Confirm → draft expense: `expenses.create`
- Confirm → draft vendor bill / draft vendor credit: `ap.manage`
  (vendor credit is first-class via additive migration `0031_ocr_vendor_credit_target`)

## Persistence limitation (PRE-SQL)

`0020` defines `ocr_extraction_jobs`. Additive `0031` extends confirmed targets
to include `vendor_credit` + `confirmed_vendor_credit_id`. **Owner must review
and apply 0031** — do not treat raw_metadata as the permanent credit FK.

While `OCR_PERSISTENCE_READY` is false, `in-memory-ocr.store` is a **test double only**.
Feature remains gated OFF by default (`OCR_INGESTION_ENABLED`). Azure live HTTP is implemented; enable with credentials + `OCR_INGESTION_ENABLED=true`.

### Flip checklist
1. Owner applies `0020_overnight_foundations`.
2. Verify PGlite / staging OCR metadata round-trip.
3. Set `OCR_PERSISTENCE_READY = true` in `src/modules/ocr/domain/persistence.ts`.

Prefer additive CHECK for confirmed target shape (0031 strict):
- no target → expense/bill/credit IDs all NULL
- expense → expense id NOT NULL; bill/credit NULL
- vendor_bill → bill id NOT NULL; expense/credit NULL
- vendor_credit → credit id NOT NULL; expense/bill NULL
Financial confirm FKs use ON DELETE RESTRICT (OCR audit provenance).
(App enforces the same invariant.)

