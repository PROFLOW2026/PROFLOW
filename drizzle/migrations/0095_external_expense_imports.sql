-- Optional inbound expense document imports (SUMIT file capture → PF OCR).
-- Owner applies manually — do not modify 0000–0094.

CREATE TABLE IF NOT EXISTS public.external_expense_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_document_id text NOT NULL,
  source_document_type integer,
  status text NOT NULL,
  ocr_job_id uuid REFERENCES public.ocr_extraction_jobs (id) ON DELETE SET NULL,
  pdf_checksum_sha256 text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  processed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_expense_imports_provider_known CHECK (provider IN ('sumit')),
  CONSTRAINT external_expense_imports_status_known CHECK (
    status IN ('detected', 'ocr_queued', 'needs_review', 'failed', 'linked', 'ignored')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS external_expense_imports_org_provider_doc_uq
  ON public.external_expense_imports (organization_id, provider, external_document_id);

CREATE INDEX IF NOT EXISTS external_expense_imports_org_status_idx
  ON public.external_expense_imports (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS external_expense_imports_ocr_job_idx
  ON public.external_expense_imports (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

ALTER TABLE public.external_expense_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_expense_imports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_expense_imports_select ON public.external_expense_imports;
CREATE POLICY external_expense_imports_select ON public.external_expense_imports
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS external_expense_imports_insert ON public.external_expense_imports;
CREATE POLICY external_expense_imports_insert ON public.external_expense_imports
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS external_expense_imports_update ON public.external_expense_imports;
CREATE POLICY external_expense_imports_update ON public.external_expense_imports
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS external_expense_imports_delete ON public.external_expense_imports;
CREATE POLICY external_expense_imports_delete ON public.external_expense_imports
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS external_expense_imports_service_all ON public.external_expense_imports;
CREATE POLICY external_expense_imports_service_all ON public.external_expense_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.external_expense_imports IS
  'Tracks inbound supplier documents from optional external capture (e.g. SUMIT). Not ledger truth.';
