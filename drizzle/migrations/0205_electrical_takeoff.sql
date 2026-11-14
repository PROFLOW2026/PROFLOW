-- 0205_electrical_takeoff.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
-- Electrical smart takeoff (כתב כמויות חכם לחשמל): analyses, files, jobs, worker output, edits, approvals.
--
-- DATA MUTATION: permission catalog rows (takeoff.*) + owner/manager role grants only; no business data.
-- SCHEMA MUTATION: new takeoff_* tables, indexes, triggers, RLS policies, grants.
-- Additive only.

--------------------------------------------------------------------------------
-- 0. Permissions (org catalog; employees/contractors need explicit grant)
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('takeoff.view', 'commercial', 'View electrical takeoff analyses and results'),
  ('takeoff.manage', 'commercial', 'Run analyses and edit takeoff detections'),
  ('takeoff.approve', 'commercial', 'Approve takeoff bill of quantities'),
  ('takeoff.library.manage', 'commercial', 'Manage planner symbol library entries')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'takeoff.view'),
    ('owner', 'takeoff.manage'),
    ('owner', 'takeoff.approve'),
    ('owner', 'takeoff.library.manage'),
    ('manager', 'takeoff.view'),
    ('manager', 'takeoff.manage'),
    ('manager', 'takeoff.approve'),
    ('manager', 'takeoff.library.manage')
) AS p(role_key, permission_key)
WHERE r.key = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- Contractor grant scopes: whitelist sync (includes ext.takeoff.*)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.external_scopes_valid(p_scopes jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_typeof(p_scopes) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_scopes) AS scope
      WHERE scope NOT IN (
        'ext.project.view',
        'ext.schedule.view',
        'ext.event.respond',
        'ext.task.work',
        'ext.task.report',
        'ext.thread.post',
        'ext.document.view',
        'ext.document.upload',
        'ext.plan.view',
        'ext.plan.acknowledge',
        'ext.takeoff.view',
        'ext.takeoff.manage',
        'ext.takeoff.approve',
        'ext.takeoff.library.manage',
        'ext.folder.quotes',
        'ext.folder.contracts',
        'ext.folder.billing',
        'ext.folder.vendor_invoices',
        'ext.folder.photos',
        'ext.folder.documents',
        'ext.folder.general_files',
        'ext.rfi.view',
        'ext.rfi.raise',
        'ext.submittal.submit',
        'ext.inspection.view',
        'ext.defect.work',
        'ext.daily_log.submit',
        'ext.delivery.report',
        'ext.safety.report',
        'ext.site_instruction.ack',
        'ext.contract.view_value',
        'ext.change.request',
        'ext.claim.view',
        'ext.claim.submit',
        'ext.payment.view',
        'ext.compliance.submit',
        'ext.handover.submit',
        'ext.bid.submit'
      )
    )
$fn$;

--------------------------------------------------------------------------------
-- Helper: append-only guard (detections, approvals)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.takeoff_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

CREATE OR REPLACE FUNCTION app.takeoff_analyses_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.created_at, NEW.created_by_actor_type)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.created_at, OLD.created_by_actor_type) THEN
    RAISE EXCEPTION 'takeoff_analyses: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'takeoff_analyses: revision cannot decrease' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.takeoff_block_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.takeoff_analyses_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 1. takeoff_analyses
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  planner_key text NOT NULL DEFAULT 'unknown',
  revision integer NOT NULL DEFAULT 0,
  rule_set_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_actor_type text NOT NULL DEFAULT 'internal',
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  vendor_id uuid,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  current_approval_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_analyses_status_known CHECK (status IN ('draft', 'processing', 'in_review', 'approved')),
  CONSTRAINT takeoff_analyses_actor_known CHECK (created_by_actor_type IN ('internal', 'external'))
);

ALTER TABLE public.takeoff_analyses
  ADD CONSTRAINT takeoff_analyses_project_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_analyses_id_organization_id_project_id_uq
  ON public.takeoff_analyses (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS takeoff_analyses_project_idx
  ON public.takeoff_analyses (organization_id, project_id, updated_at DESC);

DROP TRIGGER IF EXISTS takeoff_analyses_guard ON public.takeoff_analyses;
CREATE TRIGGER takeoff_analyses_guard
  BEFORE UPDATE ON public.takeoff_analyses
  FOR EACH ROW EXECUTE FUNCTION app.takeoff_analyses_guard();

--------------------------------------------------------------------------------
-- 2. takeoff_rule_sets (before analyses.rule_set_id FK)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  analysis_id uuid,
  name text NOT NULL,
  scope text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_rule_sets_scope_known CHECK (scope IN ('default', 'organization', 'project', 'analysis'))
);

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_rule_sets_id_organization_id_uq
  ON public.takeoff_rule_sets (id, organization_id);

