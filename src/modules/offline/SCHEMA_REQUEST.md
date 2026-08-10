# Offline field — SCHEMA_REQUEST (Agent 8)

No additive Drizzle tables required for this wave.

## Client-only (already implemented)

- IndexedDB `projectflow-offline` drafts store (v2 + `userId` index)
- IndexedDB `projectflow-offline-blobs` attachments store
- localStorage queue index v2 (org + user scoped metadata)

## Optional future (Lead 0020+)

```text
TABLE offline_sync_receipts
  organization_id uuid NOT NULL FK organizations
  user_id uuid NOT NULL FK users
  local_id text NOT NULL
  kind text NOT NULL
  server_id uuid NULL
  created_at timestamptz NOT NULL
  UNIQUE (organization_id, local_id)
Why: durable server-side idempotency if text-field offline markers are insufficient for a kind
FK + same-org integrity: organization_id + user_id must match session; RLS by org membership
```

Not blocking field offline hardening — create paths already embed `[pf-offline:<localId>]` markers and re-check before insert.
