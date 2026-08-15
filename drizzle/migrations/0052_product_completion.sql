-- 0052_product_completion
-- Additive only. Does NOT modify 0000–0051.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Closes independent-audit product gaps that need schema:
--   * punch assignee
--   * inspection inspector + form template
--   * daily-log optional safety link
--   * project/job/work-order document numbers
--   * subcontract agreement FK on BOQ schedules and AP bills
--   * document compensation privacy class
--   * saved list views
--   * inspection as a form-submission owner
--
-- Owner SQL integrity (in-place, no 0054):
--   * optional composite FKs use ON DELETE SET NULL (optional_id) only
--     — never SET NULL organization_id
--   * AP bill ↔ subcontract: same org/vendor/exact project/currency;
--     recognized (non-draft) bills cannot reassign or null the agreement
--   * BOQ schedule ↔ agreement: org/project/vendor/currency + engagement match
--   * daily log ↔ safety: same project; org-level safety is not linkable
--   * compensation privacy AND on documents, versions, links, OCR jobs
--   * one default saved view per (organization_id, user_id, list_key)
--
-- Does not create a second financial engine. Does not enable the portal.
-- Inventory remains quantity-only. OCR still creates drafts only.

--------------------------------------------------------------------------------
-- Punch assignee
--------------------------------------------------------------------------------

ALTER TABLE public.punch_list_items
  ADD COLUMN IF NOT EXISTS assignee_employee_id uuid;

ALTER TABLE public.punch_list_items
  DROP CONSTRAINT IF EXISTS punch_list_items_assignee_org_fk;
