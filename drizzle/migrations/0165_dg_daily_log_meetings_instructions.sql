-- 0165: Developer / GC layer - DAILY SITE LOG, CONTRACTOR MEETINGS & MINUTES, SITE INSTRUCTIONS (Track O).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 / 0155 only.
--
-- PURPOSE
--   1. site_daily_logs + site_daily_log_entries: one internal log per project per date, structured
--      entries (contractors present, work performed, manpower, equipment, deliveries, delays,
--      blocking issues, inspections, safety events, instructions, notes). No mandatory content.
--   2. site_daily_reports: contractor daily report submissions (append-only revisions, vendor scoped).
--   3. Contractor meetings REUSE meeting_records / meeting_attendees / meeting_decisions /
--      meeting_action_items. New 1:1 extension (site_meeting_details), contractor attendees,
--      contractor action-item assignment, and immutable published minutes (+ per-vendor actions).
--      Additive permissive RLS on the four legacy meeting tables lets project-capability holders
--      work on DG site meetings only (rows that have a site_meeting_details row).
--   4. site_instructions + site_instruction_events (append-only history; the event trigger is the
--      only path that changes instruction status; contractors may append acknowledged/performed).
--
-- COMPATIBILITY: additive. Existing meetings / daily_logs flows unchanged.

--------------------------------------------------------------------------------
-- 1. Daily site log (internal)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  log_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  weather text,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_daily_logs_status_known CHECK (status IN ('open', 'closed')),
  CONSTRAINT site_daily_logs_closed_shape CHECK (
    (status = 'open' AND closed_at IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL)
  )
);

