# SUMIT OpenAPI reference (ProjectFlow)

**Source:** [https://api.sumit.co.il/swagger/v1/swagger.json](https://api.sumit.co.il/swagger/v1/swagger.json)  
**Scope:** Test environment only in Milestone A/B. Production is blocked in application code.

## Authentication

All accounting endpoints accept a `Credentials` object:

| Field | Type | Notes |
|-------|------|-------|
| `CompanyID` | number | SUMIT company identifier (non-secret; stored on connection row metadata path) |
| `APIKey` | string | Private API key — sealed in `app.invoicing_provider_credential_refs` |

## Milestone A/B endpoints

| Operation | Path | Purpose |
|-----------|------|---------|
| Create document | `POST /accounting/documents/create/` | Issue tax invoice (type `0`) |
| Get details | `POST /accounting/documents/getdetails/` | Recovery after ambiguous timeout |
| List documents | `POST /accounting/documents/list/` | Scan by date/type; match `ExternalReference` client-side |
| Cancel | `POST /accounting/documents/cancel/` | Deferred (Milestone D) |
| Send | `POST /accounting/documents/send/` | Email delivery — future |
| Get PDF | `POST /accounting/documents/getpdf/` | Future attachment flow |

## Create payload (tax invoice)

ProjectFlow sends:

- `DocumentType: 0` (Invoice)
- `Details.ExternalReference` — PF deterministic idempotency key
- `Customer` — from frozen `customer_snapshot` when available

Response fields used by ProjectFlow:

- `DocumentID` → `external_statutory_documents.external_id`
- `DocumentNumber` → `external_number`
- Amount fields for reconciliation when present

## Idempotency

SUMIT has **no native create idempotency**. ProjectFlow duplicate protection:

1. DB row with `issuance_outcome=in_flight` before provider call
2. Partial unique index on blocking outcomes
3. Never blind-retry `create` after ambiguous timeout

## Test environment limits

- VAT number `999999998`
- ~100 operations + 400 API calls/month
- No ITA allocation in test
