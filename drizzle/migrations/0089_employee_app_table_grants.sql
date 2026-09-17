-- 0089: Employee App table privileges + linked-employee assignment read scope.
-- 0088 created RLS policies; this migration adds matching table GRANTs and fixes
-- employee_project_assignments visibility for grant-based Employee App users.
-- Do NOT modify 0088 (already applied).

--------------------------------------------------------------------------------
-- 1. Employee App tables — minimum privileges for authenticated + RLS
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_app_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_permission_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_document_category_grants TO authenticated;

-- Owner/admin read only via workforce.manage RLS; inserts use service_role/admin DB.
GRANT SELECT ON public.employee_app_audit_events TO authenticated;

--------------------------------------------------------------------------------
-- 2. Linked employee reads own active assignments (Employee App project scope)
--    tenant_select requires role permission (workforce.read / projects.read / …).
--    Employee App users may hold projects.read only in employee_permission_grants.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS employee_project_assignments_linked_self_select ON public.employee_project_assignments;

CREATE POLICY employee_project_assignments_linked_self_select ON public.employee_project_assignments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND employee_id = app.linked_employee_id(organization_id)
  );
