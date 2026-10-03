-- 0160: Developer / GC layer - contractor tasks (on the EXISTING tasks engine), contextual
-- discussions and the activity feed read model. Track G (registry `collab`).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 + 0155 only.
--
-- PURPOSE
--   1. tasks (id, organization_id) unique key so DG tables can use same-org composite FKs
--   2. task_external_assignments: 1:1 extension of tasks - contractor company / contractor user,
--      external lifecycle state, evidence requirement, operational links (location, work package,
--      work line). No second task engine: tasks.status is kept in sync by trigger.
--   3. task_external_events: append-only history of the external lifecycle (actor shape like 0155)
--   4. collab_comments: append-only contextual thread posts on any entity-access entity, audience
--      internal | contractor; formal decisions (kind = 'decision', internal only)
--   5. Additive RLS: project-capability holders (tasks.view / tasks.manage) on tasks, task_assignees,
--      task_activity; external principals read ONLY tasks assigned to their vendor within grant scope
--
-- COMPATIBILITY: additive. No existing column, policy or function is changed or dropped.
-- Existing policies stay; new permissive policies are OR-ed with them.

--------------------------------------------------------------------------------
-- 1. tasks composite key
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS tasks_id_organization_id_uq
  ON public.tasks (id, organization_id);

--------------------------------------------------------------------------------
-- 2. task_external_assignments
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_external_assignments (
  task_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  requires_evidence boolean NOT NULL DEFAULT false,
  location_id uuid,
  work_package_id uuid,
  subcontract_work_line_id uuid,
  cycle integer NOT NULL DEFAULT 1,
  last_outcome text,
  last_quality text,
  last_submitted_evidence_count integer,
  acknowledged_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  verified_at timestamptz,
  closed_at timestamptz,
  assigned_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_external_assignments_status_known CHECK (status IN (
    'assigned', 'acknowledged', 'in_progress', 'completion_submitted', 'resubmitted',
    'approved', 'rejected', 'rework_required', 'reopened', 'closed', 'cancelled'
  )),
  CONSTRAINT task_external_assignments_outcome_known CHECK (
    last_outcome IS NULL
    OR last_outcome IN ('approved', 'approved_with_remarks', 'rejected', 'rework_required')
  ),
  CONSTRAINT task_external_assignments_quality_known CHECK (
    last_quality IS NULL OR last_quality IN ('satisfactory', 'needs_attention', 'unacceptable')
  ),
  CONSTRAINT task_external_assignments_cycle_positive CHECK (cycle >= 1),
  CONSTRAINT task_external_assignments_line_needs_agreement CHECK (
    subcontract_work_line_id IS NULL OR subcontract_agreement_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS task_external_assignments_task_org_uq
  ON public.task_external_assignments (task_id, organization_id);
CREATE INDEX IF NOT EXISTS task_external_assignments_project_idx
  ON public.task_external_assignments (organization_id, project_id, status);
CREATE INDEX IF NOT EXISTS task_external_assignments_vendor_idx
  ON public.task_external_assignments (organization_id, vendor_id, status);
CREATE INDEX IF NOT EXISTS task_external_assignments_principal_idx
  ON public.task_external_assignments (principal_id) WHERE principal_id IS NOT NULL;

ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_task_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_task_fk
  FOREIGN KEY (task_id, organization_id)
  REFERENCES public.tasks (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_project_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_project_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_vendor_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_agreement_vendor_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id);
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_agreement_project_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id);
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_location_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_work_package_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL (work_package_id);
ALTER TABLE public.task_external_assignments DROP CONSTRAINT IF EXISTS task_external_assignments_work_line_fk;
ALTER TABLE public.task_external_assignments
  ADD CONSTRAINT task_external_assignments_work_line_fk
  FOREIGN KEY (subcontract_work_line_id, organization_id, subcontract_agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE SET NULL (subcontract_work_line_id);

-- The extension must describe the same project as the task itself, and a specific contractor
-- user must hold an active contractor grant for that vendor in this organization (and project).
CREATE OR REPLACE FUNCTION app.task_external_assignments_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = NEW.task_id
      AND t.organization_id = NEW.organization_id
      AND t.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'task_external_assignments: task must belong to the same project'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.principal_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
          OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.external_access_grants g
       WHERE g.principal_id = NEW.principal_id
         AND g.organization_id = NEW.organization_id
         AND g.portal_kind = 'contractor'
         AND g.status = 'active'
         AND g.revoked_at IS NULL
         AND g.vendor_id = NEW.vendor_id
         AND (g.project_id IS NULL OR g.project_id = NEW.project_id)
     ) THEN
    RAISE EXCEPTION 'task_external_assignments: contractor user has no grant for this contractor'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS task_external_assignments_integrity ON public.task_external_assignments;
CREATE TRIGGER task_external_assignments_integrity
  BEFORE INSERT OR UPDATE OF principal_id, vendor_id ON public.task_external_assignments
  FOR EACH ROW EXECUTE FUNCTION app.task_external_assignments_integrity();

-- Identity is frozen; an external caller may only move the lifecycle along contractor transitions
-- and may never touch assignment, verification or quality columns.
CREATE OR REPLACE FUNCTION app.task_external_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'task_external_assignments identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF app.external_principal_id() IS NOT NULL AND NOT app.is_org_member(NEW.organization_id) THEN
    IF (NEW.vendor_id, NEW.subcontract_agreement_id, NEW.principal_id, NEW.requires_evidence,
        NEW.location_id, NEW.work_package_id, NEW.subcontract_work_line_id, NEW.last_outcome,
        NEW.last_quality, NEW.verified_at, NEW.closed_at, NEW.assigned_by_user_id)
       IS DISTINCT FROM
       (OLD.vendor_id, OLD.subcontract_agreement_id, OLD.principal_id, OLD.requires_evidence,
        OLD.location_id, OLD.work_package_id, OLD.subcontract_work_line_id, OLD.last_outcome,
        OLD.last_quality, OLD.verified_at, OLD.closed_at, OLD.assigned_by_user_id) THEN
      RAISE EXCEPTION 'contractors may not change assignment or verification fields'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'assigned' AND NEW.status = 'acknowledged')
      OR (OLD.status IN ('acknowledged', 'reopened') AND NEW.status = 'in_progress')
      OR (OLD.status IN ('in_progress', 'reopened') AND NEW.status IN ('completion_submitted', 'resubmitted'))
      OR (OLD.status IN ('rejected', 'rework_required') AND NEW.status = 'reopened')
    ) THEN
      RAISE EXCEPTION 'contractor transition % -> % is not allowed', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.cycle <> OLD.cycle AND NOT (NEW.status = 'reopened' AND NEW.cycle = OLD.cycle + 1) THEN
      RAISE EXCEPTION 'contractors may not change the work cycle' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS task_external_assignments_guard ON public.task_external_assignments;
