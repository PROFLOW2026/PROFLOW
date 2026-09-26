-- 0131: Quick Capture Smart Inbox — session orchestration + document junction.
-- Migration after 0130. Do not modify migrations 0000–0130.
-- Additive only. No backfill. No destructive change.
--
-- DO NOT APPLY without explicit Owner approval.

CREATE TABLE IF NOT EXISTS public.quick_capture_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL,
  source text NOT NULL,
  session_kind text NOT NULL,
  document_count integer NOT NULL DEFAULT 1,
  owner_note text,
  explicit_project_id uuid,
  detected_type text,
  detection_confidence text,
  owner_selected_type text,
  suggested_project_id uuid,
  suggested_vendor_id uuid,
  suggestion_metadata jsonb NOT NULL DEFAULT '{}',
  primary_ocr_job_id uuid,
  selected_financial_document_id uuid,
  routed_entity_type text,
  routed_entity_id uuid,
  processing_error_code text,
  processing_error_message text,
  idempotency_key text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_capture_items_status_known CHECK (
    status IN ('captured', 'processing', 'ready_for_review', 'approved', 'rejected', 'archived', 'failed')
  ),
  CONSTRAINT quick_capture_items_source_known CHECK (
    source IN ('quick_capture', 'dashboard', 'fab')
  ),
  CONSTRAINT quick_capture_items_session_kind_known CHECK (
    session_kind IN ('images', 'video', 'pdf', 'file')
  ),
  CONSTRAINT quick_capture_items_detected_type_known CHECK (
    detected_type IS NULL OR detected_type IN ('financial_document', 'field_media', 'other_document', 'unknown')
  ),
  CONSTRAINT quick_capture_items_detection_confidence_known CHECK (
    detection_confidence IS NULL OR detection_confidence IN ('confirmed', 'suggested', 'unknown')
  ),
  CONSTRAINT quick_capture_items_owner_selected_type_known CHECK (
    owner_selected_type IS NULL OR owner_selected_type IN ('financial_document', 'field_media', 'other_document', 'unknown')
  ),
  CONSTRAINT quick_capture_items_document_count_range CHECK (
    document_count >= 1 AND document_count <= 5
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS quick_capture_items_id_organization_id_uq
  ON public.quick_capture_items (id, organization_id);

CREATE INDEX IF NOT EXISTS quick_capture_items_org_status_captured_idx
  ON public.quick_capture_items (organization_id, status, captured_at DESC);

CREATE INDEX IF NOT EXISTS quick_capture_items_org_creator_captured_idx
  ON public.quick_capture_items (organization_id, created_by_user_id, captured_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS quick_capture_items_org_idempotency_uq
  ON public.quick_capture_items (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Required for composite FK tenancy on primary_ocr_job_id (id is PK but PG needs composite unique).
CREATE UNIQUE INDEX IF NOT EXISTS ocr_extraction_jobs_id_organization_id_uq
  ON public.ocr_extraction_jobs (id, organization_id);

ALTER TABLE public.quick_capture_items
  ADD CONSTRAINT quick_capture_items_selected_fin_doc_org_fk
  FOREIGN KEY (selected_financial_document_id, organization_id)
  REFERENCES public.documents (id, organization_id)
  ON DELETE SET NULL (selected_financial_document_id);

ALTER TABLE public.quick_capture_items
  ADD CONSTRAINT quick_capture_items_primary_ocr_org_fk
  FOREIGN KEY (primary_ocr_job_id, organization_id)
  REFERENCES public.ocr_extraction_jobs (id, organization_id)
  ON DELETE SET NULL (primary_ocr_job_id);

ALTER TABLE public.quick_capture_items
  ADD CONSTRAINT quick_capture_items_explicit_project_org_fk
  FOREIGN KEY (explicit_project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE SET NULL (explicit_project_id);

ALTER TABLE public.quick_capture_items
  ADD CONSTRAINT quick_capture_items_suggested_project_org_fk
  FOREIGN KEY (suggested_project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE SET NULL (suggested_project_id);

ALTER TABLE public.quick_capture_items
  ADD CONSTRAINT quick_capture_items_suggested_vendor_org_fk
  FOREIGN KEY (suggested_vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE SET NULL (suggested_vendor_id);

CREATE TABLE IF NOT EXISTS public.quick_capture_item_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_capture_item_id uuid NOT NULL REFERENCES public.quick_capture_items (id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  position integer NOT NULL,
  ocr_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_capture_item_documents_position_range CHECK (
    position >= 0 AND position < 5
  )
);

ALTER TABLE public.quick_capture_item_documents
  ADD CONSTRAINT quick_capture_item_documents_doc_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.quick_capture_item_documents
  ADD CONSTRAINT quick_capture_item_documents_item_org_fk
  FOREIGN KEY (quick_capture_item_id, organization_id)
  REFERENCES public.quick_capture_items (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.quick_capture_item_documents
  ADD CONSTRAINT quick_capture_item_documents_ocr_job_org_fk
  FOREIGN KEY (ocr_job_id, organization_id)
  REFERENCES public.ocr_extraction_jobs (id, organization_id)
  ON DELETE SET NULL (ocr_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS quick_capture_item_documents_item_doc_uq
  ON public.quick_capture_item_documents (quick_capture_item_id, document_id);

CREATE UNIQUE INDEX IF NOT EXISTS quick_capture_item_documents_item_position_uq
  ON public.quick_capture_item_documents (quick_capture_item_id, position);

CREATE INDEX IF NOT EXISTS quick_capture_item_documents_document_idx
  ON public.quick_capture_item_documents (document_id);

ALTER TABLE public.quick_capture_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_capture_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quick_capture_items_select ON public.quick_capture_items;
CREATE POLICY quick_capture_items_select ON public.quick_capture_items
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_items_insert ON public.quick_capture_items;
CREATE POLICY quick_capture_items_insert ON public.quick_capture_items
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_items_update ON public.quick_capture_items;
CREATE POLICY quick_capture_items_update ON public.quick_capture_items
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_items_delete ON public.quick_capture_items;
CREATE POLICY quick_capture_items_delete ON public.quick_capture_items
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_items_service_all ON public.quick_capture_items;
CREATE POLICY quick_capture_items_service_all ON public.quick_capture_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.quick_capture_item_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_capture_item_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quick_capture_item_documents_select ON public.quick_capture_item_documents;
CREATE POLICY quick_capture_item_documents_select ON public.quick_capture_item_documents
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_item_documents_insert ON public.quick_capture_item_documents;
CREATE POLICY quick_capture_item_documents_insert ON public.quick_capture_item_documents
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_item_documents_update ON public.quick_capture_item_documents;
CREATE POLICY quick_capture_item_documents_update ON public.quick_capture_item_documents
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_item_documents_delete ON public.quick_capture_item_documents;
CREATE POLICY quick_capture_item_documents_delete ON public.quick_capture_item_documents
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS quick_capture_item_documents_service_all ON public.quick_capture_item_documents;
CREATE POLICY quick_capture_item_documents_service_all ON public.quick_capture_item_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.quick_capture_items IS
  'Quick Capture inbox session header. Orchestration only — not ledger or financial truth.';
COMMENT ON TABLE public.quick_capture_item_documents IS
  'Normalized membership between a Quick Capture session and canonical documents (1–5 per session).';