ALTER TABLE public.site_daily_logs DROP CONSTRAINT IF EXISTS site_daily_logs_project_org_fk;
ALTER TABLE public.site_daily_logs
  ADD CONSTRAINT site_daily_logs_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS site_daily_logs_id_organization_id_uq
  ON public.site_daily_logs (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_daily_logs_id_org_project_uq
  ON public.site_daily_logs (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_daily_logs_project_date_uq
  ON public.site_daily_logs (organization_id, project_id, log_date);

-- A closed log only changes by reopening it (status back to open).
CREATE OR REPLACE FUNCTION app.site_daily_logs_closed_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.log_date IS DISTINCT FROM OLD.log_date THEN
    RAISE EXCEPTION 'site_daily_logs: organization, project and date are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'closed' AND NEW.status = 'closed' THEN
    RAISE EXCEPTION 'site_daily_logs: closed log is locked; reopen it first' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_daily_logs_closed_lock ON public.site_daily_logs;
CREATE TRIGGER site_daily_logs_closed_lock
  BEFORE UPDATE ON public.site_daily_logs
  FOR EACH ROW EXECUTE FUNCTION app.site_daily_logs_closed_lock();

CREATE TABLE IF NOT EXISTS public.site_daily_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  daily_log_id uuid NOT NULL,
  entry_type text NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  location_id uuid,
  description text,
  headcount integer,
  hours numeric(10, 2),
  quantity numeric(18, 6),
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_daily_log_entries_type_known CHECK (entry_type IN (
    'contractor_presence', 'work_performed', 'manpower', 'equipment', 'delivery', 'delay',
    'blocking_issue', 'inspection', 'safety_event', 'instruction', 'note'
  )),
  CONSTRAINT site_daily_log_entries_non_negative CHECK (
    (headcount IS NULL OR headcount >= 0) AND (hours IS NULL OR hours >= 0)
    AND (quantity IS NULL OR quantity >= 0)
  ),
  CONSTRAINT site_daily_log_entries_agreement_needs_vendor CHECK (
    subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL
  )
);

ALTER TABLE public.site_daily_log_entries DROP CONSTRAINT IF EXISTS site_daily_log_entries_log_fk;
ALTER TABLE public.site_daily_log_entries
  ADD CONSTRAINT site_daily_log_entries_log_fk
  FOREIGN KEY (daily_log_id, organization_id, project_id)
  REFERENCES public.site_daily_logs (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.site_daily_log_entries DROP CONSTRAINT IF EXISTS site_daily_log_entries_vendor_fk;
ALTER TABLE public.site_daily_log_entries
  ADD CONSTRAINT site_daily_log_entries_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_log_entries DROP CONSTRAINT IF EXISTS site_daily_log_entries_agreement_vendor_fk;
ALTER TABLE public.site_daily_log_entries
  ADD CONSTRAINT site_daily_log_entries_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_log_entries DROP CONSTRAINT IF EXISTS site_daily_log_entries_agreement_project_fk;
ALTER TABLE public.site_daily_log_entries
  ADD CONSTRAINT site_daily_log_entries_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_log_entries DROP CONSTRAINT IF EXISTS site_daily_log_entries_location_fk;
ALTER TABLE public.site_daily_log_entries
  ADD CONSTRAINT site_daily_log_entries_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

CREATE UNIQUE INDEX IF NOT EXISTS site_daily_log_entries_id_organization_id_uq
  ON public.site_daily_log_entries (id, organization_id);
CREATE INDEX IF NOT EXISTS site_daily_log_entries_log_idx
  ON public.site_daily_log_entries (organization_id, daily_log_id, entry_type, sort_order);
CREATE INDEX IF NOT EXISTS site_daily_log_entries_vendor_idx
  ON public.site_daily_log_entries (organization_id, vendor_id) WHERE vendor_id IS NOT NULL;

-- A closed log is locked: entries cannot be added/changed/removed until the log is reopened.
CREATE OR REPLACE FUNCTION app.site_daily_log_entries_open_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_log_id uuid;
  v_org uuid;
  v_status text;
BEGIN
  -- FK cascades (project / organization removal) run nested and are always allowed.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_log_id := OLD.daily_log_id; v_org := OLD.organization_id;
  ELSE
    v_log_id := NEW.daily_log_id; v_org := NEW.organization_id;
  END IF;
  SELECT l.status INTO v_status FROM public.site_daily_logs l
    WHERE l.id = v_log_id AND l.organization_id = v_org;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'site_daily_log_entries: daily log is closed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_daily_log_entries_open_guard ON public.site_daily_log_entries;
CREATE TRIGGER site_daily_log_entries_open_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.site_daily_log_entries
  FOR EACH ROW EXECUTE FUNCTION app.site_daily_log_entries_open_guard();

--------------------------------------------------------------------------------
-- 2. Contractor daily reports (append-only, vendor scoped)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  report_date date NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  supersedes_report_id uuid,
  location_id uuid,
  manpower_count integer,
  work_performed text,
  equipment text,
  deliveries text,
  delays text,
  blocking_issues text,
  safety_notes text,
  notes text,
  submitted_actor_type text NOT NULL,
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_daily_reports_revision_positive CHECK (revision >= 1),
  CONSTRAINT site_daily_reports_manpower_non_negative CHECK (manpower_count IS NULL OR manpower_count >= 0),
  CONSTRAINT site_daily_reports_actor_shape CHECK (
    (submitted_actor_type = 'internal' AND submitted_by_principal_id IS NULL)
    OR (submitted_actor_type = 'external' AND submitted_by_principal_id IS NOT NULL AND submitted_by_user_id IS NULL)
  )
);

ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_project_org_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_vendor_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_agreement_vendor_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_agreement_project_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_location_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

CREATE UNIQUE INDEX IF NOT EXISTS site_daily_reports_id_organization_id_uq
  ON public.site_daily_reports (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_daily_reports_revision_uq
  ON public.site_daily_reports (
    organization_id, project_id, vendor_id,
    COALESCE(subcontract_agreement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    report_date, revision
  );
CREATE INDEX IF NOT EXISTS site_daily_reports_project_date_idx
  ON public.site_daily_reports (organization_id, project_id, report_date);
CREATE INDEX IF NOT EXISTS site_daily_reports_vendor_idx
  ON public.site_daily_reports (organization_id, vendor_id, report_date DESC);

ALTER TABLE public.site_daily_reports DROP CONSTRAINT IF EXISTS site_daily_reports_supersedes_fk;
ALTER TABLE public.site_daily_reports
  ADD CONSTRAINT site_daily_reports_supersedes_fk
  FOREIGN KEY (supersedes_report_id, organization_id)
  REFERENCES public.site_daily_reports (id, organization_id) ON DELETE RESTRICT;

-- Revision numbering is server-assigned (never trusted from the client).
CREATE OR REPLACE FUNCTION app.site_daily_reports_assign_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_prev record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('site_daily_reports:' || NEW.project_id::text || ':' || NEW.vendor_id::text));
  SELECT r.id, r.revision INTO v_prev
  FROM public.site_daily_reports r
  WHERE r.organization_id = NEW.organization_id
    AND r.project_id = NEW.project_id
    AND r.vendor_id = NEW.vendor_id
    AND r.subcontract_agreement_id IS NOT DISTINCT FROM NEW.subcontract_agreement_id
    AND r.report_date = NEW.report_date
  ORDER BY r.revision DESC
  LIMIT 1;
  IF v_prev.id IS NULL THEN
    NEW.revision := 1;
    NEW.supersedes_report_id := NULL;
  ELSE
    NEW.revision := v_prev.revision + 1;
    NEW.supersedes_report_id := v_prev.id;
  END IF;
  NEW.submitted_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_daily_reports_assign_revision ON public.site_daily_reports;
CREATE TRIGGER site_daily_reports_assign_revision
  BEFORE INSERT ON public.site_daily_reports
  FOR EACH ROW EXECUTE FUNCTION app.site_daily_reports_assign_revision();

CREATE OR REPLACE FUNCTION app.site_field_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS site_daily_reports_append_only ON public.site_daily_reports;
CREATE TRIGGER site_daily_reports_append_only
  BEFORE UPDATE OR DELETE ON public.site_daily_reports
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.site_field_append_only();

--------------------------------------------------------------------------------
-- 3. Contractor meetings (reuse meeting_records + extension tables)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_meeting_details (
  meeting_id uuid PRIMARY KEY REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  meeting_type text NOT NULL DEFAULT 'weekly_contractor',
  status text NOT NULL DEFAULT 'scheduled',
  agenda text,
  minutes text,
  held_at timestamptz,
  published_version integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  published_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_meeting_details_type_known CHECK (meeting_type IN (
    'weekly_contractor', 'site', 'design', 'consultant', 'other'
  )),
  CONSTRAINT site_meeting_details_status_known CHECK (status IN ('scheduled', 'held', 'published', 'cancelled')),
  CONSTRAINT site_meeting_details_published_shape CHECK (
    (status <> 'published') OR (published_version >= 1 AND published_at IS NOT NULL)
  )
);

ALTER TABLE public.site_meeting_details DROP CONSTRAINT IF EXISTS site_meeting_details_project_org_fk;
ALTER TABLE public.site_meeting_details
  ADD CONSTRAINT site_meeting_details_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS site_meeting_details_meeting_org_project_uq
  ON public.site_meeting_details (meeting_id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS site_meeting_details_project_idx
  ON public.site_meeting_details (organization_id, project_id, status);

-- The extension must describe the same org/project as the reused meeting row.
CREATE OR REPLACE FUNCTION app.site_meeting_details_match_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.meeting_records m
    WHERE m.id = NEW.meeting_id
      AND m.organization_id = NEW.organization_id
      AND m.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'site_meeting_details: meeting must belong to the same organization and project'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_meeting_details_match_meeting ON public.site_meeting_details;
CREATE TRIGGER site_meeting_details_match_meeting
  BEFORE INSERT OR UPDATE OF meeting_id, organization_id, project_id ON public.site_meeting_details
  FOR EACH ROW EXECUTE FUNCTION app.site_meeting_details_match_meeting();

CREATE TABLE IF NOT EXISTS public.site_meeting_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  meeting_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  display_name text,
  attendance text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_meeting_contractors_attendance_known CHECK (attendance IN ('invited', 'attended', 'absent'))
);

ALTER TABLE public.site_meeting_contractors DROP CONSTRAINT IF EXISTS site_meeting_contractors_meeting_fk;
ALTER TABLE public.site_meeting_contractors
  ADD CONSTRAINT site_meeting_contractors_meeting_fk
  FOREIGN KEY (meeting_id, organization_id, project_id)
  REFERENCES public.site_meeting_details (meeting_id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.site_meeting_contractors DROP CONSTRAINT IF EXISTS site_meeting_contractors_vendor_fk;
ALTER TABLE public.site_meeting_contractors
  ADD CONSTRAINT site_meeting_contractors_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE public.site_meeting_contractors DROP CONSTRAINT IF EXISTS site_meeting_contractors_agreement_vendor_fk;
ALTER TABLE public.site_meeting_contractors
  ADD CONSTRAINT site_meeting_contractors_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.site_meeting_contractors DROP CONSTRAINT IF EXISTS site_meeting_contractors_agreement_project_fk;
ALTER TABLE public.site_meeting_contractors
  ADD CONSTRAINT site_meeting_contractors_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS site_meeting_contractors_party_uq
  ON public.site_meeting_contractors (
    meeting_id, vendor_id,
    COALESCE(principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS site_meeting_contractors_vendor_idx
  ON public.site_meeting_contractors (organization_id, vendor_id);

-- Contractor ownership of an action item (the item itself lives in meeting_action_items).
CREATE TABLE IF NOT EXISTS public.site_meeting_action_assignments (
  action_item_id uuid PRIMARY KEY REFERENCES public.meeting_action_items (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  meeting_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_meeting_action_assignments DROP CONSTRAINT IF EXISTS site_meeting_action_assignments_meeting_fk;
ALTER TABLE public.site_meeting_action_assignments
  ADD CONSTRAINT site_meeting_action_assignments_meeting_fk
  FOREIGN KEY (meeting_id, organization_id, project_id)
  REFERENCES public.site_meeting_details (meeting_id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.site_meeting_action_assignments DROP CONSTRAINT IF EXISTS site_meeting_action_assignments_vendor_fk;
ALTER TABLE public.site_meeting_action_assignments
  ADD CONSTRAINT site_meeting_action_assignments_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE public.site_meeting_action_assignments DROP CONSTRAINT IF EXISTS site_meeting_action_assignments_agreement_fk;
ALTER TABLE public.site_meeting_action_assignments
  ADD CONSTRAINT site_meeting_action_assignments_agreement_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS site_meeting_action_assignments_meeting_idx
  ON public.site_meeting_action_assignments (organization_id, meeting_id);

-- Published minutes: immutable snapshot per version (republish = new version).
CREATE TABLE IF NOT EXISTS public.site_meeting_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  meeting_id uuid NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  meeting_type text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  held_at timestamptz,
  location text,
  agenda text,
  minutes text,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_meeting_publications_version_positive CHECK (version >= 1)
);

ALTER TABLE public.site_meeting_publications DROP CONSTRAINT IF EXISTS site_meeting_publications_meeting_fk;
ALTER TABLE public.site_meeting_publications
  ADD CONSTRAINT site_meeting_publications_meeting_fk
  FOREIGN KEY (meeting_id, organization_id, project_id)
  REFERENCES public.site_meeting_details (meeting_id, organization_id, project_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS site_meeting_publications_id_organization_id_uq
  ON public.site_meeting_publications (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_meeting_publications_version_uq
  ON public.site_meeting_publications (meeting_id, version);
CREATE INDEX IF NOT EXISTS site_meeting_publications_project_idx
  ON public.site_meeting_publications (organization_id, project_id, published_at DESC);

-- Action items in a published version. vendor_id NULL = internal item (never shown to contractors).
CREATE TABLE IF NOT EXISTS public.site_meeting_publication_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  action_item_id uuid,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  title text NOT NULL,
  due_date date,
  task_id uuid,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.site_meeting_publication_actions DROP CONSTRAINT IF EXISTS site_meeting_publication_actions_pub_fk;
ALTER TABLE public.site_meeting_publication_actions
  ADD CONSTRAINT site_meeting_publication_actions_pub_fk
  FOREIGN KEY (publication_id, organization_id)
  REFERENCES public.site_meeting_publications (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.site_meeting_publication_actions DROP CONSTRAINT IF EXISTS site_meeting_publication_actions_vendor_fk;
ALTER TABLE public.site_meeting_publication_actions
  ADD CONSTRAINT site_meeting_publication_actions_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS site_meeting_publication_actions_pub_idx
  ON public.site_meeting_publication_actions (organization_id, publication_id, sort_order);

DROP TRIGGER IF EXISTS site_meeting_publications_append_only ON public.site_meeting_publications;
CREATE TRIGGER site_meeting_publications_append_only
  BEFORE UPDATE OR DELETE ON public.site_meeting_publications
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.site_field_append_only();
DROP TRIGGER IF EXISTS site_meeting_publication_actions_append_only ON public.site_meeting_publication_actions;
CREATE TRIGGER site_meeting_publication_actions_append_only
  BEFORE UPDATE OR DELETE ON public.site_meeting_publication_actions
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.site_field_append_only();

-- Policy helpers for the reused legacy meeting tables (DG site meetings only).
CREATE OR REPLACE FUNCTION app.site_meeting_has_capability(p_meeting_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.site_meeting_details d
    WHERE d.meeting_id = p_meeting_id
      AND app.has_project_capability(d.organization_id, d.project_id, p_capability)
  )
$fn$;

-- Contractor attendee of a meeting (any covered vendor party row).
CREATE OR REPLACE FUNCTION app.site_meeting_external_attendee(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.site_meeting_contractors c
    WHERE c.meeting_id = p_meeting_id
      AND app.external_has_scope(c.organization_id, c.project_id, c.vendor_id,
        c.subcontract_agreement_id, 'ext.project.view')
  )
$fn$;

REVOKE ALL ON FUNCTION app.site_meeting_has_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.site_meeting_external_attendee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.site_meeting_has_capability(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.site_meeting_external_attendee(uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. Site instructions (header + append-only events)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  instruction_number integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'operational',
  status text NOT NULL DEFAULT 'issued',
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  location_id uuid,
  daily_log_id uuid,
  meeting_id uuid,
  due_date date,
  conversion_state text NOT NULL DEFAULT 'none',
  issued_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_actor_type text,
  acknowledged_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  acknowledged_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  performed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_instructions_category_known CHECK (category IN (
    'operational', 'potentially_financial', 'urgent_before_price'
  )),
  CONSTRAINT site_instructions_status_known CHECK (status IN (
    'issued', 'acknowledged', 'performed', 'closed', 'cancelled'
  )),
  CONSTRAINT site_instructions_conversion_known CHECK (conversion_state IN (
    'none', 'pending', 'converted', 'dismissed'
  )),
  CONSTRAINT site_instructions_conversion_category CHECK (
    conversion_state = 'none' OR category <> 'operational'
  ),
  CONSTRAINT site_instructions_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT site_instructions_ack_actor_shape CHECK (
    acknowledged_actor_type IS NULL
    OR (acknowledged_actor_type = 'internal' AND acknowledged_by_principal_id IS NULL)
    OR (acknowledged_actor_type = 'external' AND acknowledged_by_principal_id IS NOT NULL
      AND acknowledged_by_user_id IS NULL)
  )
);

ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_project_org_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_vendor_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_agreement_vendor_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_agreement_project_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_location_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_daily_log_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_daily_log_fk
  FOREIGN KEY (daily_log_id, organization_id, project_id)
  REFERENCES public.site_daily_logs (id, organization_id, project_id) ON DELETE SET NULL (daily_log_id);
ALTER TABLE public.site_instructions DROP CONSTRAINT IF EXISTS site_instructions_meeting_fk;
ALTER TABLE public.site_instructions
  ADD CONSTRAINT site_instructions_meeting_fk
  FOREIGN KEY (meeting_id, organization_id, project_id)
  REFERENCES public.site_meeting_details (meeting_id, organization_id, project_id) ON DELETE SET NULL (meeting_id);

CREATE UNIQUE INDEX IF NOT EXISTS site_instructions_id_organization_id_uq
  ON public.site_instructions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_instructions_number_uq
  ON public.site_instructions (organization_id, project_id, instruction_number);
CREATE INDEX IF NOT EXISTS site_instructions_project_status_idx
  ON public.site_instructions (organization_id, project_id, status, issued_at DESC);
CREATE INDEX IF NOT EXISTS site_instructions_vendor_status_idx
  ON public.site_instructions (organization_id, vendor_id, status);

-- Server-assigned per-project number; status always starts at 'issued'.
CREATE OR REPLACE FUNCTION app.site_instructions_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('site_instructions:' || NEW.project_id::text));
  SELECT COALESCE(MAX(i.instruction_number), 0) + 1 INTO NEW.instruction_number
  FROM public.site_instructions i
  WHERE i.organization_id = NEW.organization_id AND i.project_id = NEW.project_id;
  NEW.status := 'issued';
  NEW.issued_at := now();
  NEW.acknowledged_at := NULL;
  NEW.acknowledged_actor_type := NULL;
  NEW.acknowledged_by_user_id := NULL;
  NEW.acknowledged_by_principal_id := NULL;
  NEW.performed_at := NULL;
  NEW.closed_at := NULL;
  NEW.cancelled_at := NULL;
  NEW.conversion_state := CASE WHEN NEW.category = 'operational' THEN 'none' ELSE 'pending' END;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_instructions_before_insert ON public.site_instructions;
CREATE TRIGGER site_instructions_before_insert
  BEFORE INSERT ON public.site_instructions
  FOR EACH ROW EXECUTE FUNCTION app.site_instructions_before_insert();

-- Lifecycle columns change only through site_instruction_events (the event trigger writes nested).
CREATE OR REPLACE FUNCTION app.site_instructions_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Nested writes come from the event trigger below or from FK cascades / SET NULL actions.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_instructions cannot be deleted; cancel instead' USING ERRCODE = '42501';
  END IF;
  IF (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.conversion_state IS DISTINCT FROM OLD.conversion_state
    OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
    OR NEW.acknowledged_actor_type IS DISTINCT FROM OLD.acknowledged_actor_type
    OR NEW.acknowledged_by_user_id IS DISTINCT FROM OLD.acknowledged_by_user_id
    OR NEW.acknowledged_by_principal_id IS DISTINCT FROM OLD.acknowledged_by_principal_id
    OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
    OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.instruction_number IS DISTINCT FROM OLD.instruction_number
  ) THEN
    RAISE EXCEPTION 'site_instructions: lifecycle changes go through site_instruction_events'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'site_instructions: organization, project and contractor are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'site_instructions: closed or cancelled instruction is locked' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_instructions_guard_update ON public.site_instructions;
CREATE TRIGGER site_instructions_guard_update
  BEFORE UPDATE OR DELETE ON public.site_instructions
  FOR EACH ROW EXECUTE FUNCTION app.site_instructions_guard_update();

CREATE TABLE IF NOT EXISTS public.site_instruction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  instruction_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_instruction_events_type_known CHECK (event_type IN (
    'issued', 'acknowledged', 'performed', 'closed', 'cancelled', 'reopened',
    'conversion_requested', 'converted', 'conversion_dismissed', 'note'
  )),
  CONSTRAINT site_instruction_events_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.site_instruction_events DROP CONSTRAINT IF EXISTS site_instruction_events_instruction_fk;
ALTER TABLE public.site_instruction_events
  ADD CONSTRAINT site_instruction_events_instruction_fk
  FOREIGN KEY (instruction_id, organization_id)
  REFERENCES public.site_instructions (id, organization_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS site_instruction_events_instruction_idx
  ON public.site_instruction_events (organization_id, instruction_id, occurred_at);

-- Applies an event to its instruction: validates the transition, stamps the header, and copies the
-- authoritative scope (project / vendor / agreement) onto the event BEFORE RLS WITH CHECK runs.
CREATE OR REPLACE FUNCTION app.site_instruction_apply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ins public.site_instructions%ROWTYPE;
  v_to text;
  v_conv text;
BEGIN
  SELECT * INTO v_ins FROM public.site_instructions i
    WHERE i.id = NEW.instruction_id AND i.organization_id = NEW.organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_instruction_events: instruction not found' USING ERRCODE = '23503';
  END IF;

  NEW.project_id := v_ins.project_id;
  NEW.vendor_id := v_ins.vendor_id;
  NEW.subcontract_agreement_id := v_ins.subcontract_agreement_id;
  NEW.from_status := v_ins.status;
  NEW.occurred_at := now();
  v_to := v_ins.status;
  v_conv := v_ins.conversion_state;

  IF NEW.actor_type = 'external' AND NEW.event_type NOT IN ('acknowledged', 'performed', 'note') THEN
    RAISE EXCEPTION 'site_instruction_events: contractors may only acknowledge or report performed'
      USING ERRCODE = '42501';
  END IF;

  CASE NEW.event_type
    WHEN 'issued' THEN
      IF EXISTS (SELECT 1 FROM public.site_instruction_events e
                 WHERE e.instruction_id = NEW.instruction_id AND e.event_type = 'issued') THEN
        RAISE EXCEPTION 'site_instruction_events: already issued' USING ERRCODE = '23514';
      END IF;
    WHEN 'acknowledged' THEN
      IF v_ins.status <> 'issued' THEN
        RAISE EXCEPTION 'site_instruction_events: only an issued instruction can be acknowledged'
          USING ERRCODE = '23514';
      END IF;
      v_to := 'acknowledged';
    WHEN 'performed' THEN
      IF v_ins.status NOT IN ('issued', 'acknowledged') THEN
        RAISE EXCEPTION 'site_instruction_events: instruction cannot be marked performed'
          USING ERRCODE = '23514';
      END IF;
      v_to := 'performed';
    WHEN 'closed' THEN
      IF v_ins.status NOT IN ('acknowledged', 'performed') THEN
        RAISE EXCEPTION 'site_instruction_events: instruction cannot be closed' USING ERRCODE = '23514';
      END IF;
      v_to := 'closed';
    WHEN 'cancelled' THEN
      IF v_ins.status NOT IN ('issued', 'acknowledged') THEN
        RAISE EXCEPTION 'site_instruction_events: instruction cannot be cancelled' USING ERRCODE = '23514';
      END IF;
      v_to := 'cancelled';
    WHEN 'reopened' THEN
      IF v_ins.status NOT IN ('performed', 'closed') THEN
        RAISE EXCEPTION 'site_instruction_events: instruction cannot be reopened' USING ERRCODE = '23514';
      END IF;
      v_to := 'acknowledged';
    WHEN 'conversion_requested' THEN
      IF v_ins.category = 'operational' OR v_ins.status = 'cancelled' OR v_ins.conversion_state = 'converted' THEN
        RAISE EXCEPTION 'site_instruction_events: conversion not allowed' USING ERRCODE = '23514';
      END IF;
      v_conv := 'pending';
    WHEN 'converted' THEN
      IF v_ins.category = 'operational' OR v_ins.status = 'cancelled' THEN
        RAISE EXCEPTION 'site_instruction_events: conversion not allowed' USING ERRCODE = '23514';
      END IF;
      v_conv := 'converted';
    WHEN 'conversion_dismissed' THEN
      IF v_ins.conversion_state <> 'pending' THEN
        RAISE EXCEPTION 'site_instruction_events: nothing to dismiss' USING ERRCODE = '23514';
      END IF;
      v_conv := 'dismissed';
    ELSE
      NULL;
  END CASE;

  NEW.to_status := v_to;

  IF v_to IS DISTINCT FROM v_ins.status OR v_conv IS DISTINCT FROM v_ins.conversion_state THEN
    UPDATE public.site_instructions i SET
      status = v_to,
      conversion_state = v_conv,
      acknowledged_at = CASE WHEN NEW.event_type = 'acknowledged' THEN now() ELSE i.acknowledged_at END,
      acknowledged_actor_type = CASE WHEN NEW.event_type = 'acknowledged' THEN NEW.actor_type ELSE i.acknowledged_actor_type END,
      acknowledged_by_user_id = CASE WHEN NEW.event_type = 'acknowledged' THEN NEW.actor_user_id ELSE i.acknowledged_by_user_id END,
      acknowledged_by_principal_id = CASE WHEN NEW.event_type = 'acknowledged' THEN NEW.actor_principal_id ELSE i.acknowledged_by_principal_id END,
      performed_at = CASE WHEN NEW.event_type = 'performed' THEN now()
                          WHEN NEW.event_type = 'reopened' THEN NULL ELSE i.performed_at END,
      closed_at = CASE WHEN NEW.event_type = 'closed' THEN now()
                       WHEN NEW.event_type = 'reopened' THEN NULL ELSE i.closed_at END,
      cancelled_at = CASE WHEN NEW.event_type = 'cancelled' THEN now() ELSE i.cancelled_at END
    WHERE i.id = v_ins.id AND i.organization_id = v_ins.organization_id;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS site_instruction_events_apply ON public.site_instruction_events;
CREATE TRIGGER site_instruction_events_apply
  BEFORE INSERT ON public.site_instruction_events
  FOR EACH ROW EXECUTE FUNCTION app.site_instruction_apply_event();
DROP TRIGGER IF EXISTS site_instruction_events_append_only ON public.site_instruction_events;
CREATE TRIGGER site_instruction_events_append_only
  BEFORE UPDATE OR DELETE ON public.site_instruction_events
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.site_field_append_only();

REVOKE ALL ON FUNCTION app.site_daily_log_entries_open_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.site_daily_reports_assign_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.site_meeting_details_match_meeting() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.site_instructions_before_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.site_instruction_apply_event() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 5. RLS
--------------------------------------------------------------------------------

ALTER TABLE public.site_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_daily_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_daily_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_daily_log_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_daily_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_details FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_contractors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_action_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_action_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_publication_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_meeting_publication_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_instructions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_instruction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_instruction_events FORCE ROW LEVEL SECURITY;

-- site_daily_logs / entries: internal only (the log mentions every contractor on site).
DROP POLICY IF EXISTS site_daily_logs_select ON public.site_daily_logs;
CREATE POLICY site_daily_logs_select ON public.site_daily_logs
  FOR SELECT TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS site_daily_logs_insert ON public.site_daily_logs;
CREATE POLICY site_daily_logs_insert ON public.site_daily_logs
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'daily_log.manage'));
DROP POLICY IF EXISTS site_daily_logs_update ON public.site_daily_logs;
CREATE POLICY site_daily_logs_update ON public.site_daily_logs
  FOR UPDATE TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'daily_log.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'daily_log.manage'));
DROP POLICY IF EXISTS site_daily_logs_service_all ON public.site_daily_logs;
CREATE POLICY site_daily_logs_service_all ON public.site_daily_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_daily_log_entries_select ON public.site_daily_log_entries;
CREATE POLICY site_daily_log_entries_select ON public.site_daily_log_entries
  FOR SELECT TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS site_daily_log_entries_write ON public.site_daily_log_entries;
CREATE POLICY site_daily_log_entries_write ON public.site_daily_log_entries
  FOR ALL TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'daily_log.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'daily_log.manage'));
DROP POLICY IF EXISTS site_daily_log_entries_service_all ON public.site_daily_log_entries;
CREATE POLICY site_daily_log_entries_service_all ON public.site_daily_log_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- site_daily_reports: internal readers; the contractor reads/submits only its own vendor scope.
DROP POLICY IF EXISTS site_daily_reports_select ON public.site_daily_reports;
CREATE POLICY site_daily_reports_select ON public.site_daily_reports
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.daily_log.submit')
  );
DROP POLICY IF EXISTS site_daily_reports_insert_internal ON public.site_daily_reports;
CREATE POLICY site_daily_reports_insert_internal ON public.site_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_actor_type = 'internal'
    AND submitted_by_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'daily_log.manage')
  );
DROP POLICY IF EXISTS site_daily_reports_insert_external ON public.site_daily_reports;
CREATE POLICY site_daily_reports_insert_external ON public.site_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_actor_type = 'external'
    AND submitted_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.daily_log.submit')
  );
DROP POLICY IF EXISTS site_daily_reports_service_all ON public.site_daily_reports;
CREATE POLICY site_daily_reports_service_all ON public.site_daily_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- site_meeting_details / contractors / action assignments: internal.
DROP POLICY IF EXISTS site_meeting_details_select ON public.site_meeting_details;
CREATE POLICY site_meeting_details_select ON public.site_meeting_details
  FOR SELECT TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS site_meeting_details_insert ON public.site_meeting_details;
CREATE POLICY site_meeting_details_insert ON public.site_meeting_details
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_details_update ON public.site_meeting_details;
CREATE POLICY site_meeting_details_update ON public.site_meeting_details
  FOR UPDATE TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'meetings.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_details_service_all ON public.site_meeting_details;
CREATE POLICY site_meeting_details_service_all ON public.site_meeting_details
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_meeting_contractors_select ON public.site_meeting_contractors;
CREATE POLICY site_meeting_contractors_select ON public.site_meeting_contractors
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.project.view')
  );
DROP POLICY IF EXISTS site_meeting_contractors_write ON public.site_meeting_contractors;
CREATE POLICY site_meeting_contractors_write ON public.site_meeting_contractors
  FOR ALL TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'meetings.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_contractors_service_all ON public.site_meeting_contractors;
CREATE POLICY site_meeting_contractors_service_all ON public.site_meeting_contractors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_meeting_action_assignments_select ON public.site_meeting_action_assignments;
CREATE POLICY site_meeting_action_assignments_select ON public.site_meeting_action_assignments
  FOR SELECT TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS site_meeting_action_assignments_write ON public.site_meeting_action_assignments;
CREATE POLICY site_meeting_action_assignments_write ON public.site_meeting_action_assignments
  FOR ALL TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'meetings.manage'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_action_assignments_service_all ON public.site_meeting_action_assignments;
CREATE POLICY site_meeting_action_assignments_service_all ON public.site_meeting_action_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Published minutes: internal readers + contractors that attended (own vendor party row).
DROP POLICY IF EXISTS site_meeting_publications_select ON public.site_meeting_publications;
CREATE POLICY site_meeting_publications_select ON public.site_meeting_publications
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR app.site_meeting_external_attendee(meeting_id)
  );
DROP POLICY IF EXISTS site_meeting_publications_insert ON public.site_meeting_publications;
CREATE POLICY site_meeting_publications_insert ON public.site_meeting_publications
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_publications_service_all ON public.site_meeting_publications;
CREATE POLICY site_meeting_publications_service_all ON public.site_meeting_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_meeting_publication_actions_select ON public.site_meeting_publication_actions;
CREATE POLICY site_meeting_publication_actions_select ON public.site_meeting_publication_actions
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'project.view')
    OR (vendor_id IS NOT NULL AND app.external_has_scope(organization_id, project_id, vendor_id,
      subcontract_agreement_id, 'ext.project.view'))
  );
DROP POLICY IF EXISTS site_meeting_publication_actions_insert ON public.site_meeting_publication_actions;
CREATE POLICY site_meeting_publication_actions_insert ON public.site_meeting_publication_actions
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS site_meeting_publication_actions_service_all ON public.site_meeting_publication_actions;
CREATE POLICY site_meeting_publication_actions_service_all ON public.site_meeting_publication_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Legacy meeting tables: additive permissive policies for DG site meetings only.
DROP POLICY IF EXISTS meeting_records_dg_insert ON public.meeting_records;
CREATE POLICY meeting_records_dg_insert ON public.meeting_records
  FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL
    AND app.has_project_capability(organization_id, project_id, 'meetings.manage'));
