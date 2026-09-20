-- Universal Work Management: Meeting Records, Attendees, Decisions, Action Items.
-- Migration N+10 (0106). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0105.

--------------------------------------------------------------------------------
-- 1. meeting_records
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces (id) ON DELETE SET NULL,
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  location text,
  notes text,
  created_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_records_org_idx ON public.meeting_records (organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS meeting_records_project_idx ON public.meeting_records (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meeting_records_workspace_idx ON public.meeting_records (workspace_id) WHERE workspace_id IS NOT NULL;

-- meeting_records RLS installed in section 5 (after meeting access helpers)

--------------------------------------------------------------------------------
-- 2. meeting_attendees (structured; at least one identity field)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.client_contacts (id) ON DELETE SET NULL,
  display_name text,
  CONSTRAINT meeting_attendees_at_least_one CHECK (
    (org_member_id IS NOT NULL)::int
    + (employee_id IS NOT NULL)::int
    + (contact_id IS NOT NULL)::int
    + (display_name IS NOT NULL)::int >= 1
  )
);

CREATE INDEX IF NOT EXISTS meeting_attendees_meeting_idx ON public.meeting_attendees (meeting_id);

-- meeting_attendees RLS installed in section 5

--------------------------------------------------------------------------------
-- 3. meeting_decisions (canonical — distinct from tasks)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  decided_at timestamptz,
  decided_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  decided_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_decisions_decider_at_most_one CHECK (
    (decided_by_org_member_id IS NOT NULL)::int + (decided_by_employee_id IS NOT NULL)::int <= 1
  )
);

CREATE INDEX IF NOT EXISTS meeting_decisions_meeting_idx ON public.meeting_decisions (meeting_id);

-- meeting_decisions RLS installed in section 5

--------------------------------------------------------------------------------
-- 4. meeting_action_items (may link/create tasks; decision ≠ task)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  decision_id uuid REFERENCES public.meeting_decisions (id) ON DELETE SET NULL,
  title text NOT NULL,
  assigned_to_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  assigned_to_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  due_date date,
  task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_action_items_status_known CHECK (status IN ('open', 'done', 'cancelled')),
  CONSTRAINT meeting_action_items_assignee_at_most_one CHECK (
    (assigned_to_org_member_id IS NOT NULL)::int + (assigned_to_employee_id IS NOT NULL)::int <= 1
  )
);

CREATE INDEX IF NOT EXISTS meeting_action_items_meeting_idx ON public.meeting_action_items (meeting_id);

--------------------------------------------------------------------------------
-- 5. Meeting access helpers + RLS (inherits workspace/project task access model)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_can_read_meeting(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT (
    app.uwm_has_permission(p_organization_id, 'meetings.read')
    OR app.uwm_has_permission(p_organization_id, 'meetings.manage')
  ) THEN
    RETURN false;
  END IF;

  IF p_workspace_id IS NOT NULL THEN
    RETURN app.uwm_has_workspace_content_access(
      p_organization_id, p_workspace_id, p_project_id
    );
  END IF;

  IF p_project_id IS NOT NULL THEN
    RETURN app.can_access_project(p_organization_id, p_project_id);
  END IF;

  RETURN app.uwm_has_permission(p_organization_id, 'meetings.manage');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_manage_meeting(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_has_permission(p_organization_id, 'meetings.manage')
     AND app.uwm_can_read_meeting(p_organization_id, p_workspace_id, p_project_id);
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_manage_meeting_id(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_manage_meeting(
        m.organization_id, m.workspace_id, m.project_id
      )
      FROM public.meeting_records m
      WHERE m.id = p_meeting_id
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_read_meeting_id(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_read_meeting(m.organization_id, m.workspace_id, m.project_id)
      FROM public.meeting_records m
      WHERE m.id = p_meeting_id
    ),
    false
  );
$fn$;

REVOKE ALL ON FUNCTION app.uwm_can_read_meeting(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_manage_meeting(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_read_meeting_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_manage_meeting_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uwm_can_read_meeting(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_manage_meeting(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_read_meeting_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_manage_meeting_id(uuid) TO authenticated, service_role;

ALTER TABLE public.meeting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_records_select ON public.meeting_records;
CREATE POLICY meeting_records_select ON public.meeting_records
  FOR SELECT TO authenticated
  USING (app.uwm_can_read_meeting(organization_id, workspace_id, project_id));

DROP POLICY IF EXISTS meeting_records_insert ON public.meeting_records;
CREATE POLICY meeting_records_insert ON public.meeting_records
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_manage_meeting(organization_id, workspace_id, project_id));

DROP POLICY IF EXISTS meeting_records_update ON public.meeting_records;
CREATE POLICY meeting_records_update ON public.meeting_records
  FOR UPDATE TO authenticated
  USING (app.uwm_can_manage_meeting(organization_id, workspace_id, project_id))
  WITH CHECK (app.uwm_can_manage_meeting(organization_id, workspace_id, project_id));

DROP POLICY IF EXISTS meeting_records_service_all ON public.meeting_records;
CREATE POLICY meeting_records_service_all ON public.meeting_records AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_attendees_select ON public.meeting_attendees;
CREATE POLICY meeting_attendees_select ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_attendees_insert ON public.meeting_attendees;
CREATE POLICY meeting_attendees_insert ON public.meeting_attendees
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_attendees_update ON public.meeting_attendees;
CREATE POLICY meeting_attendees_update ON public.meeting_attendees
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_manage_meeting_id(meeting_id))
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_attendees_delete ON public.meeting_attendees;
CREATE POLICY meeting_attendees_delete ON public.meeting_attendees
  FOR DELETE TO authenticated
  USING (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_attendees_service_all ON public.meeting_attendees;
CREATE POLICY meeting_attendees_service_all ON public.meeting_attendees AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_decisions_select ON public.meeting_decisions;
CREATE POLICY meeting_decisions_select ON public.meeting_decisions
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_decisions_insert ON public.meeting_decisions;
CREATE POLICY meeting_decisions_insert ON public.meeting_decisions
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_decisions_update ON public.meeting_decisions;
CREATE POLICY meeting_decisions_update ON public.meeting_decisions
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_manage_meeting_id(meeting_id))
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_decisions_service_all ON public.meeting_decisions;
CREATE POLICY meeting_decisions_service_all ON public.meeting_decisions AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_action_items_select ON public.meeting_action_items;
CREATE POLICY meeting_action_items_select ON public.meeting_action_items
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_action_items_insert ON public.meeting_action_items;
CREATE POLICY meeting_action_items_insert ON public.meeting_action_items
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_action_items_update ON public.meeting_action_items;
CREATE POLICY meeting_action_items_update ON public.meeting_action_items
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_manage_meeting_id(meeting_id))
  WITH CHECK (app.uwm_user_can_manage_meeting_id(meeting_id));

DROP POLICY IF EXISTS meeting_action_items_service_all ON public.meeting_action_items;
CREATE POLICY meeting_action_items_service_all ON public.meeting_action_items AS PERMISSIVE
  FOR ALL TO service_role USING (true);
