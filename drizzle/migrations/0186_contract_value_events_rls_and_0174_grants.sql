-- 0186: contract_value_events SELECT RLS + UWM parity for 0174 policies (S02 / OD-48, OD-49).
-- Pending journal (Gate B). Policies only; no DML.

DROP POLICY IF EXISTS contract_value_events_tenant_select ON public.contract_value_events;
CREATE POLICY contract_value_events_tenant_select ON public.contract_value_events
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'contracts.read')
      OR app.uwm_has_permission(organization_id, 'project_financials.read')
      OR (
        project_id IS NOT NULL
        AND app.has_project_permission(organization_id, project_id, 'contracts.read')
      )
    )
    AND (
      project_id IS NULL
      OR app.uwm_can_access_project_context(organization_id, project_id)
    )
  );

DROP POLICY IF EXISTS contracts_tenant_select ON public.contracts;
CREATE POLICY contracts_tenant_select ON public.contracts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'contracts.read')
      OR (
        project_id IS NOT NULL
        AND app.has_project_permission(organization_id, project_id, 'contracts.read')
      )
    )
    AND (
      project_id IS NULL
      OR app.uwm_can_access_project_context(organization_id, project_id)
    )
  );

DROP POLICY IF EXISTS audit_events_member_select ON public.audit_events;
CREATE POLICY audit_events_member_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'audit.read')
  );
