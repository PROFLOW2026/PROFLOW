-- 0164: Developer / GC layer - QUALITY INSPECTIONS + DEFECTS / PUNCH LIST (Track MN).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 + 0155 only.
--
-- PURPOSE
--   1. quality_inspection_templates (+ items): custom checklists per organization or per project.
--      The built-in catalog (waterproofing, pre-pour, electrical panel, ...) lives in code and is
--      snapshotted into an inspection when it is created.
--   2. quality_inspections (+ items): one inspection of one location / contractor / work line,
--      checklist results and the current outcome (pass / conditional_pass / fail).
--   3. quality_inspection_outcomes: APPEND-ONLY record of every decided attempt (re-inspections kept).
--   4. defects: punch list items with lifecycle open -> assigned -> completion_submitted ->
--      verification -> closed | reopened (+ cancelled). mode = construction | warranty (Track Q reuse).
--   5. defect_cycle_records: APPEND-ONLY history of every repair cycle (submissions, rejections...).
--   6. Triggers: append-only outcomes / cycle records, defect state machine, contractor column guard.
--   7. app.quality_project_contractors: operational contractor directory (ids + names, no money).
--   8. RLS: project.view reads, quality.manage / defects.manage / progress.verify writes,
--      contractors read their own items (ext.inspection.view / ext.defect.work) and may only
--      submit defect completion.
--
-- RELATION TO EXISTING TABLES: public.inspections / public.punch_list_items (field-ops) stay untouched.
-- They are internal self-perform records keyed by employees with org-permission RLS; this layer needs
-- contractor scoping, project capabilities, immutable cycles and external access, so it is additive.
--
-- COMPATIBILITY: additive only (new tables, functions, triggers, policies).

--------------------------------------------------------------------------------
-- 1. Templates
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quality_inspection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quality_inspection_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT quality_inspection_templates_category_shape CHECK (category ~ '^[a-z][a-z0-9_]*$')
);

ALTER TABLE public.quality_inspection_templates
  DROP CONSTRAINT IF EXISTS quality_inspection_templates_project_org_fk;
ALTER TABLE public.quality_inspection_templates
  ADD CONSTRAINT quality_inspection_templates_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS quality_inspection_templates_id_organization_id_uq
  ON public.quality_inspection_templates (id, organization_id);
CREATE INDEX IF NOT EXISTS quality_inspection_templates_scope_idx
  ON public.quality_inspection_templates (organization_id, project_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.quality_inspection_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  guidance text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quality_inspection_template_items_label_not_blank CHECK (length(btrim(label)) > 0)
);

ALTER TABLE public.quality_inspection_template_items
  DROP CONSTRAINT IF EXISTS quality_inspection_template_items_template_fk;
