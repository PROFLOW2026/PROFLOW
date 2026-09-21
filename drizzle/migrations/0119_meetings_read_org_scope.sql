-- 0119: Org-wide meetings — allow meetings.read (not only meetings.manage).
-- Migration after 0118. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0118.
--
-- 0106 uwm_can_read_meeting line 139 required meetings.manage for org-wide
-- meetings (no workspace/project). Read callers already passed meetings.read
-- at the top of the function; manage remains required for mutations via
-- uwm_can_manage_meeting.

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

  -- Org-wide meeting: caller already has meetings.read or meetings.manage.
  RETURN true;
END;
$fn$;
