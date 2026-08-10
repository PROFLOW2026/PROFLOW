# SCHEMA_REQUEST — External Statutory Invoicing Integration (Agent 4)

Lead designs additive `0020+` after wave reports. Do not edit `0000`–`0019` / journal / schema from this agent.

**App wiring (Agent E):** Drizzle repos + `INVOICING_INTEGRATION_PERSISTENCE_READY` (default **false**).
In-memory store is **TEST DOUBLE ONLY**. Persistence readiness never enables an unconfigured provider.

## TABLE `external_statutory_documents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | FK → organizations, same-org RLS |
| `billing_record_id` | uuid NOT NULL | FK → billing_records |
| `provider_id` | text NOT NULL | Adapter id (never `local` / `projectflow-local`) |
| `kind` | text NOT NULL | CHECK: tax_invoice \| credit_note \| receipt \| proforma \| other |
| `status` | text NOT NULL | CHECK: requested \| pending \| issued \| allocated \| credited \| cancelled \| failed |
| `external_id` | text NULL | Provider document id |
| `external_number` | text NULL | Statutory number from provider |
| `external_url` | text NULL | Deep link / portal URL |
| `pdf_content_type` | text NULL | |
| `pdf_byte_size` | integer NULL | |
| `pdf_checksum_sha256` | text NULL | |
| `pdf_storage_document_id` | uuid NULL | FK → documents (optional stored copy) |
| `pdf_file_name` | text NULL | |
| `allocation_reference` | text NULL | Provider payment/allocation ref |
| `last_error_code` | text NULL | |
| `last_error_message` | text NULL | |
| `requested_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |
| `issued_at` | timestamptz NULL | |
| `created_by` | uuid NULL | membership / user |

**Why:** Persist Billing Record → External Statutory Document link without treating Billing as statutory issuance. Store provider reference, status, number, URL, PDF metadata.

**FK + same-org integrity:**
- `billing_records.organization_id` must equal `external_statutory_documents.organization_id` (composite FK or trigger / CHECK via join).
- RLS: `organization_id = current_org()`.
- Optional: `pdf_storage_document_id` same-org with `documents`.

## INDEXES

- `idx_ext_stat_docs_org_billing` on `(organization_id, billing_record_id)`
- `idx_ext_stat_docs_org_external` unique partial on `(organization_id, provider_id, external_id)` WHERE `external_id IS NOT NULL`
- `idx_ext_stat_docs_org_status` on `(organization_id, status)`

## TABLE `external_invoicing_provider_connections` (optional, settings)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL UNIQUE | one active connection per org in V1 |
| `provider_id` | text NOT NULL | |
| `status` | text NOT NULL | CHECK: disconnected \| connected \| error |
| `credentials_ref` | text NULL | vault / sealed secret pointer — never plaintext in app tables if avoidable |
| `capabilities_json` | jsonb NOT NULL | create / status / credit / cancel / allocate flags |
| `connected_at` | timestamptz NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Why:** Feature remains disabled until a real provider connection row exists (`status = connected`). Avoids hardcoding a commercial vendor.

**FK + same-org integrity:** RLS on `organization_id`.

## CHECK / RLS

- Forbid `provider_id IN ('local', 'projectflow-local')` via CHECK.
- No trigger that finalizes BillingRecord from external status.
- External credit/cancel must not silently rewrite billing amounts (app-layer only).

## Existing column note

`billing_records.external_document_id` today points at `documents` (attached file). Keep that for manual attachments. The new link table is the statutory provider reference; Lead may later add `billing_records.external_statutory_document_id` nullable FK if a single primary link is desired.