ALTER TABLE public.quality_inspection_template_items
  ADD CONSTRAINT quality_inspection_template_items_template_fk
  FOREIGN KEY (template_id, organization_id)
  REFERENCES public.quality_inspection_templates (id, organization_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS quality_inspection_template_items_template_idx
  ON public.quality_inspection_template_items (organization_id, template_id, sort_order);

--------------------------------------------------------------------------------
-- 2. Inspections + checklist items
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quality_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  reference_no integer NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  template_key text,
  template_id uuid,
  status text NOT NULL DEFAULT 'scheduled',
  outcome text,
  attempt_no integer NOT NULL DEFAULT 0,
  location_id uuid,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  work_line_id uuid,
  work_package_id uuid,
  milestone_id uuid,
  scheduled_for date,
  inspector_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  summary text,
  conditions text,
  contractor_visible boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quality_inspections_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT quality_inspections_category_shape CHECK (category ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT quality_inspections_template_key_shape
    CHECK (template_key IS NULL OR template_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT quality_inspections_status_known
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT quality_inspections_outcome_known
    CHECK (outcome IS NULL OR outcome IN ('pass', 'conditional_pass', 'fail')),
  CONSTRAINT quality_inspections_completed_has_outcome
    CHECK (status <> 'completed' OR (outcome IS NOT NULL AND completed_at IS NOT NULL)),
  CONSTRAINT quality_inspections_attempt_non_negative CHECK (attempt_no >= 0),
  CONSTRAINT quality_inspections_reference_positive CHECK (reference_no > 0),
  CONSTRAINT quality_inspections_agreement_needs_vendor
    CHECK (subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL),
  CONSTRAINT quality_inspections_work_line_needs_agreement
    CHECK (work_line_id IS NULL OR subcontract_agreement_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS quality_inspections_id_organization_id_uq
  ON public.quality_inspections (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS quality_inspections_id_org_project_uq
  ON public.quality_inspections (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS quality_inspections_reference_uq
  ON public.quality_inspections (organization_id, project_id, reference_no);
CREATE INDEX IF NOT EXISTS quality_inspections_project_status_idx
  ON public.quality_inspections (organization_id, project_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS quality_inspections_vendor_idx
  ON public.quality_inspections (organization_id, vendor_id, project_id)
  WHERE vendor_id IS NOT NULL;

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_project_org_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_template_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_template_fk
  FOREIGN KEY (template_id, organization_id)
  REFERENCES public.quality_inspection_templates (id, organization_id) ON DELETE SET NULL (template_id);

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_location_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_vendor_org_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_agreement_project_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE SET NULL (subcontract_agreement_id);

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_agreement_vendor_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE SET NULL (subcontract_agreement_id);

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_work_line_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_work_line_fk
  FOREIGN KEY (work_line_id, organization_id, subcontract_agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE SET NULL (work_line_id);

ALTER TABLE public.quality_inspections DROP CONSTRAINT IF EXISTS quality_inspections_work_package_fk;
ALTER TABLE public.quality_inspections
  ADD CONSTRAINT quality_inspections_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id)
  ON DELETE SET NULL (work_package_id);

CREATE TABLE IF NOT EXISTS public.quality_inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  item_key text,
  label text NOT NULL,
  guidance text,
  is_required boolean NOT NULL DEFAULT true,
  result text NOT NULL DEFAULT 'pending',
  note text,
  checked_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quality_inspection_items_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT quality_inspection_items_item_key_shape
    CHECK (item_key IS NULL OR item_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT quality_inspection_items_result_known
    CHECK (result IN ('pending', 'pass', 'fail', 'na'))
);

ALTER TABLE public.quality_inspection_items DROP CONSTRAINT IF EXISTS quality_inspection_items_inspection_fk;
ALTER TABLE public.quality_inspection_items
  ADD CONSTRAINT quality_inspection_items_inspection_fk
  FOREIGN KEY (inspection_id, organization_id)
  REFERENCES public.quality_inspections (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS quality_inspection_items_id_organization_id_uq
  ON public.quality_inspection_items (id, organization_id);
CREATE INDEX IF NOT EXISTS quality_inspection_items_inspection_idx
  ON public.quality_inspection_items (organization_id, inspection_id, sort_order);

--------------------------------------------------------------------------------
-- 3. Inspection outcomes (append-only; one row per decided attempt)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quality_inspection_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  inspection_id uuid NOT NULL,
  attempt_no integer NOT NULL,
  outcome text NOT NULL,
  summary text,
  conditions text,
  pass_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  na_count integer NOT NULL DEFAULT 0,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quality_inspection_outcomes_outcome_known
    CHECK (outcome IN ('pass', 'conditional_pass', 'fail')),
  CONSTRAINT quality_inspection_outcomes_attempt_positive CHECK (attempt_no > 0),
  CONSTRAINT quality_inspection_outcomes_counts_non_negative
    CHECK (pass_count >= 0 AND fail_count >= 0 AND na_count >= 0),
  CONSTRAINT quality_inspection_outcomes_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.quality_inspection_outcomes DROP CONSTRAINT IF EXISTS quality_inspection_outcomes_inspection_fk;
ALTER TABLE public.quality_inspection_outcomes
  ADD CONSTRAINT quality_inspection_outcomes_inspection_fk
  FOREIGN KEY (inspection_id, organization_id, project_id)
  REFERENCES public.quality_inspections (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS quality_inspection_outcomes_attempt_uq
  ON public.quality_inspection_outcomes (inspection_id, attempt_no);
CREATE INDEX IF NOT EXISTS quality_inspection_outcomes_inspection_idx
  ON public.quality_inspection_outcomes (organization_id, inspection_id, attempt_no);

--------------------------------------------------------------------------------
-- 4. Defects / punch list
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  reference_no integer NOT NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  category text,
  status text NOT NULL DEFAULT 'open',
  mode text NOT NULL DEFAULT 'construction',
  location_id uuid,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  work_line_id uuid,
  assignee_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  inspector_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_date date,
  source_inspection_id uuid,
  source_inspection_item_id uuid,
  warranty_source_type text,
  warranty_source_id uuid,
  cycle_no integer NOT NULL DEFAULT 1,
  contractor_visible boolean NOT NULL DEFAULT true,
  last_submitted_at timestamptz,
  closed_at timestamptz,
  created_actor_type text NOT NULL DEFAULT 'internal',
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT defects_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT defects_severity_known CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT defects_status_known CHECK (status IN (
    'open', 'assigned', 'completion_submitted', 'verification', 'closed', 'reopened', 'cancelled'
  )),
  CONSTRAINT defects_mode_known CHECK (mode IN ('construction', 'warranty')),
  CONSTRAINT defects_category_shape CHECK (category IS NULL OR category ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT defects_reference_positive CHECK (reference_no > 0),
  CONSTRAINT defects_cycle_positive CHECK (cycle_no > 0),
  CONSTRAINT defects_agreement_needs_vendor
    CHECK (subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL),
  CONSTRAINT defects_work_line_needs_agreement
    CHECK (work_line_id IS NULL OR subcontract_agreement_id IS NOT NULL),
  CONSTRAINT defects_assigned_has_responsible CHECK (
    status IN ('open', 'cancelled') OR vendor_id IS NOT NULL OR assignee_user_id IS NOT NULL
  ),
  CONSTRAINT defects_closed_has_timestamp CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CONSTRAINT defects_warranty_source_shape CHECK (
    (warranty_source_type IS NULL AND warranty_source_id IS NULL)
    OR (warranty_source_type ~ '^[a-z][a-z0-9_]*$' AND warranty_source_id IS NOT NULL)
  ),
  CONSTRAINT defects_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_principal_id IS NOT NULL AND created_by_user_id IS NULL)
    OR (created_actor_type = 'system' AND created_by_user_id IS NULL AND created_by_principal_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS defects_id_organization_id_uq
  ON public.defects (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS defects_id_org_project_uq
  ON public.defects (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS defects_reference_uq
  ON public.defects (organization_id, project_id, reference_no);
CREATE INDEX IF NOT EXISTS defects_project_status_idx
  ON public.defects (organization_id, project_id, status, due_date)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS defects_vendor_idx
  ON public.defects (organization_id, vendor_id, project_id, status)
  WHERE vendor_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS defects_awaiting_verification_idx
  ON public.defects (organization_id, last_submitted_at)
  WHERE status IN ('completion_submitted', 'verification') AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS defects_source_inspection_idx
  ON public.defects (organization_id, source_inspection_id)
  WHERE source_inspection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS defects_warranty_source_idx
  ON public.defects (organization_id, warranty_source_type, warranty_source_id)
  WHERE warranty_source_id IS NOT NULL;

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_project_org_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_location_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_vendor_org_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_agreement_project_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE SET NULL (subcontract_agreement_id);

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_agreement_vendor_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE SET NULL (subcontract_agreement_id);

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_work_line_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_work_line_fk
  FOREIGN KEY (work_line_id, organization_id, subcontract_agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE SET NULL (work_line_id);

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_source_inspection_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_source_inspection_fk
  FOREIGN KEY (source_inspection_id, organization_id, project_id)
  REFERENCES public.quality_inspections (id, organization_id, project_id)
  ON DELETE SET NULL (source_inspection_id);

ALTER TABLE public.defects DROP CONSTRAINT IF EXISTS defects_source_item_fk;
ALTER TABLE public.defects
  ADD CONSTRAINT defects_source_item_fk
  FOREIGN KEY (source_inspection_item_id, organization_id)
  REFERENCES public.quality_inspection_items (id, organization_id)
  ON DELETE SET NULL (source_inspection_item_id);

--------------------------------------------------------------------------------
-- 5. Defect cycle records (append-only history of every repair cycle)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.defect_cycle_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  defect_id uuid NOT NULL,
  cycle_no integer NOT NULL,
  kind text NOT NULL,
  from_status text,
  to_status text,
  note text,
  internal_only boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT defect_cycle_records_kind_known CHECK (kind IN (
    'opened', 'assigned', 'completion_submitted', 'verification_started', 'accepted', 'rejected',
    'reopened', 'cancelled', 'updated', 'note'
  )),
  CONSTRAINT defect_cycle_records_cycle_positive CHECK (cycle_no > 0),
  CONSTRAINT defect_cycle_records_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.defect_cycle_records DROP CONSTRAINT IF EXISTS defect_cycle_records_defect_fk;
ALTER TABLE public.defect_cycle_records
  ADD CONSTRAINT defect_cycle_records_defect_fk
  FOREIGN KEY (defect_id, organization_id, project_id)
  REFERENCES public.defects (id, organization_id, project_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS defect_cycle_records_defect_idx
  ON public.defect_cycle_records (organization_id, defect_id, created_at);

--------------------------------------------------------------------------------
-- 6. Triggers: immutability, defect state machine, external column guard
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.quality_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS quality_inspection_outcomes_append_only ON public.quality_inspection_outcomes;
CREATE TRIGGER quality_inspection_outcomes_append_only
  BEFORE UPDATE OR DELETE ON public.quality_inspection_outcomes
  FOR EACH ROW EXECUTE FUNCTION app.quality_append_only();

DROP TRIGGER IF EXISTS defect_cycle_records_append_only ON public.defect_cycle_records;
CREATE TRIGGER defect_cycle_records_append_only
  BEFORE UPDATE OR DELETE ON public.defect_cycle_records
  FOR EACH ROW EXECUTE FUNCTION app.quality_append_only();

-- Mirror of src/modules/defects/domain/lifecycle.ts (DEFECT_TRANSITIONS).
CREATE OR REPLACE FUNCTION app.defects_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN
    RAISE EXCEPTION 'defect identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.cycle_no < OLD.cycle_no OR NEW.cycle_no > OLD.cycle_no + 1 THEN
    RAISE EXCEPTION 'defect cycle may only advance by one' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'open' AND NEW.status IN ('assigned', 'cancelled'))
    OR (OLD.status = 'assigned' AND NEW.status IN ('completion_submitted', 'cancelled'))
    OR (OLD.status = 'completion_submitted' AND NEW.status IN ('verification', 'closed', 'reopened'))
    OR (OLD.status = 'verification' AND NEW.status IN ('closed', 'reopened'))
    OR (OLD.status = 'reopened' AND NEW.status IN ('assigned', 'completion_submitted', 'cancelled'))
    OR (OLD.status = 'closed' AND NEW.status = 'reopened')
  ) THEN
    RAISE EXCEPTION 'defect transition % -> % is not allowed', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS defects_transition_guard ON public.defects;
CREATE TRIGGER defects_transition_guard
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION app.defects_transition_guard();

-- External principals (contractors) may only submit completion: status assigned|reopened ->
-- completion_submitted plus the submission timestamp. Every other column stays untouched.
CREATE OR REPLACE FUNCTION app.defects_external_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_allowed text[] := ARRAY['status', 'last_submitted_at', 'updated_at'];
BEGIN
  IF current_user = 'authenticated' AND NOT app.is_org_member(NEW.organization_id) THEN
    IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
      RAISE EXCEPTION 'contractors may only submit defect completion' USING ERRCODE = '42501';
    END IF;
    IF NOT (OLD.status IN ('assigned', 'reopened') AND NEW.status = 'completion_submitted') THEN
      RAISE EXCEPTION 'contractors may only submit defect completion' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS defects_external_update_guard ON public.defects;
CREATE TRIGGER defects_external_update_guard
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION app.defects_external_update_guard();

--------------------------------------------------------------------------------
-- 7. Operational contractor directory for quality users (no money)
--    subcontract_agreements / vendors are readable only with org permission vendors.read and
--    agreements carry contract values. Quality users need just "which contractors work on this
--    project" to scope inspections and defects, so this definer function returns ids + names
--    for callers holding contractor.view / quality.manage / defects.manage on the project.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.quality_project_contractors(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS TABLE (
  agreement_id uuid,
  vendor_id uuid,
  vendor_name text,
  agreement_title text,
  agreement_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id, a.vendor_id, v.name, a.title, a.status
  FROM public.subcontract_agreements a
  JOIN public.vendors v ON v.id = a.vendor_id AND v.organization_id = a.organization_id
  WHERE a.organization_id = p_organization_id
    AND a.project_id = p_project_id
    AND a.archived_at IS NULL
    AND (
      app.has_project_capability(p_organization_id, p_project_id, 'contractor.view')
      OR app.has_project_capability(p_organization_id, p_project_id, 'quality.manage')
      OR app.has_project_capability(p_organization_id, p_project_id, 'defects.manage')
    )
  ORDER BY v.name, a.title
$fn$;

REVOKE ALL ON FUNCTION app.quality_project_contractors(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.quality_project_contractors(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 8. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.quality_inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_template_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspection_outcomes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.defect_cycle_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_cycle_records FORCE ROW LEVEL SECURITY;

-- Templates: org-wide ones are managed by project_team.admin; project ones by quality.manage.
DROP POLICY IF EXISTS quality_inspection_templates_select ON public.quality_inspection_templates;
CREATE POLICY quality_inspection_templates_select ON public.quality_inspection_templates
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND (project_id IS NULL OR app.has_project_capability(organization_id, project_id, 'project.view')));
DROP POLICY IF EXISTS quality_inspection_templates_write ON public.quality_inspection_templates;
CREATE POLICY quality_inspection_templates_write ON public.quality_inspection_templates
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND (
    (project_id IS NULL AND app.has_org_permission(organization_id, 'project_team.admin'))
    OR (project_id IS NOT NULL AND app.has_project_capability(organization_id, project_id, 'quality.manage'))))
  WITH CHECK (app.is_org_member(organization_id) AND (
    (project_id IS NULL AND app.has_org_permission(organization_id, 'project_team.admin'))
    OR (project_id IS NOT NULL AND app.has_project_capability(organization_id, project_id, 'quality.manage'))));
DROP POLICY IF EXISTS quality_inspection_templates_service_all ON public.quality_inspection_templates;
CREATE POLICY quality_inspection_templates_service_all ON public.quality_inspection_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS quality_inspection_template_items_select ON public.quality_inspection_template_items;
CREATE POLICY quality_inspection_template_items_select ON public.quality_inspection_template_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quality_inspection_templates t
    WHERE t.id = quality_inspection_template_items.template_id
      AND t.organization_id = quality_inspection_template_items.organization_id
      AND app.is_org_member(t.organization_id)
      AND (t.project_id IS NULL OR app.has_project_capability(t.organization_id, t.project_id, 'project.view'))));
DROP POLICY IF EXISTS quality_inspection_template_items_write ON public.quality_inspection_template_items;
CREATE POLICY quality_inspection_template_items_write ON public.quality_inspection_template_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quality_inspection_templates t
    WHERE t.id = quality_inspection_template_items.template_id
      AND t.organization_id = quality_inspection_template_items.organization_id
      AND app.is_org_member(t.organization_id) AND (
        (t.project_id IS NULL AND app.has_org_permission(t.organization_id, 'project_team.admin'))
        OR (t.project_id IS NOT NULL AND app.has_project_capability(t.organization_id, t.project_id, 'quality.manage')))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quality_inspection_templates t
    WHERE t.id = quality_inspection_template_items.template_id
      AND t.organization_id = quality_inspection_template_items.organization_id
      AND app.is_org_member(t.organization_id) AND (
        (t.project_id IS NULL AND app.has_org_permission(t.organization_id, 'project_team.admin'))
        OR (t.project_id IS NOT NULL AND app.has_project_capability(t.organization_id, t.project_id, 'quality.manage')))));
DROP POLICY IF EXISTS quality_inspection_template_items_service_all ON public.quality_inspection_template_items;
CREATE POLICY quality_inspection_template_items_service_all ON public.quality_inspection_template_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Inspections: project.view reads, quality.manage writes; contractors read their own
-- (contractor_visible) inspections with ext.inspection.view.
DROP POLICY IF EXISTS quality_inspections_select ON public.quality_inspections;
CREATE POLICY quality_inspections_select ON public.quality_inspections
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR (contractor_visible AND archived_at IS NULL AND status <> 'cancelled'
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.inspection.view'))
  );
DROP POLICY IF EXISTS quality_inspections_insert ON public.quality_inspections;
CREATE POLICY quality_inspections_insert ON public.quality_inspections
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'quality.manage'));
DROP POLICY IF EXISTS quality_inspections_update ON public.quality_inspections;
CREATE POLICY quality_inspections_update ON public.quality_inspections
  FOR UPDATE TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'quality.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'quality.manage'));
DROP POLICY IF EXISTS quality_inspections_service_all ON public.quality_inspections;
CREATE POLICY quality_inspections_service_all ON public.quality_inspections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS quality_inspection_items_select ON public.quality_inspection_items;
CREATE POLICY quality_inspection_items_select ON public.quality_inspection_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quality_inspections i
    WHERE i.id = quality_inspection_items.inspection_id
      AND i.organization_id = quality_inspection_items.organization_id
      AND (
        app.has_project_capability(i.organization_id, i.project_id, 'project.view')
        OR (i.contractor_visible AND i.archived_at IS NULL AND i.status <> 'cancelled'
          AND app.external_has_scope(i.organization_id, i.project_id, i.vendor_id,
            i.subcontract_agreement_id, 'ext.inspection.view'))
      )));
DROP POLICY IF EXISTS quality_inspection_items_write ON public.quality_inspection_items;
CREATE POLICY quality_inspection_items_write ON public.quality_inspection_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quality_inspections i
    WHERE i.id = quality_inspection_items.inspection_id
      AND i.organization_id = quality_inspection_items.organization_id
      AND app.has_project_capability(i.organization_id, i.project_id, 'quality.manage')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quality_inspections i
    WHERE i.id = quality_inspection_items.inspection_id
      AND i.organization_id = quality_inspection_items.organization_id
      AND app.has_project_capability(i.organization_id, i.project_id, 'quality.manage')));
DROP POLICY IF EXISTS quality_inspection_items_service_all ON public.quality_inspection_items;
CREATE POLICY quality_inspection_items_service_all ON public.quality_inspection_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS quality_inspection_outcomes_select ON public.quality_inspection_outcomes;
CREATE POLICY quality_inspection_outcomes_select ON public.quality_inspection_outcomes
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR EXISTS (
      SELECT 1 FROM public.quality_inspections i
      WHERE i.id = quality_inspection_outcomes.inspection_id
        AND i.organization_id = quality_inspection_outcomes.organization_id
        AND i.contractor_visible AND i.archived_at IS NULL AND i.status <> 'cancelled'
        AND app.external_has_scope(i.organization_id, i.project_id, i.vendor_id,
          i.subcontract_agreement_id, 'ext.inspection.view'))
  );
DROP POLICY IF EXISTS quality_inspection_outcomes_insert ON public.quality_inspection_outcomes;
CREATE POLICY quality_inspection_outcomes_insert ON public.quality_inspection_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'internal' AND actor_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'quality.manage'));
DROP POLICY IF EXISTS quality_inspection_outcomes_service_all ON public.quality_inspection_outcomes;
CREATE POLICY quality_inspection_outcomes_service_all ON public.quality_inspection_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Defects: project.view reads; defects.manage / quality.manage create; defects.manage /
-- progress.verify update; contractors read and submit completion with ext.defect.work.
DROP POLICY IF EXISTS defects_select ON public.defects;
CREATE POLICY defects_select ON public.defects
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR (contractor_visible AND archived_at IS NULL AND status <> 'cancelled'
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.defect.work'))
  );
DROP POLICY IF EXISTS defects_insert ON public.defects;
CREATE POLICY defects_insert ON public.defects
  FOR INSERT TO authenticated
  WITH CHECK (created_actor_type = 'internal' AND created_by_user_id = app.current_user_id()
    AND (app.has_project_capability(organization_id, project_id, 'defects.manage')
      OR app.has_project_capability(organization_id, project_id, 'quality.manage')));
DROP POLICY IF EXISTS defects_update_internal ON public.defects;
CREATE POLICY defects_update_internal ON public.defects
  FOR UPDATE TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'defects.manage')
    OR app.has_project_capability(organization_id, project_id, 'progress.verify'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'defects.manage')
    OR app.has_project_capability(organization_id, project_id, 'progress.verify'));
