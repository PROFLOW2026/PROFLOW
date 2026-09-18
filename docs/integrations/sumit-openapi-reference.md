# SUMIT OpenAPI reference (ProjectFlow)

**Source:** [https://api.sumit.co.il/swagger/v1/swagger.json](https://api.sumit.co.il/swagger/v1/swagger.json)  
**Scope:** Test environment only in Milestone A/B. Production is blocked in application code.

## Authentication

All accounting endpoints accept a `Credentials` object (`Core_APICredentials`):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `CompanyID` | integer (int64) | yes | SUMIT company identifier (non-secret) |
| `APIKey` | string (minLength 1) | yes | Private API key — sealed in `app.invoicing_provider_credential_refs` |

## Response envelope

SUMIT returns HTTP 200 for many outcomes. ProjectFlow must inspect the envelope:

| Field | Notes |
|-------|-------|
| `Status` | `0` / `Success (0)` = OK; `1` / `BusinessError (1)` = business failure; `2` / `TechnicalError (2)` = technical failure |
| `UserErrorMessage` | Safe user-facing provider message (may be mapped to Hebrew UI) |
| `TechnicalErrorDetails` | Optional technical detail — never log credentials |
| `Data` | Endpoint payload when successful |

Never treat HTTP 2xx alone as success.

## Milestone A/B endpoints

| Operation | Path | Purpose |
|-----------|------|---------|
| Create document | `POST /accounting/documents/create/` | Issue tax invoice (type `0`) |
| Get details | `POST /accounting/documents/getdetails/` | Recovery after ambiguous timeout |
| List documents | `POST /accounting/documents/list/` | Test connection probe + scan by date/type |

### List request (`Accounting_Documents_List_Request`)

Required: `Credentials`.

Optional filters: `DocumentTypes`, `DocumentNumberFrom/To`, `DateFrom/To`, `IncludeDrafts`.

Paging (optional, nested — **not** top-level `PageNumber`):

```json
{
  "Credentials": { "CompanyID": 12345, "APIKey": "…" },
  "Paging": { "StartIndex": 0, "PageSize": 10 }
}
```

`PageSize` defaults to 10, minimum 10, maximum 1000.
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

**Reconciliation amounts (getdetails only):** Create response does not include totals.
ProjectFlow parses `Items[].TotalPrice`, `Items[].VAT`, and `Document.CompanyValue` /
`Document.DocumentValue` from getdetails. Missing fields → `reconciliation_status=not_available`
(never PF fallbacks).

## Idempotency

SUMIT has **no native create idempotency**. ProjectFlow duplicate protection:

1. DB row with `issuance_outcome=in_flight` before provider call
2. Partial unique index on blocking outcomes
3. Never blind-retry `create` after ambiguous timeout

## Test environment limits

- VAT number `999999998`
- ~100 operations + 400 API calls/month
- No ITA allocation in test
