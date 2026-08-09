# 0014 — OCR foundations (proposal only)

**Status:** Proposal only — **do not apply** a migration in this wave.  
**Suggested migration id (if Lead later approves):** `0014_ocr_foundations`  
**Filename note:** Distinct from other `0014-*` proposals (`0014-INDEXES-PROPOSAL.md`,
`0014-VENDOR-PORTAL-CANDIDATES-PROPOSAL.md`, `0014-DOCUMENT-CONTRACT-OWNER-PROPOSAL.md`).
Lead assigns the next free journal number if indexes/vendor/document proposals
land first — rename the SQL id accordingly; do not double-book `0014`.

**Canonical product flow (already in-process, no DB required):**

```text
Document / upload
  → extract request (documents.manage)
  → stub/provider result (never fabricated amounts)
  → candidate fields + confidence + provenance
  → /documents/ocr-review
  → user corrections (retained overrides)
  → explicit confirm
  → draft Expense only (never auto-finalize / auto-ledger)
```

## Why persistence might be needed later

Today jobs live in a process-local in-memory store. That is enough for product
depth and tests. Persist **only if** jobs must survive restarts or multi-instance
deploys.

## Proposed tables (Lead-owned migration — not authored here)

### `ocr_extraction_jobs`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations | RLS + app filter |
| `document_id` | uuid FK → documents NULL | original document retained |
| `source_filename` | text NULL | |
| `source_mime_type` | text NULL | |
| `status` | enum | `queued` \| `running` \| `succeeded` \| `failed` \| `needs_review` |
| `provider_id` | text | adapter id (`stub`, later real) |
| `error_code` | text NULL | `not_configured`, `empty_result`, … |
| `error_message` | text NULL | |
| `extracted_candidates` | jsonb NULL | immutable provider snapshot |
| `review_overrides` | jsonb NULL | retained user corrections |
| `confirmed_expense_id` | uuid FK → expenses NULL | set **only** after explicit confirm |
| `created_at` / `updated_at` | timestamptz | |

### Optional `ocr_extraction_candidates` (normalized)

| Column | Type | Notes |
|--------|------|--------|
| `job_id` | uuid FK | |
| `field_key` | text | canonical field keys + suggestion labels |
| `value` | text NULL | |
| `confidence` | numeric NULL | 0–1 |
| `provenance` | jsonb | `{ source, providerId, model, extractedAt, rawTextSnippet }` |
| `is_extracted_snapshot` | boolean | true = immutable provider output |

## Hard rules

- OCR rows are never canonical ledger truth.
- Confirm creates **draft** expense via existing expenses APIs — never finalize.
- Project/category suggestions are labels only — never written as UUIDs.
- Stub without `OCR_PROVIDER_API_KEY` → `not_configured`.
- Stub with key still → `empty_result` (no fabricated fields) until a real adapter exists.

## Permissions (reuse)

- List / review UI: `documents.read`
- Enqueue extraction / seed fixture: `documents.manage`
- Confirm → create draft expense: `expenses.create`

## Env

```bash
# SERVER ONLY — never NEXT_PUBLIC_*
OCR_PROVIDER_API_KEY=""
```

## Alternative

Keep the in-memory store (preferred for this wave). Do not stuff free-form OCR
JSON onto `documents` without Lead approval.