DROP POLICY IF EXISTS defects_update_external ON public.defects;
CREATE POLICY defects_update_external ON public.defects
  FOR UPDATE TO authenticated
  USING (contractor_visible AND archived_at IS NULL AND status IN ('assigned', 'reopened')
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.defect.work'))
  WITH CHECK (contractor_visible AND status = 'completion_submitted'
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.defect.work'));
DROP POLICY IF EXISTS defects_service_all ON public.defects;
CREATE POLICY defects_service_all ON public.defects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS defect_cycle_records_select ON public.defect_cycle_records;
CREATE POLICY defect_cycle_records_select ON public.defect_cycle_records
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR (NOT internal_only AND EXISTS (
      SELECT 1 FROM public.defects d
      WHERE d.id = defect_cycle_records.defect_id
        AND d.organization_id = defect_cycle_records.organization_id
        AND d.contractor_visible AND d.archived_at IS NULL AND d.status <> 'cancelled'
        AND app.external_has_scope(d.organization_id, d.project_id, d.vendor_id,
          d.subcontract_agreement_id, 'ext.defect.work')))
  );
DROP POLICY IF EXISTS defect_cycle_records_insert_internal ON public.defect_cycle_records;
CREATE POLICY defect_cycle_records_insert_internal ON public.defect_cycle_records
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'internal' AND actor_user_id = app.current_user_id()
    AND (app.has_project_capability(organization_id, project_id, 'defects.manage')
      OR app.has_project_capability(organization_id, project_id, 'quality.manage')
      OR app.has_project_capability(organization_id, project_id, 'progress.verify')));
