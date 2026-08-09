# API / webhook hardening — schema proposal (Wave 4)

**Status:** Application hardening ships **without** a new migration.  
**Lead decision:** optional `0015_api_webhook_hardening` (or next free Lead number after OCR’s reserved `0014_*`).

**Do not:** edit frozen `0012` / `0013` SQL. Do not collide with `0014_ocr_foundations`.

## What already works without schema

| Capability | Approach |
|------------|----------|
| API key hash-only storage | Existing `api_keys.key_hash` + `key_prefix` |
| Last used | Existing `api_keys.last_used_at` |
| Webhook signing secret at rest | AES-GCM seal stored in `webhook_endpoints.secret_hash` (`enc:v1:…`) |
| Event ID + idempotent enqueue | Canonical envelope in `webhook_deliveries.payload.eventId`; lookup via `payload->>'eventId'` |
| HTTP response code on attempts | Encoded in `last_error` as `HTTP NNN: message` (+ parsed `lastHttpStatus` in domain) |
| Endpoint revoke | `status=disabled` + `archived_at` |
| Secret / key rotation | Application-level (new material; revoke old key) |

## When Lead needs migration `0015+`

Add **`0015_api_webhook_hardening`** only if Lead wants first-class columns / indexes:

```sql
-- Illustrative — Lead owns numbering & SQL authorship

ALTER TABLE webhook_deliveries
  ADD COLUMN event_id uuid,
  ADD COLUMN last_http_status integer;

-- Backfill event_id from payload when present
-- UPDATE webhook_deliveries
--   SET event_id = (payload->>'eventId')::uuid
--   WHERE payload ? 'eventId';

CREATE UNIQUE INDEX webhook_deliveries_org_event_uq
  ON webhook_deliveries (organization_id, event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE webhook_endpoints
  ADD COLUMN secret_ciphertext text,
  ADD COLUMN previous_secret_ciphertext text,
  ADD COLUMN secret_rotated_at timestamptz;

-- Optional dual-verify grace window during secret rotation
```

### Recommended column semantics

| Column | Purpose |
|--------|---------|
| `webhook_deliveries.event_id` | Stable idempotency key + consumer header; unique per org |
| `webhook_deliveries.last_http_status` | Peer response code without parsing `last_error` |
| `webhook_endpoints.secret_ciphertext` | Rename/clarify sealed secret (migrate off overloaded `secret_hash`) |
| `previous_secret_ciphertext` | Optional dual-signature window after rotation |

## Explicit non-goals

- Outbound HTTP delivery worker productization
- Notification product / push
- Fake third-party connectors
- Remote migrations from agents

## Residual risks until `0015`

1. Idempotency uniqueness is application-enforced (race possible under concurrent enqueue of the same `eventId`).
2. HTTP status lives in `last_error` text until a dedicated column exists.
3. Legacy hash-only webhook rows cannot sign until secret rotation seals them.