ALTER TABLE public.takeoff_analyses
  ADD CONSTRAINT takeoff_analyses_rule_set_fk
  FOREIGN KEY (rule_set_id, organization_id)
  REFERENCES public.takeoff_rule_sets (id, organization_id) ON DELETE SET NULL (rule_set_id);

--------------------------------------------------------------------------------
-- 3. takeoff_files
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  mime_type text,
  size_bytes integer NOT NULL,
  sha256 text,
  evidence_id uuid,
  storage_document_id uuid,
  upload_state text NOT NULL DEFAULT 'pending',
  uploaded_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  uploaded_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_files_kind_known CHECK (kind IN ('pdf', 'dwg', 'dxf')),
  CONSTRAINT takeoff_files_upload_state_known CHECK (upload_state IN ('pending', 'uploading', 'complete', 'failed'))
);

ALTER TABLE public.takeoff_files
  ADD CONSTRAINT takeoff_files_analysis_fk
  FOREIGN KEY (analysis_id, organization_id, project_id)
  REFERENCES public.takeoff_analyses (id, organization_id, project_id) ON DELETE CASCADE;

ALTER TABLE public.takeoff_files
  ADD CONSTRAINT takeoff_files_project_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_files_id_organization_id_project_id_uq
  ON public.takeoff_files (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS takeoff_files_analysis_idx
  ON public.takeoff_files (organization_id, project_id, analysis_id);

--------------------------------------------------------------------------------
-- 4. takeoff_jobs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  percent integer NOT NULL DEFAULT 0,
  message text,
  request_json jsonb,
  request_hash text,
  token_hash text,
  token_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  worker_job_id text,
  attempts integer NOT NULL DEFAULT 0,
  result_ingested_at timestamptz,
  result_stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_jobs_status_known CHECK (
    status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')
  )
);