DROP POLICY IF EXISTS meeting_records_dg_select ON public.meeting_records;
CREATE POLICY meeting_records_dg_select ON public.meeting_records
  FOR SELECT TO authenticated
  USING (app.site_meeting_has_capability(id, 'project.view'));
DROP POLICY IF EXISTS meeting_records_dg_update ON public.meeting_records;
CREATE POLICY meeting_records_dg_update ON public.meeting_records
  FOR UPDATE TO authenticated
  USING (app.site_meeting_has_capability(id, 'meetings.manage'))
  WITH CHECK (app.site_meeting_has_capability(id, 'meetings.manage'));

DROP POLICY IF EXISTS meeting_attendees_dg_select ON public.meeting_attendees;
CREATE POLICY meeting_attendees_dg_select ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'project.view'));
DROP POLICY IF EXISTS meeting_attendees_dg_write ON public.meeting_attendees;
CREATE POLICY meeting_attendees_dg_write ON public.meeting_attendees
  FOR ALL TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'meetings.manage'))
  WITH CHECK (app.site_meeting_has_capability(meeting_id, 'meetings.manage'));

DROP POLICY IF EXISTS meeting_decisions_dg_select ON public.meeting_decisions;
CREATE POLICY meeting_decisions_dg_select ON public.meeting_decisions
  FOR SELECT TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'project.view'));
