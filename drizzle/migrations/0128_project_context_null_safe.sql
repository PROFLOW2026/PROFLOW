-- 0128: Project context must deny when an employee-scope predicate is NULL.
-- Migration after 0127. Do not modify migrations 0000–0127.
--
-- PURPOSE
-- ───────
-- 0124 ORs employee_permission_scope(...) = 'all_organization' into
-- app.uwm_can_access_project_context. With no employee grant that comparison
-- is NULL, and NULL OR false is NULL. PL/pgSQL `IF NOT NULL` does not take
-- the deny branch, so uwm_has_workspace_content_access then allowed every
-- non-restricted project-linked task. A member granted only Project A could
-- read Project B tasks in a shared workspace.
--
-- This keeps the 0124 employee all_organization / projects.access_all grants.
-- It forces every arm, and the function result, to a real boolean.

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
  SELECT COALESCE(app.can_access_project(p_organization_id, p_project_id), false)
      OR COALESCE(
        app.uwm_employee_assigned_to_project(p_organization_id, p_project_id),
        false
      )
      OR COALESCE(
        app.employee_permission_scope(p_organization_id, 'projects.read')
          = 'all_organization'::public.permission_scope,
        false
      )
      OR COALESCE(
        app.has_employee_permission(p_organization_id, 'projects.access_all'),
        false
      );
$fn$;

REVOKE ALL ON FUNCTION app.uwm_can_access_project_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uwm_can_access_project_context(uuid, uuid)
  TO authenticated, service_role;

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
    -- IS NOT TRUE treats NULL as deny. `IF NOT NULL` would fall through.
    IF app.uwm_can_access_project_context(p_organization_id, p_project_id) IS NOT TRUE THEN
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

REVOKE ALL ON FUNCTION app.uwm_has_workspace_content_access(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uwm_has_workspace_content_access(uuid, uuid, uuid)
  TO authenticated, service_role;