ALTER TABLE public.punch_list_items
  ADD CONSTRAINT punch_list_items_assignee_org_fk
  FOREIGN KEY (assignee_employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE SET NULL (assignee_employee_id);

CREATE INDEX IF NOT EXISTS punch_list_items_assignee_idx
  ON public.punch_list_items (organization_id, assignee_employee_id);

--------------------------------------------------------------------------------
-- Inspections: inspector + reusable form template
--------------------------------------------------------------------------------

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspector_employee_id uuid;

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS form_template_id uuid;

ALTER TABLE public.inspections
  DROP CONSTRAINT IF EXISTS inspections_inspector_org_fk;
ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_inspector_org_fk
  FOREIGN KEY (inspector_employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE SET NULL (inspector_employee_id);

ALTER TABLE public.inspections
  DROP CONSTRAINT IF EXISTS inspections_form_template_org_fk;
ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_form_template_org_fk
  FOREIGN KEY (form_template_id, organization_id)
  REFERENCES public.form_templates (id, organization_id)
  ON DELETE SET NULL (form_template_id);

--------------------------------------------------------------------------------
-- Daily log optional link to a Safety record (never auto-created by trigger)
--------------------------------------------------------------------------------

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS linked_safety_record_id uuid;

ALTER TABLE public.daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_safety_org_fk;
ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_safety_org_fk
  FOREIGN KEY (linked_safety_record_id, organization_id)
  REFERENCES public.safety_records (id, organization_id)
  ON DELETE SET NULL (linked_safety_record_id);

-- Project daily logs may only link a Safety record on the same project.
-- Org-level safety (project_id IS NULL) is not linkable from a project log.
CREATE OR REPLACE FUNCTION app.daily_logs_safety_project_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_safety_project uuid;
BEGIN
  IF NEW.linked_safety_record_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT project_id INTO v_safety_project
  FROM public.safety_records
  WHERE id = NEW.linked_safety_record_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily_logs: linked safety record missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_safety_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'daily_logs: linked safety record must belong to the same project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS daily_logs_safety_project_guard ON public.daily_logs;
CREATE TRIGGER daily_logs_safety_project_guard
  BEFORE INSERT OR UPDATE OF linked_safety_record_id, project_id
  ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION app.daily_logs_safety_project_guard();

--------------------------------------------------------------------------------
-- Project / job / work-order human numbers (not UUID identity; no backfill)
--------------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS document_number text;

CREATE UNIQUE INDEX IF NOT EXISTS projects_org_document_number_uq
  ON public.projects (organization_id, document_number)
  WHERE document_number IS NOT NULL;

ALTER TABLE public.document_number_sequences
  DROP CONSTRAINT IF EXISTS document_number_sequences_kind_known;

ALTER TABLE public.document_number_sequences
  ADD CONSTRAINT document_number_sequences_kind_known CHECK (
    document_kind IN (
      'estimate',
      'change_request',
      'change_order',
      'purchase_order',
      'vendor_bill',
      'billing_record',
      'project',
      'job',
      'work_order'
    )
  );

CREATE OR REPLACE FUNCTION app.next_document_number(
  p_organization_id uuid,
  p_document_kind text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.document_number_sequences%ROWTYPE;
  v_num integer;
  v_prefix text;
  v_padding integer;
BEGIN
  IF p_document_kind NOT IN (
    'estimate', 'change_request', 'change_order', 'purchase_order', 'vendor_bill', 'billing_record',
    'project', 'job', 'work_order'
  ) THEN
    RAISE EXCEPTION 'document_number_sequences: unknown kind %', p_document_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'document_number_sequences: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_document_kind = 'estimate' THEN
    IF NOT app.has_org_permission(p_organization_id, 'quotes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires quotes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'purchase_order' THEN
    IF NOT app.has_org_permission(p_organization_id, 'procurement.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires procurement.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'vendor_bill' THEN
    IF NOT app.has_org_permission(p_organization_id, 'ap.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires ap.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'billing_record' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'billing.manage')
      OR app.has_org_permission(p_organization_id, 'boq.billing.create')
    ) THEN
      RAISE EXCEPTION 'document_number_sequences: requires billing.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_request' THEN
    IF NOT app.has_org_permission(p_organization_id, 'changes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_order' THEN
    IF NOT app.has_org_permission(p_organization_id, 'changes.approve') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.approve'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind IN ('project', 'job', 'work_order') THEN
    IF NOT app.has_org_permission(p_organization_id, 'projects.create') THEN
      RAISE EXCEPTION 'document_number_sequences: requires projects.create'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_prefix := CASE p_document_kind
    WHEN 'project' THEN 'PRJ-'
    WHEN 'job' THEN 'JOB-'
    WHEN 'work_order' THEN 'WO-'
    ELSE ''
  END;
  v_padding := CASE
    WHEN p_document_kind IN ('project', 'job', 'work_order') THEN 5
    ELSE 4
  END;

  INSERT INTO public.document_number_sequences (
    organization_id, document_kind, prefix, padding, next_number
  )
  VALUES (p_organization_id, p_document_kind, v_prefix, v_padding, 1)
  ON CONFLICT (organization_id, document_kind) DO NOTHING;

  SELECT * INTO v_row
  FROM public.document_number_sequences
  WHERE organization_id = p_organization_id AND document_kind = p_document_kind
  FOR UPDATE;

  v_num := v_row.next_number;
  UPDATE public.document_number_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_row.id;

  RETURN CASE
    WHEN v_row.prefix IS NULL OR btrim(v_row.prefix) = '' THEN lpad(v_num::text, v_row.padding, '0')
    ELSE v_row.prefix || lpad(v_num::text, v_row.padding, '0')
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.next_document_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_document_number(uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Subcontract chain: schedule and AP bill point at the agreement
--------------------------------------------------------------------------------

ALTER TABLE public.boq_subcontractor_schedules
  DROP CONSTRAINT IF EXISTS boq_sub_schedules_agreement_org_fk;
ALTER TABLE public.boq_subcontractor_schedules
  ADD CONSTRAINT boq_sub_schedules_agreement_org_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id)
  REFERENCES public.subcontract_agreements (id, organization_id)
  ON DELETE SET NULL (subcontract_agreement_id);

CREATE INDEX IF NOT EXISTS boq_sub_schedules_agreement_idx
  ON public.boq_subcontractor_schedules (organization_id, subcontract_agreement_id);

CREATE OR REPLACE FUNCTION app.boq_sub_schedules_agreement_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_vendor uuid;
  v_project uuid;
  v_currency char(3);
  v_eng_vendor uuid;
  v_eng_project uuid;
BEGIN
  IF NEW.subcontract_agreement_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vendor_id, project_id, currency
    INTO v_vendor, v_project, v_currency
  FROM public.subcontract_agreements
  WHERE id = NEW.subcontract_agreement_id
    AND organization_id = NEW.organization_id;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: subcontract agreement missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: agreement project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: agreement currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT vendor_id, project_id INTO v_eng_vendor, v_eng_project
  FROM public.vendor_engagements
  WHERE id = NEW.vendor_engagement_id
    AND organization_id = NEW.organization_id;
  IF v_eng_vendor IS NULL THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: vendor engagement missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_eng_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: engagement project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_eng_vendor IS DISTINCT FROM v_vendor THEN
    RAISE EXCEPTION 'boq_subcontractor_schedules: engagement vendor must match agreement vendor'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS boq_sub_schedules_agreement_guard ON public.boq_subcontractor_schedules;
CREATE TRIGGER boq_sub_schedules_agreement_guard
  BEFORE INSERT OR UPDATE OF subcontract_agreement_id, vendor_engagement_id, project_id, currency
  ON public.boq_subcontractor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_schedules_agreement_guard();

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS subcontract_agreement_id uuid;

ALTER TABLE public.ap_bills
  DROP CONSTRAINT IF EXISTS ap_bills_subcontract_org_fk;
ALTER TABLE public.ap_bills
  ADD CONSTRAINT ap_bills_subcontract_org_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id)
  REFERENCES public.subcontract_agreements (id, organization_id)
  ON DELETE SET NULL (subcontract_agreement_id);

CREATE INDEX IF NOT EXISTS ap_bills_subcontract_idx
  ON public.ap_bills (organization_id, subcontract_agreement_id);

CREATE OR REPLACE FUNCTION app.ap_bills_subcontract_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_vendor uuid;
  v_project uuid;
  v_currency char(3);
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM 'draft'
     AND NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement is historical on recognized bills'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.subcontract_agreement_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement requires an exact project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT vendor_id, project_id, currency
    INTO v_vendor, v_project, v_currency
  FROM public.subcontract_agreements
  WHERE id = NEW.subcontract_agreement_id
    AND organization_id = NEW.organization_id;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_vendor IS DISTINCT FROM NEW.vendor_id THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement vendor mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'ap_bills: subcontract agreement currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bills_subcontract_guard ON public.ap_bills;
CREATE TRIGGER ap_bills_subcontract_guard
  BEFORE INSERT OR UPDATE
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_bills_subcontract_guard();

--------------------------------------------------------------------------------
-- Document compensation privacy (employee-sensitive files)
-- Additional AND on existing project-access predicates. Not a replacement.
--------------------------------------------------------------------------------

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS privacy_class text NOT NULL DEFAULT 'standard';

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_privacy_class_known;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_privacy_class_known CHECK (
    privacy_class IN ('standard', 'compensation')
  );

CREATE OR REPLACE FUNCTION app.document_compensation_visible(
  p_organization_id uuid,
  p_privacy_class text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_privacy_class IS DISTINCT FROM 'compensation'
      OR app.has_org_permission(p_organization_id, 'workforce.cost.read');
$$;

REVOKE ALL ON FUNCTION app.document_compensation_visible(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.document_compensation_visible(uuid, text) TO authenticated, service_role;

-- Look up privacy_class without traversing RLS (documents ↔ document_links).
CREATE OR REPLACE FUNCTION app.document_row_compensation_visible(
  p_organization_id uuid,
  p_document_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT app.document_compensation_visible(d.organization_id, d.privacy_class)
      FROM public.documents d
      WHERE d.id = p_document_id
        AND d.organization_id = p_organization_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION app.document_row_compensation_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.document_row_compensation_visible(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.document_version_row_compensation_visible(
  p_organization_id uuid,
  p_version_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT app.document_compensation_visible(d.organization_id, d.privacy_class)
      FROM public.document_versions v
      JOIN public.documents d
        ON d.id = v.document_id AND d.organization_id = v.organization_id
      WHERE v.id = p_version_id
        AND v.organization_id = p_organization_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION app.document_version_row_compensation_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.document_version_row_compensation_visible(uuid, uuid) TO authenticated, service_role;

SELECT app.and_authenticated_policy_predicate(
  'documents',
  $pred$
    app.document_compensation_visible(organization_id, privacy_class)
  $pred$
);

SELECT app.and_authenticated_policy_predicate(
  'document_versions',
  $pred$
    app.document_row_compensation_visible(organization_id, document_id)
  $pred$
);

SELECT app.and_authenticated_policy_predicate(
  'document_links',
  $pred$
    app.document_row_compensation_visible(organization_id, document_id)
  $pred$
);

SELECT app.and_authenticated_policy_predicate(
  'ocr_extraction_jobs',
  $pred$
    (
      document_id IS NULL
      OR app.document_row_compensation_visible(organization_id, document_id)
    )
    AND (
      document_version_id IS NULL
      OR app.document_version_row_compensation_visible(organization_id, document_version_id)
    )
  $pred$
);

--------------------------------------------------------------------------------
-- Saved list views (per-user, not a BI catalog)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.saved_list_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  list_key text NOT NULL,
  name text NOT NULL,
  query_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_list_views_key_known CHECK (
    list_key IN (
      'projects', 'jobs', 'work_orders', 'clients', 'vendors',
      'expenses', 'ap_bills', 'quotes', 'punch', 'inventory'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_list_views_id_org_uq
  ON public.saved_list_views (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_list_views_user_list_name_uq
  ON public.saved_list_views (organization_id, user_id, list_key, name);
CREATE UNIQUE INDEX IF NOT EXISTS saved_list_views_user_list_default_uq
  ON public.saved_list_views (organization_id, user_id, list_key)
  WHERE is_default = true;
CREATE INDEX IF NOT EXISTS saved_list_views_user_list_idx
  ON public.saved_list_views (organization_id, user_id, list_key);

ALTER TABLE public.saved_list_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_list_views FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_list_views_tenant_select ON public.saved_list_views;
CREATE POLICY saved_list_views_tenant_select ON public.saved_list_views
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS saved_list_views_tenant_insert ON public.saved_list_views;
CREATE POLICY saved_list_views_tenant_insert ON public.saved_list_views
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS saved_list_views_tenant_update ON public.saved_list_views;
CREATE POLICY saved_list_views_tenant_update ON public.saved_list_views
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS saved_list_views_tenant_delete ON public.saved_list_views;
CREATE POLICY saved_list_views_tenant_delete ON public.saved_list_views
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS saved_list_views_service_all ON public.saved_list_views;
CREATE POLICY saved_list_views_service_all ON public.saved_list_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- Forms may be owned by an inspection (reuse existing form engine)
--------------------------------------------------------------------------------

ALTER TABLE public.form_submissions
  DROP CONSTRAINT IF EXISTS form_submissions_owner_known;

ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_owner_known CHECK (
    owner_type IN (
      'project', 'job', 'work_order', 'planning_task', 'maintenance', 'field_log', 'inspection'
    )
  );

--------------------------------------------------------------------------------
-- Finalized daily logs: still immutable except append-only corrections
-- and the optional safety-record link (never auto-inserted).
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.daily_logs_finalized_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_old public.daily_logs%ROWTYPE;
  v_new public.daily_logs%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'finalized' AND current_user = 'authenticated' THEN
      RAISE EXCEPTION 'daily_logs: finalized log cannot be deleted'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF NEW.status IS DISTINCT FROM 'finalized' THEN
      RAISE EXCEPTION 'daily_logs: finalized log cannot revert; use a correction'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    v_old := OLD;
    v_new := NEW;
    v_old.updated_at := v_new.updated_at;
    v_old.correction_notes := v_new.correction_notes;
    v_old.linked_safety_record_id := v_new.linked_safety_record_id;
    IF v_new IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'daily_logs: finalized log is locked; append a correction'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.correction_notes IS DISTINCT FROM OLD.correction_notes THEN
      IF OLD.correction_notes IS NOT NULL
         AND (NEW.correction_notes IS NULL
              OR position(OLD.correction_notes IN NEW.correction_notes) <> 1) THEN
        RAISE EXCEPTION 'daily_logs: correction notes are append-only'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

--------------------------------------------------------------------------------
-- Inspection form owners (reuse form_submissions; no second form engine)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.form_owner_same_org(p_org uuid, p_owner_type text, p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_owner_type IN ('project', 'job', 'work_order') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = p_owner_id
        AND pr.organization_id = p_org
        AND (
          (p_owner_type = 'project' AND pr.work_kind = 'project')
          OR (p_owner_type = 'job' AND pr.work_kind = 'job')
          OR (p_owner_type = 'work_order' AND pr.work_kind = 'work_order')
        )
    );
  END IF;
  IF p_owner_type = 'planning_task' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.planning_work_items i
      WHERE i.id = p_owner_id AND i.organization_id = p_org
    );
  END IF;
  IF p_owner_type = 'maintenance' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.maintenance_records m
      WHERE m.id = p_owner_id AND m.organization_id = p_org
    );
  END IF;
  IF p_owner_type = 'field_log' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_owner_id AND d.organization_id = p_org
    );
  END IF;
  IF p_owner_type = 'inspection' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = p_owner_id AND i.organization_id = p_org
    );
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app.form_owner_same_org(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.form_owner_same_org(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.can_access_form_owner(
  p_organization_id uuid,
  p_owner_type text,
  p_owner_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_organization_id IS NULL OR p_owner_type IS NULL OR p_owner_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT app.form_owner_same_org(p_organization_id, p_owner_type, p_owner_id) THEN
    RETURN false;
  END IF;
  IF p_owner_type IN ('project', 'job', 'work_order') THEN
    RETURN app.can_access_project(p_organization_id, p_owner_id);
  END IF;
  IF p_owner_type = 'planning_task' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.planning_work_items i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'maintenance' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.maintenance_records m
      JOIN public.assets a
        ON a.id = m.asset_id AND a.organization_id = m.organization_id
      WHERE m.id = p_owner_id
        AND m.organization_id = p_organization_id
        AND (
          a.assigned_project_id IS NULL
          OR app.can_access_project(p_organization_id, a.assigned_project_id)
        )
    );
  END IF;
  IF p_owner_type = 'field_log' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_owner_id
        AND d.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, d.project_id)
    );
  END IF;
  IF p_owner_type = 'inspection' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_form_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_form_owner(uuid, text, uuid) TO authenticated, service_role;