DROP POLICY IF EXISTS meeting_decisions_dg_insert ON public.meeting_decisions;
CREATE POLICY meeting_decisions_dg_insert ON public.meeting_decisions
  FOR INSERT TO authenticated
  WITH CHECK (app.site_meeting_has_capability(meeting_id, 'meetings.manage'));
DROP POLICY IF EXISTS meeting_decisions_dg_update ON public.meeting_decisions;
CREATE POLICY meeting_decisions_dg_update ON public.meeting_decisions
  FOR UPDATE TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'meetings.manage'))
  WITH CHECK (app.site_meeting_has_capability(meeting_id, 'meetings.manage'));

DROP POLICY IF EXISTS meeting_action_items_dg_select ON public.meeting_action_items;
CREATE POLICY meeting_action_items_dg_select ON public.meeting_action_items
  FOR SELECT TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'project.view'));
DROP POLICY IF EXISTS meeting_action_items_dg_insert ON public.meeting_action_items;
CREATE POLICY meeting_action_items_dg_insert ON public.meeting_action_items
  FOR INSERT TO authenticated
  WITH CHECK (app.site_meeting_has_capability(meeting_id, 'meetings.manage'));
DROP POLICY IF EXISTS meeting_action_items_dg_update ON public.meeting_action_items;
CREATE POLICY meeting_action_items_dg_update ON public.meeting_action_items
  FOR UPDATE TO authenticated
  USING (app.site_meeting_has_capability(meeting_id, 'meetings.manage'))
  WITH CHECK (app.site_meeting_has_capability(meeting_id, 'meetings.manage'));