ALTER TABLE public.takeoff_jobs
  ADD CONSTRAINT takeoff_jobs_analysis_fk
  FOREIGN KEY (analysis_id, organization_id, project_id)
  REFERENCES public.takeoff_analyses (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_jobs_id_organization_id_project_id_uq
  ON public.takeoff_jobs (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS takeoff_jobs_analysis_idx
  ON public.takeoff_jobs (organization_id, project_id, analysis_id, created_at DESC);

--------------------------------------------------------------------------------
-- 5. Worker output tables (immutable per job)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  sheet_key text NOT NULL,
  file_id uuid NOT NULL,
  payload jsonb NOT NULL,
  floor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_sheets
  ADD CONSTRAINT takeoff_sheets_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_sheets_job_sheet_uq ON public.takeoff_sheets (job_id, sheet_key);

CREATE TABLE IF NOT EXISTS public.takeoff_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  detection_key text NOT NULL,
  sheet_key text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_detections
  ADD CONSTRAINT takeoff_detections_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_detections_job_key_uq ON public.takeoff_detections (job_id, detection_key);

DROP TRIGGER IF EXISTS takeoff_detections_block_update ON public.takeoff_detections;
CREATE TRIGGER takeoff_detections_block_update
  BEFORE UPDATE OR DELETE ON public.takeoff_detections
  FOR EACH ROW EXECUTE FUNCTION app.takeoff_block_update();

CREATE TABLE IF NOT EXISTS public.takeoff_legend_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  entry_key text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_legend_entries
  ADD CONSTRAINT takeoff_legend_entries_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_legend_entries_job_key_uq ON public.takeoff_legend_entries (job_id, entry_key);

CREATE TABLE IF NOT EXISTS public.takeoff_linear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  linear_key text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_linear
  ADD CONSTRAINT takeoff_linear_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_linear_job_key_uq ON public.takeoff_linear (job_id, linear_key);

CREATE TABLE IF NOT EXISTS public.takeoff_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  code text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_warnings
  ADD CONSTRAINT takeoff_warnings_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.takeoff_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  evidence_id uuid,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_artifacts
  ADD CONSTRAINT takeoff_artifacts_job_fk
  FOREIGN KEY (job_id, organization_id, project_id)
  REFERENCES public.takeoff_jobs (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_artifacts_job_name_uq ON public.takeoff_artifacts (job_id, name);

--------------------------------------------------------------------------------
-- 6. User edits + areas
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  seq integer NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  op jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_edits_actor_known CHECK (actor_type IN ('internal', 'external'))
);

ALTER TABLE public.takeoff_edits
  ADD CONSTRAINT takeoff_edits_analysis_fk
  FOREIGN KEY (analysis_id, organization_id, project_id)
  REFERENCES public.takeoff_analyses (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_edits_analysis_seq_uq ON public.takeoff_edits (analysis_id, seq);

DROP TRIGGER IF EXISTS takeoff_edits_block_update ON public.takeoff_edits;
CREATE TRIGGER takeoff_edits_block_update
  BEFORE UPDATE OR DELETE ON public.takeoff_edits
  FOR EACH ROW EXECUTE FUNCTION app.takeoff_block_update();

CREATE TABLE IF NOT EXISTS public.takeoff_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  sheet_key text NOT NULL,
  name text NOT NULL,
  polygon jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_areas
  ADD CONSTRAINT takeoff_areas_analysis_fk
  FOREIGN KEY (analysis_id, organization_id, project_id)
  REFERENCES public.takeoff_analyses (id, organization_id, project_id) ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- 7. Library, catalog, approvals
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.takeoff_planner_symbol_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  planner_key text NOT NULL,
  signature_kind text NOT NULL,
  signature text NOT NULL,
  template jsonb,
  type_key text NOT NULL,
  label text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_planner_signature_kind_known CHECK (signature_kind IN ('pdf-shape', 'dwg-block', 'legend-key'))
);

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_planner_symbol_library_uq
  ON public.takeoff_planner_symbol_library (organization_id, planner_key, signature_kind, signature);

CREATE TABLE IF NOT EXISTS public.takeoff_catalog_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  key text NOT NULL,
  payload jsonb NOT NULL,
  built_in boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_catalog_types_org_key_uq
  ON public.takeoff_catalog_types (organization_id, key);

CREATE TABLE IF NOT EXISTS public.takeoff_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  boq_json jsonb NOT NULL,
  detections_hash text NOT NULL,
  file_versions_json jsonb NOT NULL,
  rule_set_version integer NOT NULL,
  approved_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS takeoff_approvals_id_organization_id_uq
  ON public.takeoff_approvals (id, organization_id);

ALTER TABLE public.takeoff_approvals
  ADD CONSTRAINT takeoff_approvals_analysis_fk
  FOREIGN KEY (analysis_id, organization_id, project_id)
  REFERENCES public.takeoff_analyses (id, organization_id, project_id) ON DELETE CASCADE;

ALTER TABLE public.takeoff_analyses
  ADD CONSTRAINT takeoff_analyses_current_approval_fk
  FOREIGN KEY (current_approval_id, organization_id)
  REFERENCES public.takeoff_approvals (id, organization_id) ON DELETE SET NULL (current_approval_id);

CREATE OR REPLACE FUNCTION app.takeoff_approvals_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'takeoff_approvals rows are immutable' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.analysis_id, NEW.boq_json, NEW.detections_hash,
      NEW.file_versions_json, NEW.rule_set_version, NEW.approved_by_user_id, NEW.approved_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.analysis_id, OLD.boq_json, OLD.detections_hash,
      OLD.file_versions_json, OLD.rule_set_version, OLD.approved_by_user_id, OLD.approved_at, OLD.created_at) THEN
    RAISE EXCEPTION 'takeoff_approvals: snapshot columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.reopened_at IS NOT NULL AND NEW.reopened_at IS DISTINCT FROM OLD.reopened_at THEN
    RAISE EXCEPTION 'takeoff_approvals: reopen timestamp is final' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.takeoff_approvals_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS takeoff_approvals_block_update ON public.takeoff_approvals;
CREATE TRIGGER takeoff_approvals_guard
  BEFORE UPDATE OR DELETE ON public.takeoff_approvals
  FOR EACH ROW EXECUTE FUNCTION app.takeoff_approvals_guard();

--------------------------------------------------------------------------------
-- 8. RLS
--------------------------------------------------------------------------------

ALTER TABLE public.takeoff_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_analyses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_sheets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_detections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_edits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_legend_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_legend_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_linear ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_linear FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_warnings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_planner_symbol_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_planner_symbol_library FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_catalog_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_catalog_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_rule_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_approvals FORCE ROW LEVEL SECURITY;

-- takeoff_analyses SELECT: internal takeoff.view + project; contractor ext.takeoff.view + grant
DROP POLICY IF EXISTS takeoff_analyses_select ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_select ON public.takeoff_analyses
  FOR SELECT TO authenticated
  USING (
    (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, 'takeoff.view')
      AND app.has_project_capability(organization_id, project_id, 'project.view')
    )
    OR (
      created_by_actor_type = 'external'
      AND vendor_id IS NOT NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.takeoff.view')
    )
  );

DROP POLICY IF EXISTS takeoff_analyses_insert_internal ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_insert_internal ON public.takeoff_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
    AND created_by_actor_type = 'internal'
    AND created_by_user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS takeoff_analyses_insert_external ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_insert_external ON public.takeoff_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND vendor_id IS NOT NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.takeoff.manage')
  );

DROP POLICY IF EXISTS takeoff_analyses_update ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_update ON public.takeoff_analyses
  FOR UPDATE TO authenticated
  USING (
  (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  )
  OR (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.takeoff.manage')
  ))
  WITH CHECK (true);

