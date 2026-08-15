-- 0049_wave2_workflows
-- Additive only. Does NOT modify 0000–0048.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Work-order billing sources (existing AR engine).
-- Canonical activity events for client timeline (pointers, not a second ledger).
-- Subcontract agreements: Original + approved changes = current. Commitment ≠ expense.
-- OCR background queue columns + batches. OCR never auto-creates Actual.

--------------------------------------------------------------------------------
-- Work order → existing AR billing
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order_billing_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL,
  billing_record_id uuid NOT NULL,
  composition_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS work_order_billing_sources_id_organization_id_uq
  ON public.work_order_billing_sources (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS work_order_billing_sources_pair_uq
  ON public.work_order_billing_sources (organization_id, work_order_id, billing_record_id);
CREATE INDEX IF NOT EXISTS work_order_billing_sources_billing_idx
  ON public.work_order_billing_sources (billing_record_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_billing_sources_wo_org_fk') THEN
    ALTER TABLE public.work_order_billing_sources
      ADD CONSTRAINT work_order_billing_sources_wo_org_fk
      FOREIGN KEY (work_order_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_billing_sources_billing_org_fk') THEN
    ALTER TABLE public.work_order_billing_sources
      ADD CONSTRAINT work_order_billing_sources_billing_org_fk
      FOREIGN KEY (billing_record_id, organization_id)
      REFERENCES public.billing_records (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.work_order_billing_live_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status text;
  v_kind text;
  v_live integer;
BEGIN
  SELECT p.work_kind INTO v_kind
  FROM public.projects p
  WHERE p.id = NEW.work_order_id AND p.organization_id = NEW.organization_id;
  IF v_kind IS DISTINCT FROM 'work_order' THEN
    RAISE EXCEPTION 'work_order_billing_sources: target must be a work_order project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.status INTO v_status
  FROM public.billing_records b
  WHERE b.id = NEW.billing_record_id AND b.organization_id = NEW.organization_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'work_order_billing_sources: billing record missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT count(*)::int INTO v_live
  FROM public.work_order_billing_sources s
  JOIN public.billing_records b
    ON b.id = s.billing_record_id AND b.organization_id = s.organization_id
  WHERE s.organization_id = NEW.organization_id
    AND s.work_order_id = NEW.work_order_id
    AND s.id IS DISTINCT FROM NEW.id
    AND b.status IN ('draft', 'finalized');

  IF v_status IN ('draft', 'finalized') AND v_live > 0 THEN
    RAISE EXCEPTION 'work_order_billing_sources: live billing already exists for this work order'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS work_order_billing_live_guard ON public.work_order_billing_sources;
CREATE TRIGGER work_order_billing_live_guard
  BEFORE INSERT OR UPDATE ON public.work_order_billing_sources
  FOR EACH ROW
  EXECUTE FUNCTION app.work_order_billing_live_guard();

REVOKE ALL ON FUNCTION app.work_order_billing_live_guard() FROM PUBLIC;

SELECT app.install_permissioned_rls('work_order_billing_sources', 'billing.read', 'billing.manage');

--------------------------------------------------------------------------------
-- Client timeline activity index (not financial truth)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  client_id uuid,
  project_id uuid,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  summary text NOT NULL,
  deep_link text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_id_organization_id_uq
  ON public.activity_events (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_idempotency_uq
  ON public.activity_events (organization_id, kind, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_events_client_idx
  ON public.activity_events (organization_id, client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_project_idx
  ON public.activity_events (organization_id, project_id, occurred_at DESC);

SELECT app.install_permissioned_rls('activity_events', 'clients.read', 'clients.manage');

DROP POLICY IF EXISTS activity_events_tenant_insert ON public.activity_events;
CREATE POLICY activity_events_tenant_insert ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

--------------------------------------------------------------------------------
-- Subcontract agreements
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  subcontract_number text,
  vendor_id uuid NOT NULL,
  project_id uuid NOT NULL,
  parent_contract_id uuid,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  original_amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  retention_percent numeric(9,6),
  start_date date,
  end_date date,
  notes text,
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_agreements_status_known
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  CONSTRAINT subcontract_agreements_amount_non_negative CHECK (original_amount >= 0),
  CONSTRAINT subcontract_agreements_date_order
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreements_id_organization_id_uq
  ON public.subcontract_agreements (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreements_org_number_uq
  ON public.subcontract_agreements (organization_id, subcontract_number)
  WHERE subcontract_number IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS subcontract_agreements_project_idx
  ON public.subcontract_agreements (organization_id, project_id);
CREATE INDEX IF NOT EXISTS subcontract_agreements_vendor_idx
  ON public.subcontract_agreements (organization_id, vendor_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_agreements_vendor_org_fk') THEN
    ALTER TABLE public.subcontract_agreements
      ADD CONSTRAINT subcontract_agreements_vendor_org_fk
      FOREIGN KEY (vendor_id, organization_id)
      REFERENCES public.vendors (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_agreements_project_org_fk') THEN
    ALTER TABLE public.subcontract_agreements
      ADD CONSTRAINT subcontract_agreements_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_agreements_contract_org_fk') THEN
    ALTER TABLE public.subcontract_agreements
      ADD CONSTRAINT subcontract_agreements_contract_org_fk
      FOREIGN KEY (parent_contract_id, organization_id)
      REFERENCES public.contracts (id, organization_id)
      ON DELETE SET NULL (parent_contract_id);
  END IF;
END $$;

SELECT app.install_permissioned_rls('subcontract_agreements', 'vendors.read', 'vendors.manage');

CREATE TABLE IF NOT EXISTS public.subcontract_value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  subcontract_id uuid NOT NULL,
  kind text NOT NULL,
  amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  effective_date date NOT NULL,
  reason text,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_value_events_kind_known
    CHECK (kind IN ('original', 'change_order', 'adjustment'))
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_value_events_id_organization_id_uq
  ON public.subcontract_value_events (id, organization_id);
CREATE INDEX IF NOT EXISTS subcontract_value_events_subcontract_idx
  ON public.subcontract_value_events (subcontract_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_value_events_sub_org_fk') THEN
    ALTER TABLE public.subcontract_value_events
      ADD CONSTRAINT subcontract_value_events_sub_org_fk
      FOREIGN KEY (subcontract_id, organization_id)
      REFERENCES public.subcontract_agreements (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('subcontract_value_events', 'vendors.read', 'vendors.manage');

CREATE OR REPLACE FUNCTION app.subcontract_value_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'subcontract_value_events: append-only'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'subcontract_value_events: append-only'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS subcontract_value_events_immutable ON public.subcontract_value_events;
CREATE TRIGGER subcontract_value_events_immutable
  BEFORE UPDATE OR DELETE ON public.subcontract_value_events
  FOR EACH ROW
  EXECUTE FUNCTION app.subcontract_value_events_immutable();

REVOKE ALL ON FUNCTION app.subcontract_value_events_immutable() FROM PUBLIC;

ALTER TABLE public.boq_subcontractor_schedules
  ADD COLUMN IF NOT EXISTS subcontract_agreement_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedules_agreement_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_schedules
      ADD CONSTRAINT boq_sub_schedules_agreement_org_fk
      FOREIGN KEY (subcontract_agreement_id, organization_id)
      REFERENCES public.subcontract_agreements (id, organization_id)
      ON DELETE SET NULL (subcontract_agreement_id);
  END IF;
END $$;

--------------------------------------------------------------------------------
-- OCR background queue extras
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ocr_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  total_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_batches_status_known
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ocr_batches_id_organization_id_uq
  ON public.ocr_batches (id, organization_id);
CREATE INDEX IF NOT EXISTS ocr_batches_org_status_idx
  ON public.ocr_batches (organization_id, status);

SELECT app.install_permissioned_rls('ocr_batches', 'documents.read', 'documents.manage');

ALTER TABLE public.ocr_extraction_jobs
  ADD COLUMN IF NOT EXISTS document_version_id uuid,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.ocr_extraction_jobs DROP CONSTRAINT IF EXISTS ocr_extraction_jobs_status_known;
ALTER TABLE public.ocr_extraction_jobs
  ADD CONSTRAINT ocr_extraction_jobs_status_known
  CHECK (status IN ('queued', 'running', 'processing', 'succeeded', 'failed', 'needs_review', 'rejected', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS ocr_extraction_jobs_org_idempotency_uq
  ON public.ocr_extraction_jobs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ocr_extraction_jobs_active_document_provider_uq
  ON public.ocr_extraction_jobs (organization_id, document_id, provider_id)
  WHERE document_id IS NOT NULL AND status IN ('queued', 'running', 'processing');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_extraction_jobs_batch_org_fk') THEN
    ALTER TABLE public.ocr_extraction_jobs
      ADD CONSTRAINT ocr_extraction_jobs_batch_org_fk
      FOREIGN KEY (batch_id, organization_id)
      REFERENCES public.ocr_batches (id, organization_id)
      ON DELETE SET NULL (batch_id);
  END IF;
END $$;

UPDATE public.ocr_extraction_jobs
SET queued_at = created_at
WHERE queued_at IS NULL;

ALTER TABLE public.ocr_extraction_jobs
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS ocr_extraction_jobs_claim_idx
  ON public.ocr_extraction_jobs (status, lease_expires_at, queued_at)
  WHERE status IN ('queued', 'running', 'processing');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_extraction_jobs_version_org_fk') THEN
    ALTER TABLE public.ocr_extraction_jobs
      ADD CONSTRAINT ocr_extraction_jobs_version_org_fk
      FOREIGN KEY (document_version_id, organization_id)
      REFERENCES public.document_versions (id, organization_id)
      ON DELETE SET NULL (document_version_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.claim_ocr_job(p_worker_token text, p_lease_seconds integer DEFAULT 120)
RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_id uuid;
  v_until timestamptz := now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 120), 30));
BEGIN
  UPDATE public.ocr_extraction_jobs j
  SET status = 'processing',
      claimed_at = now(),
      claimed_by = p_worker_token,
      lease_expires_at = v_until,
      heartbeat_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      updated_at = now()
  WHERE j.id = (
    SELECT c.id
    FROM public.ocr_extraction_jobs c
    WHERE c.status = 'queued'
       OR (
         c.status IN ('processing', 'running')
         AND c.lease_expires_at IS NOT NULL
         AND c.lease_expires_at < now()
       )
    ORDER BY c.queued_at NULLS LAST, c.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.claim_ocr_job_by_id(
  p_organization_id uuid,
  p_job_id uuid,
  p_worker_token text,
  p_lease_seconds integer DEFAULT 120
) RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_id uuid;
  v_until timestamptz := now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 120), 30));
BEGIN
  UPDATE public.ocr_extraction_jobs j
  SET status = 'processing',
      claimed_at = now(),
      claimed_by = p_worker_token,
      lease_expires_at = v_until,
      heartbeat_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      updated_at = now()
  WHERE j.id = p_job_id
    AND j.organization_id = p_organization_id
    AND (
      j.status = 'queued'
      OR (
        j.status IN ('processing', 'running')
        AND j.lease_expires_at IS NOT NULL
        AND j.lease_expires_at < now()
      )
    )
  RETURNING j.id INTO v_id;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.claim_ocr_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_ocr_job_by_id(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_ocr_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.claim_ocr_job_by_id(uuid, uuid, text, integer) TO service_role;

COMMENT ON TABLE public.work_order_billing_sources IS
  'Traceability only. Billing amounts live on billing_records. Duplicate live billing is blocked.';
COMMENT ON TABLE public.activity_events IS
  'Timeline index. Source entities remain the system of record.';
COMMENT ON TABLE public.subcontract_agreements IS
  'Commitment. Progress valuation is not payment. Posted AP is Actual.';
