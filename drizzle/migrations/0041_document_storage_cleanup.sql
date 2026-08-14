-- 0041_document_storage_cleanup
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Soft-delete remains metadata-authoritative (status=deleted). Storage remove
-- can fail; these columns are the durable retry flag. Do not hard-delete history.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_cleanup_status text,
  ADD COLUMN IF NOT EXISTS storage_cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_cleanup_error text,
  ADD COLUMN IF NOT EXISTS storage_cleanup_last_attempted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_storage_cleanup_status_known'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_storage_cleanup_status_known CHECK (
        storage_cleanup_status IS NULL
        OR storage_cleanup_status IN ('pending', 'succeeded', 'failed')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_storage_cleanup_failed_idx
  ON public.documents (organization_id, storage_cleanup_status)
  WHERE status = 'deleted'
    AND storage_cleanup_status IN ('failed', 'pending');

-- Promote interim checksum orphan flag into the durable column.
UPDATE public.documents
SET
  storage_cleanup_status = 'failed',
  storage_cleanup_attempts = GREATEST(storage_cleanup_attempts, 1),
  checksum = NULLIF(substring(checksum from char_length('pf:storage-orphan:') + 1), '')
WHERE checksum LIKE 'pf:storage-orphan:%'
  AND (storage_cleanup_status IS NULL OR storage_cleanup_status IS DISTINCT FROM 'succeeded');
