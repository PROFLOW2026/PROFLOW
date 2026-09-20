-- Universal Work Management: Teams, Workspaces, Workspace Members, Project-Workspace Links.
-- Migration N+1 (0097). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0096.

--------------------------------------------------------------------------------
-- 1. Enums
--------------------------------------------------------------------------------

CREATE TYPE public.workspace_type AS ENUM ('project_linked', 'org_internal', 'team');
CREATE TYPE public.workspace_visibility AS ENUM ('organization', 'restricted', 'team');
CREATE TYPE public.workspace_member_access_level AS ENUM ('viewer', 'contributor', 'manager');

--------------------------------------------------------------------------------
-- 2. org_teams
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  manager_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_teams_org_name_uq UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS org_teams_org_idx ON public.org_teams (organization_id);

-- org_teams RLS installed in section 9 (after UWM authorization helpers)

--------------------------------------------------------------------------------
-- 3. org_team_members
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_team_id uuid NOT NULL REFERENCES public.org_teams (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_team_members_exactly_one_actor CHECK (
    (org_member_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS org_team_members_team_idx ON public.org_team_members (org_team_id);
CREATE INDEX IF NOT EXISTS org_team_members_org_member_idx ON public.org_team_members (org_member_id);
CREATE INDEX IF NOT EXISTS org_team_members_employee_idx ON public.org_team_members (employee_id);

-- org_team_members RLS installed in section 9 (after UWM authorization helpers)

--------------------------------------------------------------------------------
-- 4. workspaces
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  workspace_type public.workspace_type NOT NULL,
  workspace_visibility public.workspace_visibility NOT NULL DEFAULT 'organization',
  org_team_id uuid REFERENCES public.org_teams (id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  is_read_only boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_team_requires_org_team_id CHECK (
    workspace_type <> 'team' OR org_team_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS workspaces_org_type_idx
  ON public.workspaces (organization_id, workspace_type, workspace_visibility);
CREATE INDEX IF NOT EXISTS workspaces_org_team_idx
  ON public.workspaces (org_team_id) WHERE org_team_id IS NOT NULL;

-- workspaces RLS installed in section 9 (after UWM access helpers)

--------------------------------------------------------------------------------
-- 5. workspace_members
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  access_level public.workspace_member_access_level NOT NULL DEFAULT 'contributor',
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  CONSTRAINT workspace_members_exactly_one_actor CHECK (
    (org_member_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON public.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_org_member_idx ON public.workspace_members (org_member_id, workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_employee_idx ON public.workspace_members (employee_id);

-- workspace_members RLS installed in section 9 (after UWM access helpers)

--------------------------------------------------------------------------------
-- 6. project_workspace_links (sole source of truth — no project_id on workspaces)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_workspace_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  relationship_role text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  link_closed_at timestamptz,
  CONSTRAINT project_workspace_links_uq UNIQUE (workspace_id, project_id)
);

CREATE INDEX IF NOT EXISTS project_workspace_links_project_idx ON public.project_workspace_links (project_id);
CREATE INDEX IF NOT EXISTS project_workspace_links_workspace_idx ON public.project_workspace_links (workspace_id);

--------------------------------------------------------------------------------
-- 7. Tenant integrity — workspace and project must share organization
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.project_workspace_links_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_ws_org uuid;
  v_proj_org uuid;
BEGIN
  SELECT w.organization_id INTO v_ws_org
  FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  SELECT p.organization_id INTO v_proj_org
  FROM public.projects p WHERE p.id = NEW.project_id;
  IF v_ws_org IS NULL OR v_proj_org IS NULL OR v_ws_org <> v_proj_org THEN
    RAISE EXCEPTION 'project_workspace_links: workspace and project must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_workspace_links_tenant_guard ON public.project_workspace_links;
CREATE TRIGGER project_workspace_links_tenant_guard
  BEFORE INSERT OR UPDATE OF workspace_id, project_id
  ON public.project_workspace_links
  FOR EACH ROW EXECUTE FUNCTION app.project_workspace_links_tenant_guard();

--------------------------------------------------------------------------------
-- 8. UWM access + authorization helpers (V3.1 RLS predicates)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_current_org_member_id(p_organization_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT om.id
  FROM public.organization_memberships om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = app.current_user_id()
    AND om.status = 'active'
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_current_employee_id(p_organization_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT e.id
  FROM public.employees e
  WHERE e.organization_id = p_organization_id
    AND e.user_id = app.current_user_id()
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION app.employee_permission_scope(
  p_organization_id uuid,
  p_permission_key text
)
RETURNS public.permission_scope
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT epg.scope
  FROM public.employee_permission_grants epg
  WHERE epg.organization_id = p_organization_id
    AND epg.employee_id = app.linked_employee_id(p_organization_id)
    AND epg.permission_key = p_permission_key
    AND epg.granted = true
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION app.has_employee_permission(
  p_organization_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.employee_permission_scope(p_organization_id, p_permission_key) IS NOT NULL;
$fn$;

-- Current employee project assignment (date-bounded in organization timezone).
CREATE OR REPLACE FUNCTION app.uwm_employee_project_assignment_is_current(
  p_organization_id uuid,
  p_employee_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_project_assignments epa
    WHERE epa.organization_id = p_organization_id
      AND epa.employee_id = p_employee_id
      AND epa.project_id = p_project_id
      AND epa.status = 'active'
      AND epa.start_date <= app.organization_business_date(p_organization_id)
      AND (
        epa.end_date IS NULL
        OR epa.end_date >= app.organization_business_date(p_organization_id)
      )
  );
$fn$;

-- Employee App project context: active assignment satisfies UWM project-linked access
-- even when organization project_access_mode = selected (can_access_project alone does not).
CREATE OR REPLACE FUNCTION app.uwm_employee_assigned_to_project(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_employee_project_assignment_is_current(
    p_organization_id,
    app.linked_employee_id(p_organization_id),
    p_project_id
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_access_project_context(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.can_access_project(p_organization_id, p_project_id)
      OR app.uwm_employee_assigned_to_project(p_organization_id, p_project_id);
$fn$;

-- Organization-level workspaces.manage is the canonical admin override for workspace
-- structure management (boards/buckets/members) regardless of workspace_members row.
CREATE OR REPLACE FUNCTION app.uwm_has_workspace_admin_override(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
     AND app.has_org_permission(p_organization_id, 'workspaces.manage');
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_workspace_member_access_level(
  p_organization_id uuid,
  p_workspace_id uuid
)
RETURNS public.workspace_member_access_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_member uuid;
  v_employee uuid;
  v_level public.workspace_member_access_level;
  v_best public.workspace_member_access_level;
BEGIN
  v_member := app.uwm_current_org_member_id(p_organization_id);
  v_employee := app.uwm_current_employee_id(p_organization_id);
  v_best := NULL;

  IF v_member IS NOT NULL THEN
    SELECT wm.access_level INTO v_level
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.organization_id = p_organization_id
      AND wm.org_member_id = v_member
    LIMIT 1;
    v_best := v_level;
  END IF;

  IF v_employee IS NOT NULL THEN
    SELECT wm.access_level INTO v_level
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.organization_id = p_organization_id
      AND wm.employee_id = v_employee
    LIMIT 1;
    IF v_best IS NULL THEN
      v_best := v_level;
    ELSIF v_level = 'manager' THEN
      v_best := 'manager';
    ELSIF v_level = 'contributor' AND v_best = 'viewer' THEN
      v_best := 'contributor';
    END IF;
  END IF;

  RETURN v_best;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_workspace_is_mutable(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT NOT w.is_read_only
      FROM public.workspaces w
      WHERE w.id = p_workspace_id
    ),
    false
  );
$fn$;

-- Stub until 0111 adds projects.is_read_only; replaced there with closeout semantics.
CREATE OR REPLACE FUNCTION app.uwm_project_is_mutable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT true;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_task_context_is_mutable(
  p_workspace_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_workspace_is_mutable(p_workspace_id)
     AND app.uwm_project_is_mutable(p_project_id);
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_workspace_allows_contribute(
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
DECLARE
  w public.workspaces%ROWTYPE;
  v_level public.workspace_member_access_level;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF app.uwm_has_workspace_admin_override(p_organization_id) THEN
    RETURN true;
  END IF;

  v_level := app.uwm_workspace_member_access_level(p_organization_id, p_workspace_id);
  IF v_level IN ('contributor', 'manager') THEN
    RETURN true;
  END IF;
  IF v_level = 'viewer' THEN
    RETURN false;
  END IF;

  SELECT * INTO w
  FROM public.workspaces
  WHERE id = p_workspace_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF w.workspace_type = 'project_linked'
     AND w.workspace_visibility <> 'restricted'
     AND p_project_id IS NOT NULL THEN
    RETURN app.uwm_can_access_project_context(p_organization_id, p_project_id)
      AND EXISTS (
        SELECT 1
        FROM public.project_workspace_links pwl
        WHERE pwl.workspace_id = p_workspace_id
          AND pwl.project_id = p_project_id
      );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_workspace_allows_structure_manage(
  p_organization_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_level public.workspace_member_access_level;
BEGIN
  IF app.uwm_has_workspace_admin_override(p_organization_id) THEN
    RETURN true;
  END IF;

  v_level := app.uwm_workspace_member_access_level(p_organization_id, p_workspace_id);
  RETURN v_level = 'manager';
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_has_permission(
  p_organization_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.has_org_permission(p_organization_id, p_permission_key)
      OR app.has_employee_permission(p_organization_id, p_permission_key);
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_has_tasks_read(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_has_permission(p_organization_id, 'tasks.read')
      OR app.uwm_has_permission(p_organization_id, 'tasks.manage_all');
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_has_base_workspace_access(
  p_organization_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  w public.workspaces%ROWTYPE;
  v_member uuid;
  v_employee uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;
  IF app.has_org_permission(p_organization_id, 'workspaces.manage') THEN
    RETURN true;
  END IF;

  SELECT * INTO w
  FROM public.workspaces
  WHERE id = p_workspace_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_member := app.uwm_current_org_member_id(p_organization_id);
  v_employee := app.uwm_current_employee_id(p_organization_id);

  IF EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.organization_id = p_organization_id
      AND (
        (v_member IS NOT NULL AND wm.org_member_id = v_member)
        OR (v_employee IS NOT NULL AND wm.employee_id = v_employee)
      )
  ) THEN
    RETURN true;
  END IF;

  IF w.workspace_type = 'org_internal' AND w.workspace_visibility = 'organization' THEN
    IF app.uwm_has_tasks_read(p_organization_id) THEN
      RETURN true;
    END IF;
  END IF;

  IF (w.workspace_type = 'team' OR w.workspace_visibility = 'team')
     AND w.org_team_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.org_team_members otm
      WHERE otm.org_team_id = w.org_team_id
        AND otm.organization_id = p_organization_id
        AND (
          (v_member IS NOT NULL AND otm.org_member_id = v_member)
          OR (v_employee IS NOT NULL AND otm.employee_id = v_employee)
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_discover_workspace(
  p_organization_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  w public.workspaces%ROWTYPE;
BEGIN
  IF app.uwm_has_base_workspace_access(p_organization_id, p_workspace_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO w
  FROM public.workspaces
  WHERE id = p_workspace_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF w.workspace_type = 'project_linked' THEN
    IF EXISTS (
      SELECT 1
      FROM public.project_workspace_links pwl
      WHERE pwl.workspace_id = p_workspace_id
        AND app.uwm_can_access_project_context(p_organization_id, pwl.project_id)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_access_workspace_content(
  p_organization_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_has_base_workspace_access(p_organization_id, p_workspace_id);
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_has_workspace_content_access(
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
DECLARE
  w public.workspaces%ROWTYPE;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF p_project_id IS NOT NULL THEN
    IF NOT app.uwm_can_access_project_context(p_organization_id, p_project_id) THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_workspace_links pwl
      WHERE pwl.workspace_id = p_workspace_id
        AND pwl.project_id = p_project_id
    ) THEN
      RETURN false;
    END IF;
    IF app.uwm_has_base_workspace_access(p_organization_id, p_workspace_id) THEN
      RETURN true;
    END IF;
    SELECT * INTO w
    FROM public.workspaces
    WHERE id = p_workspace_id AND organization_id = p_organization_id;
    IF FOUND
       AND w.workspace_type = 'project_linked'
       AND w.workspace_visibility <> 'restricted' THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN app.uwm_can_access_workspace_content(p_organization_id, p_workspace_id);
END;
$fn$;

-- uwm_can_read_task + employee/task-id helpers installed in 0100 (require tasks table)

CREATE OR REPLACE FUNCTION app.uwm_can_manage_workspace(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
     AND app.has_org_permission(p_organization_id, 'workspaces.manage');
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_manage_workspace_id(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_manage_workspace(w.organization_id)
         AND app.uwm_can_discover_workspace(w.organization_id, w.id)
         AND app.uwm_workspace_allows_structure_manage(w.organization_id, w.id)
         AND app.uwm_workspace_is_mutable(w.id)
      FROM public.workspaces w
      WHERE w.id = p_workspace_id
    ),
    false
  );
$fn$;

-- uwm_can_create_task + employee scope helpers installed in 0100 (require tasks tables)

CREATE OR REPLACE FUNCTION app.uwm_can_manage_task_recurrence(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.uwm_has_permission(p_organization_id, 'tasks.create')
      OR app.uwm_has_permission(p_organization_id, 'tasks.update')
      OR app.uwm_has_permission(p_organization_id, 'tasks.manage_all');
$fn$;

REVOKE ALL ON FUNCTION app.uwm_current_org_member_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_current_employee_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.has_employee_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.employee_permission_scope(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_employee_project_assignment_is_current(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_employee_assigned_to_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_access_project_context(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_has_workspace_admin_override(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_workspace_member_access_level(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_workspace_is_mutable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_project_is_mutable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_task_context_is_mutable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_workspace_allows_contribute(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_workspace_allows_structure_manage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_has_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_has_tasks_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_has_base_workspace_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_discover_workspace(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_access_workspace_content(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_has_workspace_content_access(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_manage_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_manage_workspace_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_manage_task_recurrence(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.uwm_current_org_member_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_current_employee_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.has_employee_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.employee_permission_scope(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_employee_project_assignment_is_current(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_employee_assigned_to_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_access_project_context(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_has_workspace_admin_override(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_workspace_member_access_level(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_workspace_is_mutable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_project_is_mutable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_task_context_is_mutable(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_workspace_allows_contribute(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_workspace_allows_structure_manage(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_has_tasks_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_has_base_workspace_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_discover_workspace(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_access_workspace_content(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_has_workspace_content_access(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_manage_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_manage_workspace_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_manage_task_recurrence(uuid) TO authenticated, service_role;

ALTER TABLE public.project_workspace_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workspace_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_workspace_links_select ON public.project_workspace_links;
CREATE POLICY project_workspace_links_select ON public.project_workspace_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND app.uwm_can_discover_workspace(w.organization_id, w.id)
    )
  );

DROP POLICY IF EXISTS project_workspace_links_insert ON public.project_workspace_links;
CREATE POLICY project_workspace_links_insert ON public.project_workspace_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND app.is_org_member(w.organization_id)
        AND app.has_org_permission(w.organization_id, 'workspaces.manage')
    )
  );

DROP POLICY IF EXISTS project_workspace_links_update ON public.project_workspace_links;
CREATE POLICY project_workspace_links_update ON public.project_workspace_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND app.is_org_member(w.organization_id)
        AND app.has_org_permission(w.organization_id, 'workspaces.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND app.is_org_member(w.organization_id)
        AND app.has_org_permission(w.organization_id, 'workspaces.manage')
    )
  );

DROP POLICY IF EXISTS project_workspace_links_service_all ON public.project_workspace_links;
CREATE POLICY project_workspace_links_service_all ON public.project_workspace_links AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 9. org teams + workspaces RLS (requires section 8 helpers)
--------------------------------------------------------------------------------

ALTER TABLE public.org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_teams FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_teams_select ON public.org_teams;
CREATE POLICY org_teams_select ON public.org_teams
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_teams_insert ON public.org_teams;
CREATE POLICY org_teams_insert ON public.org_teams
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_teams_update ON public.org_teams;
CREATE POLICY org_teams_update ON public.org_teams
  FOR UPDATE TO authenticated
  USING (app.uwm_can_manage_workspace(organization_id))
  WITH CHECK (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_teams_delete ON public.org_teams;
CREATE POLICY org_teams_delete ON public.org_teams
  FOR DELETE TO authenticated
  USING (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_teams_service_all ON public.org_teams;
CREATE POLICY org_teams_service_all ON public.org_teams AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.org_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_team_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_team_members_select ON public.org_team_members;
CREATE POLICY org_team_members_select ON public.org_team_members
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_team_members_insert ON public.org_team_members;
CREATE POLICY org_team_members_insert ON public.org_team_members
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_team_members_update ON public.org_team_members;
CREATE POLICY org_team_members_update ON public.org_team_members
  FOR UPDATE TO authenticated
  USING (app.uwm_can_manage_workspace(organization_id))
  WITH CHECK (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_team_members_delete ON public.org_team_members;
CREATE POLICY org_team_members_delete ON public.org_team_members
  FOR DELETE TO authenticated
  USING (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS org_team_members_service_all ON public.org_team_members;
CREATE POLICY org_team_members_service_all ON public.org_team_members AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_select ON public.workspaces;
CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT TO authenticated
  USING (app.uwm_can_discover_workspace(organization_id, id));

DROP POLICY IF EXISTS workspaces_insert ON public.workspaces;
CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_manage_workspace(organization_id));

DROP POLICY IF EXISTS workspaces_update ON public.workspaces;
CREATE POLICY workspaces_update ON public.workspaces
  FOR UPDATE TO authenticated
  USING (app.uwm_can_manage_workspace_id(id))
  WITH CHECK (app.uwm_can_manage_workspace_id(id));

DROP POLICY IF EXISTS workspaces_delete ON public.workspaces;
CREATE POLICY workspaces_delete ON public.workspaces
  FOR DELETE TO authenticated
  USING (app.uwm_can_manage_workspace_id(id));

DROP POLICY IF EXISTS workspaces_service_all ON public.workspaces;
CREATE POLICY workspaces_service_all ON public.workspaces AS PERMISSIVE
  FOR ALL TO service_role USING (true);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_members_select ON public.workspace_members;
CREATE POLICY workspace_members_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (app.uwm_can_discover_workspace(organization_id, workspace_id));

DROP POLICY IF EXISTS workspace_members_insert ON public.workspace_members;
CREATE POLICY workspace_members_insert ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_manage_workspace_id(workspace_id));

DROP POLICY IF EXISTS workspace_members_update ON public.workspace_members;
CREATE POLICY workspace_members_update ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (app.uwm_can_manage_workspace_id(workspace_id))
  WITH CHECK (app.uwm_can_manage_workspace_id(workspace_id));

DROP POLICY IF EXISTS workspace_members_delete ON public.workspace_members;
CREATE POLICY workspace_members_delete ON public.workspace_members
  FOR DELETE TO authenticated
  USING (app.uwm_can_manage_workspace_id(workspace_id));

DROP POLICY IF EXISTS workspace_members_service_all ON public.workspace_members;
CREATE POLICY workspace_members_service_all ON public.workspace_members AS PERMISSIVE
  FOR ALL TO service_role USING (true);