-- site_instructions: internal contractor.view reads, contractor.coordinate writes; the contractor
-- sees only its own vendor/agreement instructions (ext.site_instruction.ack).
DROP POLICY IF EXISTS site_instructions_select ON public.site_instructions;
CREATE POLICY site_instructions_select ON public.site_instructions
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'contractor.view')
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.site_instruction.ack')
  );
DROP POLICY IF EXISTS site_instructions_insert ON public.site_instructions;
CREATE POLICY site_instructions_insert ON public.site_instructions
  FOR INSERT TO authenticated
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS site_instructions_update ON public.site_instructions;
CREATE POLICY site_instructions_update ON public.site_instructions
  FOR UPDATE TO authenticated
  USING (app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS site_instructions_service_all ON public.site_instructions;
CREATE POLICY site_instructions_service_all ON public.site_instructions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_instruction_events_select ON public.site_instruction_events;
CREATE POLICY site_instruction_events_select ON public.site_instruction_events
  FOR SELECT TO authenticated
  USING (
    app.has_project_capability(organization_id, project_id, 'contractor.view')
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.site_instruction.ack')
  );
DROP POLICY IF EXISTS site_instruction_events_insert_internal ON public.site_instruction_events;
CREATE POLICY site_instruction_events_insert_internal ON public.site_instruction_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'internal'
    AND actor_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
  );
