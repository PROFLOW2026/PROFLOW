-- ProjectFlow — RLS hardening for authorization tables (security review LOW-16, LOW-18).
--
-- Tightens policies on roles, role_permissions, role_assignments, organizations
-- and audit_events so a member cannot mutate authorization state without the
-- matching permission. Organization founding still works: roles are provisioned
-- before any role assignment exists.

--------------------------------------------------------------------------------
-- 1. Permission helper
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
      AND rp.permission_key = required_permission
  );
$$;

CREATE OR REPLACE FUNCTION app.org_roles_unassigned(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.role_assignments ra WHERE ra.organization_id = org_id
  );
$$;

REVOKE ALL ON FUNCTION app.has_org_permission(uuid, text) FROM public;
REVOKE ALL ON FUNCTION app.org_roles_unassigned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.has_org_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.org_roles_unassigned(uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 2. Roles — replace generic tenant DML policies
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS roles_tenant_insert ON public.roles;
DROP POLICY IF EXISTS roles_tenant_update ON public.roles;
DROP POLICY IF EXISTS roles_tenant_delete ON public.roles;

CREATE POLICY roles_manage_insert ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'roles.manage')
      OR app.org_roles_unassigned(organization_id)
    )
  );

CREATE POLICY roles_manage_update ON public.roles
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

CREATE POLICY roles_manage_delete ON public.roles
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

--------------------------------------------------------------------------------
-- 3. Role permissions — replace generic tenant DML policies
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS role_permissions_tenant_insert ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_tenant_update ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_tenant_delete ON public.role_permissions;

CREATE POLICY role_permissions_manage_insert ON public.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'roles.manage')
      OR app.org_roles_unassigned(organization_id)
    )
  );

CREATE POLICY role_permissions_manage_update ON public.role_permissions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

CREATE POLICY role_permissions_manage_delete ON public.role_permissions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

--------------------------------------------------------------------------------
-- 4. Role assignments — replace generic tenant DML policies
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS role_assignments_tenant_insert ON public.role_assignments;
DROP POLICY IF EXISTS role_assignments_tenant_update ON public.role_assignments;
DROP POLICY IF EXISTS role_assignments_tenant_delete ON public.role_assignments;

CREATE POLICY role_assignments_manage_insert ON public.role_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'roles.manage')
      OR app.org_roles_unassigned(organization_id)
    )
  );

CREATE POLICY role_assignments_manage_update ON public.role_assignments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

CREATE POLICY role_assignments_manage_delete ON public.role_assignments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'roles.manage')
  );

--------------------------------------------------------------------------------
-- 5. Organizations — require org.update to mutate
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS organizations_member_update ON public.organizations;

CREATE POLICY organizations_manage_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (app.is_org_member(id) AND app.has_org_permission(id, 'org.update'))
  WITH CHECK (app.is_org_member(id) AND app.has_org_permission(id, 'org.update'));

--------------------------------------------------------------------------------
-- 6. Audit events — reject orphan rows with no tenant
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_member_insert ON public.audit_events;

CREATE POLICY audit_events_member_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND app.is_org_member(organization_id));