CREATE TRIGGER task_external_assignments_guard
  BEFORE UPDATE ON public.task_external_assignments
  FOR EACH ROW EXECUTE FUNCTION app.task_external_assignments_guard();

-- Keep the canonical task status meaningful for boards / lists / My Work.
CREATE OR REPLACE FUNCTION app.task_external_assignments_sync_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status public.task_status;
BEGIN
  v_status := CASE NEW.status
    WHEN 'assigned' THEN 'todo'
    WHEN 'acknowledged' THEN 'todo'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'reopened' THEN 'in_progress'
    WHEN 'rejected' THEN 'in_progress'
    WHEN 'rework_required' THEN 'in_progress'
    WHEN 'completion_submitted' THEN 'in_review'
    WHEN 'resubmitted' THEN 'in_review'
    WHEN 'approved' THEN 'in_review'
    WHEN 'closed' THEN 'done'
    WHEN 'cancelled' THEN 'cancelled'
  END::public.task_status;

  UPDATE public.tasks t
  SET status = v_status,
      completion_date = CASE
        WHEN v_status = 'done' THEN COALESCE(t.completion_date, current_date)
        WHEN v_status IN ('todo', 'in_progress', 'in_review') THEN NULL
        ELSE t.completion_date
      END,
      updated_at = now()
  WHERE t.id = NEW.task_id
    AND t.organization_id = NEW.organization_id
    AND t.status IS DISTINCT FROM v_status;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS task_external_assignments_sync_task ON public.task_external_assignments;
CREATE TRIGGER task_external_assignments_sync_task
  AFTER INSERT OR UPDATE OF status ON public.task_external_assignments
  FOR EACH ROW EXECUTE FUNCTION app.task_external_assignments_sync_task();

--------------------------------------------------------------------------------
-- 3. task_external_events (append-only history)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  outcome text,
  quality text,
  note text,
  evidence_count integer,
  cycle integer NOT NULL DEFAULT 1,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  -- clock_timestamp(): several steps may be appended in one transaction and must keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT task_external_events_action_known CHECK (action IN (
    'assigned', 'reassigned', 'acknowledged', 'started', 'completion_submitted', 'verified',
    'reopened', 'closed', 'cancelled'
  )),
  CONSTRAINT task_external_events_outcome_known CHECK (
    outcome IS NULL OR outcome IN ('approved', 'approved_with_remarks', 'rejected', 'rework_required')
  ),
  CONSTRAINT task_external_events_quality_known CHECK (
    quality IS NULL OR quality IN ('satisfactory', 'needs_attention', 'unacceptable')
  ),
  CONSTRAINT task_external_events_note_length CHECK (note IS NULL OR length(note) <= 4000),
  CONSTRAINT task_external_events_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.task_external_events DROP CONSTRAINT IF EXISTS task_external_events_assignment_fk;
ALTER TABLE public.task_external_events
  ADD CONSTRAINT task_external_events_assignment_fk
  FOREIGN KEY (task_id, organization_id)
  REFERENCES public.task_external_assignments (task_id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.task_external_events DROP CONSTRAINT IF EXISTS task_external_events_project_fk;
ALTER TABLE public.task_external_events
  ADD CONSTRAINT task_external_events_project_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS task_external_events_task_idx
  ON public.task_external_events (organization_id, task_id, created_at);
CREATE INDEX IF NOT EXISTS task_external_events_project_idx
  ON public.task_external_events (organization_id, project_id, created_at DESC);

-- Append-only. Deletion is only possible as a cascade of deleting the owning task / project / org
-- (pg_trigger_depth() > 1 inside a referential action).
CREATE OR REPLACE FUNCTION app.dg_collab_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS task_external_events_append_only ON public.task_external_events;
CREATE TRIGGER task_external_events_append_only
  BEFORE UPDATE OR DELETE ON public.task_external_events
  FOR EACH ROW EXECUTE FUNCTION app.dg_collab_append_only();

--------------------------------------------------------------------------------
-- 4. collab_comments (contextual threads, append-only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.collab_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  -- Scope copied from the entity-access resolver at post time (drives external visibility).
  vendor_id uuid,
  subcontract_agreement_id uuid,
  audience text NOT NULL DEFAULT 'internal',
  kind text NOT NULL DEFAULT 'comment',
  body text NOT NULL,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  -- clock_timestamp(): several steps may be appended in one transaction and must keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT collab_comments_entity_type_shape CHECK (entity_type ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT collab_comments_audience_known CHECK (audience IN ('internal', 'contractor')),
  CONSTRAINT collab_comments_kind_known CHECK (kind IN ('comment', 'decision')),
  CONSTRAINT collab_comments_body_length CHECK (length(btrim(body)) > 0 AND length(body) <= 8000),
  CONSTRAINT collab_comments_external_contractor_only CHECK (
    actor_type <> 'external' OR (audience = 'contractor' AND kind = 'comment' AND vendor_id IS NOT NULL)
  ),
  CONSTRAINT collab_comments_decision_internal CHECK (kind <> 'decision' OR actor_type = 'internal'),
  CONSTRAINT collab_comments_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.collab_comments DROP CONSTRAINT IF EXISTS collab_comments_project_fk;
ALTER TABLE public.collab_comments
  ADD CONSTRAINT collab_comments_project_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.collab_comments DROP CONSTRAINT IF EXISTS collab_comments_vendor_fk;
ALTER TABLE public.collab_comments
  ADD CONSTRAINT collab_comments_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);
ALTER TABLE public.collab_comments DROP CONSTRAINT IF EXISTS collab_comments_agreement_fk;
ALTER TABLE public.collab_comments
  ADD CONSTRAINT collab_comments_agreement_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id);

CREATE INDEX IF NOT EXISTS collab_comments_entity_idx
  ON public.collab_comments (organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS collab_comments_project_idx
  ON public.collab_comments (organization_id, project_id, created_at DESC);

DROP TRIGGER IF EXISTS collab_comments_append_only ON public.collab_comments;
CREATE TRIGGER collab_comments_append_only
  BEFORE UPDATE OR DELETE ON public.collab_comments
  FOR EACH ROW EXECUTE FUNCTION app.dg_collab_append_only();

--------------------------------------------------------------------------------
-- 5. Authorization helpers (SECURITY DEFINER: no policy recursion between tasks and extensions)
--------------------------------------------------------------------------------

-- Contractor may READ the task: assigned to its vendor and covered by a grant with a task capability.
CREATE OR REPLACE FUNCTION app.dg_external_can_see_task(p_organization_id uuid, p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.external_principal_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.task_external_assignments a
      WHERE a.task_id = p_task_id
        AND a.organization_id = p_organization_id
        AND (
          app.external_has_scope(a.organization_id, a.project_id, a.vendor_id,
            a.subcontract_agreement_id, 'ext.task.work')
          OR app.external_has_scope(a.organization_id, a.project_id, a.vendor_id,
            a.subcontract_agreement_id, 'ext.task.report')
        )
    )
$fn$;

-- Contractor may ACT on the task: ext.task.work and (company-wide assignment or assigned to them).
CREATE OR REPLACE FUNCTION app.dg_external_can_work_task(p_organization_id uuid, p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.external_principal_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.task_external_assignments a
      WHERE a.task_id = p_task_id
        AND a.organization_id = p_organization_id
        AND (a.principal_id IS NULL OR a.principal_id = app.external_principal_id())
        AND app.external_has_scope(a.organization_id, a.project_id, a.vendor_id,
          a.subcontract_agreement_id, 'ext.task.work')
    )
$fn$;

CREATE OR REPLACE FUNCTION app.dg_project_task_capability(p_task_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND t.project_id IS NOT NULL
      AND app.has_project_capability(t.organization_id, t.project_id, p_capability)
  )
$fn$;

-- Existence of a core foundation entity inside a project, for linking it to a task. Callers must hold
-- project.view on that project; only a boolean leaves the function (never money or other columns of
-- e.g. subcontract_agreements, whose own RLS is financial).
CREATE OR REPLACE FUNCTION app.dg_core_entity_in_project(
  p_entity_type text,
  p_organization_id uuid,
  p_project_id uuid,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.has_project_capability(p_organization_id, p_project_id, 'project.view') THEN
    RETURN false;
  END IF;
  RETURN CASE p_entity_type
    WHEN 'project' THEN p_entity_id = p_project_id
    WHEN 'vendor' THEN EXISTS (
      SELECT 1 FROM public.subcontract_agreements a
      WHERE a.organization_id = p_organization_id AND a.project_id = p_project_id
        AND a.vendor_id = p_entity_id)
    WHEN 'subcontract_agreement' THEN EXISTS (
      SELECT 1 FROM public.subcontract_agreements a
      WHERE a.id = p_entity_id AND a.organization_id = p_organization_id AND a.project_id = p_project_id)
    WHEN 'subcontract_work_line' THEN EXISTS (
      SELECT 1 FROM public.subcontract_work_lines l
      WHERE l.id = p_entity_id AND l.organization_id = p_organization_id AND l.project_id = p_project_id)
    WHEN 'project_location' THEN EXISTS (
      SELECT 1 FROM public.project_locations l
      WHERE l.id = p_entity_id AND l.organization_id = p_organization_id AND l.project_id = p_project_id)
    WHEN 'work_package' THEN EXISTS (
      SELECT 1 FROM public.work_packages w
      WHERE w.id = p_entity_id AND w.organization_id = p_organization_id AND w.project_id = p_project_id)
    ELSE false
  END;
END
$fn$;

REVOKE ALL ON FUNCTION app.dg_core_entity_in_project(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_core_entity_in_project(text, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.dg_external_can_see_task(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.dg_external_can_work_task(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.dg_project_task_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_external_can_see_task(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.dg_external_can_work_task(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.dg_project_task_capability(uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 6. RLS - new tables
--------------------------------------------------------------------------------

ALTER TABLE public.task_external_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_external_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_external_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.collab_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_external_assignments_select ON public.task_external_assignments;
CREATE POLICY task_external_assignments_select ON public.task_external_assignments
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'tasks.view'))
    OR app.dg_external_can_see_task(organization_id, task_id)
  );
DROP POLICY IF EXISTS task_external_assignments_insert ON public.task_external_assignments;
CREATE POLICY task_external_assignments_insert ON public.task_external_assignments
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'tasks.manage'));
DROP POLICY IF EXISTS task_external_assignments_update_internal ON public.task_external_assignments;
CREATE POLICY task_external_assignments_update_internal ON public.task_external_assignments
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'tasks.manage')
    OR app.has_project_capability(organization_id, project_id, 'progress.verify')))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'tasks.manage')
    OR app.has_project_capability(organization_id, project_id, 'progress.verify')));
DROP POLICY IF EXISTS task_external_assignments_update_external ON public.task_external_assignments;
CREATE POLICY task_external_assignments_update_external ON public.task_external_assignments
  FOR UPDATE TO authenticated
  USING (app.dg_external_can_work_task(organization_id, task_id))
  WITH CHECK (app.dg_external_can_work_task(organization_id, task_id));
DROP POLICY IF EXISTS task_external_assignments_service_all ON public.task_external_assignments;
CREATE POLICY task_external_assignments_service_all ON public.task_external_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS task_external_events_select ON public.task_external_events;
CREATE POLICY task_external_events_select ON public.task_external_events
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'tasks.view'))
    OR app.dg_external_can_see_task(organization_id, task_id)
  );
DROP POLICY IF EXISTS task_external_events_insert_internal ON public.task_external_events;
CREATE POLICY task_external_events_insert_internal ON public.task_external_events
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND actor_type = 'internal'
    AND actor_user_id = app.current_user_id()
    AND (app.has_project_capability(organization_id, project_id, 'tasks.manage')
      OR app.has_project_capability(organization_id, project_id, 'progress.verify')));
DROP POLICY IF EXISTS task_external_events_insert_external ON public.task_external_events;
CREATE POLICY task_external_events_insert_external ON public.task_external_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
    AND app.dg_external_can_work_task(organization_id, task_id));
DROP POLICY IF EXISTS task_external_events_service_all ON public.task_external_events;
CREATE POLICY task_external_events_service_all ON public.task_external_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Internal members read every post on entities of projects they can open (the application also
-- re-authorizes the entity through entity-access). Contractors read ONLY contractor-audience posts:
-- vendor-scoped posts need a grant on that vendor; vendor-less posts (shared project entities) need
-- project visibility. Internal-audience posts are never visible to an external principal.
DROP POLICY IF EXISTS collab_comments_select ON public.collab_comments;
CREATE POLICY collab_comments_select ON public.collab_comments
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND (project_id IS NULL OR app.can_access_project(organization_id, project_id)))
    OR (
      audience = 'contractor'
      AND NOT app.is_org_member(organization_id)
      AND (
        (vendor_id IS NOT NULL AND app.external_has_scope(organization_id, project_id, vendor_id,
          subcontract_agreement_id, 'ext.project.view'))
        OR (vendor_id IS NULL AND app.external_can_see_project(organization_id, project_id))
      )
    )
  );
DROP POLICY IF EXISTS collab_comments_insert_internal ON public.collab_comments;
CREATE POLICY collab_comments_insert_internal ON public.collab_comments
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND actor_type = 'internal'
    AND actor_user_id = app.current_user_id()
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id)));
DROP POLICY IF EXISTS collab_comments_insert_external ON public.collab_comments;
CREATE POLICY collab_comments_insert_external ON public.collab_comments
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
    AND audience = 'contractor' AND kind = 'comment' AND vendor_id IS NOT NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.thread.post'));
DROP POLICY IF EXISTS collab_comments_service_all ON public.collab_comments;
CREATE POLICY collab_comments_service_all ON public.collab_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.task_external_assignments TO authenticated;
GRANT SELECT, INSERT ON public.task_external_events TO authenticated;
GRANT SELECT, INSERT ON public.collab_comments TO authenticated;
GRANT ALL PRIVILEGES ON public.task_external_assignments TO service_role;
GRANT ALL PRIVILEGES ON public.task_external_events TO service_role;
GRANT ALL PRIVILEGES ON public.collab_comments TO service_role;

--------------------------------------------------------------------------------
-- 7. Additive RLS on the existing task engine
--------------------------------------------------------------------------------

-- Contractors read only tasks assigned to their vendor within grant scope.
DROP POLICY IF EXISTS tasks_select_dg_external ON public.tasks;
CREATE POLICY tasks_select_dg_external ON public.tasks
  FOR SELECT TO authenticated
  USING (app.dg_external_can_see_task(organization_id, id));

-- Project-capability holders (Developer / GC project team) work with project tasks.
DROP POLICY IF EXISTS tasks_select_project_capability ON public.tasks;
CREATE POLICY tasks_select_project_capability ON public.tasks
  FOR SELECT TO authenticated
  USING (project_id IS NOT NULL
    AND app.has_project_capability(organization_id, project_id, 'tasks.view'));
DROP POLICY IF EXISTS tasks_insert_project_capability ON public.tasks;
CREATE POLICY tasks_insert_project_capability ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL
    AND app.has_project_capability(organization_id, project_id, 'tasks.manage'));
DROP POLICY IF EXISTS tasks_update_project_capability ON public.tasks;
CREATE POLICY tasks_update_project_capability ON public.tasks
  FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL
    AND app.has_project_capability(organization_id, project_id, 'tasks.manage'))
  WITH CHECK (project_id IS NOT NULL
    AND app.has_project_capability(organization_id, project_id, 'tasks.manage'));

DROP POLICY IF EXISTS task_assignees_select_project_capability ON public.task_assignees;
CREATE POLICY task_assignees_select_project_capability ON public.task_assignees
  FOR SELECT TO authenticated
  USING (app.dg_project_task_capability(task_id, 'tasks.view'));
DROP POLICY IF EXISTS task_assignees_insert_project_capability ON public.task_assignees;
CREATE POLICY task_assignees_insert_project_capability ON public.task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (app.dg_project_task_capability(task_id, 'tasks.manage'));

DROP POLICY IF EXISTS task_activity_select_project_capability ON public.task_activity;
CREATE POLICY task_activity_select_project_capability ON public.task_activity
  FOR SELECT TO authenticated
  USING (app.dg_project_task_capability(task_id, 'tasks.view'));
DROP POLICY IF EXISTS task_activity_insert_project_capability ON public.task_activity;
CREATE POLICY task_activity_insert_project_capability ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK (app.dg_project_task_capability(task_id, 'tasks.manage'));