DROP POLICY IF EXISTS site_instruction_events_insert_external ON public.site_instruction_events;
CREATE POLICY site_instruction_events_insert_external ON public.site_instruction_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'external'
    AND actor_principal_id = app.external_principal_id()
    AND event_type IN ('acknowledged', 'performed', 'note')
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.site_instruction.ack')
  );
DROP POLICY IF EXISTS site_instruction_events_service_all ON public.site_instruction_events;
CREATE POLICY site_instruction_events_service_all ON public.site_instruction_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 6. Grants
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.site_daily_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_daily_log_entries TO authenticated;
GRANT SELECT, INSERT ON public.site_daily_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.site_meeting_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_meeting_contractors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_meeting_action_assignments TO authenticated;
GRANT SELECT, INSERT ON public.site_meeting_publications TO authenticated;
GRANT SELECT, INSERT ON public.site_meeting_publication_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.site_instructions TO authenticated;
GRANT SELECT, INSERT ON public.site_instruction_events TO authenticated;
GRANT ALL PRIVILEGES ON public.site_daily_logs TO service_role;
GRANT ALL PRIVILEGES ON public.site_daily_log_entries TO service_role;
GRANT ALL PRIVILEGES ON public.site_daily_reports TO service_role;
GRANT ALL PRIVILEGES ON public.site_meeting_details TO service_role;
GRANT ALL PRIVILEGES ON public.site_meeting_contractors TO service_role;
GRANT ALL PRIVILEGES ON public.site_meeting_action_assignments TO service_role;
GRANT ALL PRIVILEGES ON public.site_meeting_publications TO service_role;
GRANT ALL PRIVILEGES ON public.site_meeting_publication_actions TO service_role;
GRANT ALL PRIVILEGES ON public.site_instructions TO service_role;
GRANT ALL PRIVILEGES ON public.site_instruction_events TO service_role;
