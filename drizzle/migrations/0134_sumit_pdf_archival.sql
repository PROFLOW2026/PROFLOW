-- Migration 0134: SUMIT PDF archival columns on external_statutory_documents
-- Adds four columns that track external-storage archival state for statutory PDFs.
-- archive_pending = TRUE means the archival was requested but has not yet succeeded.
-- archive_error  holds the most recent failure reason (cleared on success).
-- storage_reference holds the provider file ID / web URL once archived.
-- archived_at    records when the archival completed.

ALTER TABLE external_statutory_documents
  ADD COLUMN IF NOT EXISTS storage_reference TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archive_error TEXT;

-- Partial index: fast lookup of documents waiting to be archived.
CREATE INDEX IF NOT EXISTS idx_ext_stat_docs_archive_pending
  ON external_statutory_documents (organization_id)
  WHERE archive_pending = TRUE;