DROP POLICY IF EXISTS defect_cycle_records_insert_external ON public.defect_cycle_records;
CREATE POLICY defect_cycle_records_insert_external ON public.defect_cycle_records
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
    AND kind = 'completion_submitted' AND NOT internal_only
    AND EXISTS (
      SELECT 1 FROM public.defects d
      WHERE d.id = defect_cycle_records.defect_id
        AND d.organization_id = defect_cycle_records.organization_id
        AND d.cycle_no = defect_cycle_records.cycle_no
        AND d.contractor_visible
        AND app.external_has_scope(d.organization_id, d.project_id, d.vendor_id,
          d.subcontract_agreement_id, 'ext.defect.work')));
DROP POLICY IF EXISTS defect_cycle_records_service_all ON public.defect_cycle_records;
CREATE POLICY defect_cycle_records_service_all ON public.defect_cycle_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_inspection_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_inspection_template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quality_inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_inspection_items TO authenticated;
GRANT SELECT, INSERT ON public.quality_inspection_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.defects TO authenticated;
GRANT SELECT, INSERT ON public.defect_cycle_records TO authenticated;
GRANT ALL PRIVILEGES ON public.quality_inspection_templates TO service_role;
GRANT ALL PRIVILEGES ON public.quality_inspection_template_items TO service_role;
GRANT ALL PRIVILEGES ON public.quality_inspections TO service_role;
GRANT ALL PRIVILEGES ON public.quality_inspection_items TO service_role;
GRANT ALL PRIVILEGES ON public.quality_inspection_outcomes TO service_role;
GRANT ALL PRIVILEGES ON public.defects TO service_role;
GRANT ALL PRIVILEGES ON public.defect_cycle_records TO service_role;
