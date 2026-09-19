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

ALTER TABLE public.org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_teams FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_teams_select ON public.org_teams;
CREATE POLICY org_teams_select ON public.org_teams
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_teams_insert ON public.org_teams;
CREATE POLICY org_teams_insert ON public.org_teams
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_teams_update ON public.org_teams;
CREATE POLICY org_teams_update ON public.org_teams
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_teams_delete ON public.org_teams;
CREATE POLICY org_teams_delete ON public.org_teams
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_teams_service_all ON public.org_teams;
CREATE POLICY org_teams_service_all ON public.org_teams AS PERMISSIVE
  FOR ALL TO service_role USING (true);

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

ALTER TABLE public.org_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_team_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_team_members_select ON public.org_team_members;
CREATE POLICY org_team_members_select ON public.org_team_members
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_team_members_insert ON public.org_team_members;
CREATE POLICY org_team_members_insert ON public.org_team_members
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_team_members_update ON public.org_team_members;
CREATE POLICY org_team_members_update ON public.org_team_members
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_team_members_delete ON public.org_team_members;
CREATE POLICY org_team_members_delete ON public.org_team_members
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_team_members_service_all ON public.org_team_members;
CREATE POLICY org_team_members_service_all ON public.org_team_members AS PERMISSIVE
  FOR ALL TO service_role USING (true);

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

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_select ON public.workspaces;
CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspaces_insert ON public.workspaces;
CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspaces_update ON public.workspaces;
CREATE POLICY workspaces_update ON public.workspaces
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspaces_delete ON public.workspaces;
CREATE POLICY workspaces_delete ON public.workspaces
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspaces_service_all ON public.workspaces;
CREATE POLICY workspaces_service_all ON public.workspaces AS PERMISSIVE
  FOR ALL TO service_role USING (true);

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

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_members_select ON public.workspace_members;
CREATE POLICY workspace_members_select ON public.workspace_members
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspace_members_insert ON public.workspace_members;
CREATE POLICY workspace_members_insert ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspace_members_update ON public.workspace_members;
CREATE POLICY workspace_members_update ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspace_members_delete ON public.workspace_members;
CREATE POLICY workspace_members_delete ON public.workspace_members
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS workspace_members_service_all ON public.workspace_members;
CREATE POLICY workspace_members_service_all ON public.workspace_members AS PERMISSIVE
  FOR ALL TO service_role USING (true);

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

ALTER TABLE public.project_workspace_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workspace_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_workspace_links_select ON public.project_workspace_links;
CREATE POLICY project_workspace_links_select ON public.project_workspace_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND app.is_org_member(w.organization_id)
    )
  );

DROP POLICY IF EXISTS project_workspace_links_insert ON public.project_workspace_links;
CREATE POLICY project_workspace_links_insert ON public.project_workspace_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND app.is_org_member(w.organization_id)
    )
  );

DROP POLICY IF EXISTS project_workspace_links_update ON public.project_workspace_links;
CREATE POLICY project_workspace_links_update ON public.project_workspace_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND app.is_org_member(w.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND app.is_org_member(w.organization_id)
    )
  );

DROP POLICY IF EXISTS project_workspace_links_service_all ON public.project_workspace_links;
CREATE POLICY project_workspace_links_service_all ON public.project_workspace_links AS PERMISSIVE
  FOR ALL TO service_role USING (true);
