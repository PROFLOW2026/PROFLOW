# SCHEMA_REQUEST — Document storage cleanup (Lead 0041)

**Agent:** DOC-CLEANUP  
**Do not apply in 0000–0035.** Do **not** write SQL from this agent. Portal stays off. Soft-delete must keep history (`status=deleted`); do not hard-delete metadata.

## Why

`softDeleteDocument` is metadata-authoritative. Storage `remove` can still fail after retries, leaving **orphaned bytes**. The documents table has no notes/JSON metadata field and no cleanup columns. `checksum` is a SHA-256 of file bytes (duplicate detection) and is only overloaded as an **interim** flag.

## Interim (no migration)

Until 0041:

- Retry storage remove a few times on soft-delete.
- On persistent failure, record `document.storage_cleanup_failed` (existing audit trail) with attempts, error, and `storagePath`.
- Flag the row with checksum prefix `pf:storage-orphan:` (original checksum encoded after the prefix) so `retryFailedDocumentCleanups` can list deleted docs whose object may remain.

## Requested columns on `documents`

| Column | Type | Null | Purpose |
|---|---|---|---|
| `storage_cleanup_status` | text | yes | `pending` \| `succeeded` \| `failed` (null = never needed / not tracked). |
| `storage_cleanup_attempts` | integer | no, default 0 | How many remove attempts have been made after delete. |
| `storage_cleanup_error` | text | yes | Last remove error (truncated). |
| `storage_cleanup_last_attempted_at` | timestamptz | yes | Last remove attempt. |

Optional: check constraint on `storage_cleanup_status`. Index on `(organization_id, status, storage_cleanup_status)` where status is `deleted` and cleanup is `failed`/`pending` for the sweep.

## After 0041

- Map columns in `documents.repository` / `DocumentRecord`.
- Stop encoding orphans in `checksum`; restore any `pf:storage-orphan:` values to the original checksum (suffix after the prefix) and set `storage_cleanup_status = 'failed'`.
- `retryFailedDocumentCleanups` should list `status = 'deleted'` AND `storage_cleanup_status IN ('failed', 'pending')`.
- Successful remove → `storage_cleanup_status = 'succeeded'`, clear error.
- Keep audit events; columns are the operational flag.

## Not requested

- Hard-delete of document rows
- Portal visibility changes
- New buckets or storage-path format
