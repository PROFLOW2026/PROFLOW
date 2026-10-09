-- 0174: SEC-001 / SEC-002 / SEC-003 — align RLS and org permission helper with app gates.
-- PREPARED ONLY — Owner applies after review. Additive policy/helper replacement.
--
-- SEC-001: audit_events SELECT requires audit.read (not membership-only).
-- SEC-002: contracts SELECT requires contracts.read (org-wide OR project-scoped role) + 0051 project access.
-- SEC-003: has_org_permission counts only org-wide role assignments (project_id IS NULL).
-- Project-scoped RBAC uses app.has_project_permission(org, project_id, key).

--------------------------------------------------------------------------------
-- SEC-003 — org-wide permission helper
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.has_org_permission(org_id uuid, required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_assignments ra
    INNER JOIN public.role_permissions rp ON rp.role_id = ra.role_id
    WHERE ra.organization_id = org_id
      AND ra.user_id = app.current_user_id()
      AND ra.project_id IS NULL
      AND rp.permission_key = required_permission
  );
$$;

REVOKE ALL ON FUNCTION app.has_org_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_org_permission(uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Project-scoped RBAC (role_assignments.project_id = row project)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.has_project_permission(
  p_organization_id uuid,
  p_project_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.role_assignments ra
      INNER JOIN public.role_permissions rp ON rp.role_id = ra.role_id
      WHERE ra.organization_id = p_organization_id
        AND ra.user_id = app.current_user_id()
        AND ra.project_id = p_project_id
        AND rp.permission_key = p_permission
    );
$$;

REVOKE ALL ON FUNCTION app.has_project_permission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_project_permission(uuid, uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- SEC-001 — audit_events SELECT
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_member_select ON public.audit_events;
CREATE POLICY audit_events_member_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'audit.read')
  );

--------------------------------------------------------------------------------
-- SEC-002 — contracts SELECT (0051 project gate preserved)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS contracts_tenant_select ON public.contracts;
CREATE POLICY contracts_tenant_select ON public.contracts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'contracts.read')
      OR (
        project_id IS NOT NULL
        AND app.has_project_permission(organization_id, project_id, 'contracts.read')
      )
    )
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );
