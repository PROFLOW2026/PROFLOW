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
OCR_PROVIDER_MODEL=prebuilt-receipt

# Local tooling only (never production): sample review jobs, not real OCR
OCR_ALLOW_FIXTURE=false
```

Live mode requires `OCR_INGESTION_ENABLED=true` **and** a non-stub provider with credentials (`azure` needs key + endpoint).

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
| `confirmed_draft_target` | text NULL | `expense` \| `vendor_bill` |
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
- Confirm → draft vendor bill: `ap.manage`

## Persistence limitation (PRE-SQL)

`0020` defines `ocr_extraction_jobs`. Drizzle repository is wired behind
`OCR_PERSISTENCE_READY` (**default false** until owner applies 0020).

While the flag is false, `in-memory-ocr.store` is a **test double only** — not durable.
Feature remains gated OFF by default (`OCR_INGESTION_ENABLED`, `AZURE_OCR_LIVE_HTTP_READY`).

### Flip checklist
1. Owner applies `0020_overnight_foundations`.
2. Verify PGlite / staging OCR metadata round-trip.
3. Set `OCR_PERSISTENCE_READY = true` in `src/modules/ocr/domain/persistence.ts`.

### Schema note for Lead
Prefer additive CHECK for confirmed target shape:
- no target → both expense/bill IDs NULL
- expense → vendor_bill id NULL
- vendor_bill → expense id NULL
(App already enforces; DB CHECK was pending Agent A.)