DROP POLICY IF EXISTS takeoff_analyses_service_all ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_service_all ON public.takeoff_analyses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Child tables: visible when parent analysis is visible (same org/project)
DROP POLICY IF EXISTS takeoff_child_select ON public.takeoff_files;
CREATE POLICY takeoff_child_select ON public.takeoff_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.takeoff_analyses a
      WHERE a.id = takeoff_files.analysis_id
        AND a.organization_id = takeoff_files.organization_id
        AND a.project_id = takeoff_files.project_id
    )
  );

DROP POLICY IF EXISTS takeoff_files_service_all ON public.takeoff_files;
CREATE POLICY takeoff_files_service_all ON public.takeoff_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS takeoff_files_write ON public.takeoff_files;
CREATE POLICY takeoff_files_write ON public.takeoff_files
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS takeoff_jobs_select ON public.takeoff_jobs;
CREATE POLICY takeoff_jobs_select ON public.takeoff_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.takeoff_analyses a
      WHERE a.id = takeoff_jobs.analysis_id
        AND a.organization_id = takeoff_jobs.organization_id
        AND a.project_id = takeoff_jobs.project_id
    )
  );

DROP POLICY IF EXISTS takeoff_jobs_service_all ON public.takeoff_jobs;
CREATE POLICY takeoff_jobs_service_all ON public.takeoff_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS takeoff_jobs_write ON public.takeoff_jobs;
CREATE POLICY takeoff_jobs_write ON public.takeoff_jobs
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

-- Output / edit tables scoped by analysis_id
DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'takeoff_sheets', 'takeoff_detections', 'takeoff_edits', 'takeoff_areas', 'takeoff_artifacts', 'takeoff_approvals'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.takeoff_analyses a
          WHERE a.id = %I.analysis_id
            AND a.organization_id = %I.organization_id
            AND a.project_id = %I.project_id
        )
      )',
      t, t, t, t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END
$pol$;

-- Job-scoped worker rows (legend / linear / warnings) via takeoff_jobs -> analyses
DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['takeoff_legend_entries', 'takeoff_linear', 'takeoff_warnings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1
          FROM public.takeoff_jobs j
          JOIN public.takeoff_analyses a
            ON a.id = j.analysis_id
            AND a.organization_id = j.organization_id
            AND a.project_id = j.project_id
          WHERE j.id = %I.job_id
            AND j.organization_id = %I.organization_id
            AND j.project_id = %I.project_id
        )
      )',
      t, t, t, t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END
$pol$;

DROP POLICY IF EXISTS takeoff_edits_insert ON public.takeoff_edits;
CREATE POLICY takeoff_edits_insert ON public.takeoff_edits
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS takeoff_areas_write ON public.takeoff_areas;
CREATE POLICY takeoff_areas_write ON public.takeoff_areas
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS takeoff_approvals_insert ON public.takeoff_approvals;
CREATE POLICY takeoff_approvals_insert ON public.takeoff_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.approve')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS takeoff_planner_symbol_library_select ON public.takeoff_planner_symbol_library;
CREATE POLICY takeoff_planner_symbol_library_select ON public.takeoff_planner_symbol_library
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.view')
  );

DROP POLICY IF EXISTS takeoff_planner_symbol_library_write ON public.takeoff_planner_symbol_library;
CREATE POLICY takeoff_planner_symbol_library_write ON public.takeoff_planner_symbol_library
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.library.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.library.manage')
  );

DROP POLICY IF EXISTS takeoff_planner_symbol_library_service ON public.takeoff_planner_symbol_library;
CREATE POLICY takeoff_planner_symbol_library_service ON public.takeoff_planner_symbol_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS takeoff_catalog_types_select ON public.takeoff_catalog_types;
CREATE POLICY takeoff_catalog_types_select ON public.takeoff_catalog_types
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.view'));

DROP POLICY IF EXISTS takeoff_catalog_types_write ON public.takeoff_catalog_types;
CREATE POLICY takeoff_catalog_types_write ON public.takeoff_catalog_types
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'));

DROP POLICY IF EXISTS takeoff_catalog_types_service ON public.takeoff_catalog_types;
CREATE POLICY takeoff_catalog_types_service ON public.takeoff_catalog_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS takeoff_rule_sets_select ON public.takeoff_rule_sets;
CREATE POLICY takeoff_rule_sets_select ON public.takeoff_rule_sets
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.view'));

DROP POLICY IF EXISTS takeoff_rule_sets_write ON public.takeoff_rule_sets;
CREATE POLICY takeoff_rule_sets_write ON public.takeoff_rule_sets
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'));

DROP POLICY IF EXISTS takeoff_rule_sets_service ON public.takeoff_rule_sets;
CREATE POLICY takeoff_rule_sets_service ON public.takeoff_rule_sets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;