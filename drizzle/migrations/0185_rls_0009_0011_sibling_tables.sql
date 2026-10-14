-- 0185: RLS hardening for 0009 / 0011 sibling tables (S01). Excludes inventory_* (OD-51 → 0192).
-- Pending journal (Gate B). Policies / helper only; no DML.

CREATE OR REPLACE FUNCTION app.custom_field_value_row_allowed(
  p_org uuid,
  p_definition_id uuid,
  p_entity_id uuid,
  p_for_write boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.custom_field_definitions d
    WHERE d.id = p_definition_id
      AND d.organization_id = p_org
      AND (
        (NOT p_for_write AND d.entity_type = 'client'
          AND app.uwm_has_permission(p_org, 'clients.read'))
        OR (p_for_write AND d.entity_type = 'client'
          AND app.uwm_has_permission(p_org, 'clients.manage'))
        OR (NOT p_for_write AND d.entity_type = 'project'
          AND app.uwm_has_permission(p_org, 'projects.read')
          AND app.uwm_can_access_project_context(p_org, p_entity_id))
        OR (p_for_write AND d.entity_type = 'project'
          AND app.uwm_has_permission(p_org, 'projects.update')
          AND app.uwm_can_access_project_context(p_org, p_entity_id))
        OR (NOT p_for_write AND d.entity_type = 'vendor'
          AND app.uwm_has_permission(p_org, 'vendors.read'))
        OR (p_for_write AND d.entity_type = 'vendor'
          AND app.uwm_has_permission(p_org, 'vendors.manage'))
        OR (NOT p_for_write AND d.entity_type = 'employee'
          AND app.uwm_has_permission(p_org, 'workforce.read'))
        OR (p_for_write AND d.entity_type = 'employee'
          AND app.uwm_has_permission(p_org, 'workforce.manage'))
        OR (NOT p_for_write AND d.entity_type = 'opportunity'
          AND app.uwm_has_permission(p_org, 'crm.read'))
        OR (p_for_write AND d.entity_type = 'opportunity'
          AND app.uwm_has_permission(p_org, 'crm.manage'))
        OR (NOT p_for_write AND d.entity_type = 'expense'
          AND app.uwm_has_permission(p_org, 'expenses.read'))
        OR (p_for_write AND d.entity_type = 'expense'
          AND app.uwm_has_permission(p_org, 'expenses.update'))
      )
  );
$$;

REVOKE ALL ON FUNCTION app.custom_field_value_row_allowed(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.custom_field_value_row_allowed(uuid, uuid, uuid, boolean) TO authenticated, service_role;

-- compliance_artifacts
DROP POLICY IF EXISTS compliance_artifacts_tenant_select ON public.compliance_artifacts;
CREATE POLICY compliance_artifacts_tenant_select ON public.compliance_artifacts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'compliance.read')
      OR app.uwm_has_permission(organization_id, 'compliance.manage')
    )
  );
DROP POLICY IF EXISTS compliance_artifacts_tenant_insert ON public.compliance_artifacts;
CREATE POLICY compliance_artifacts_tenant_insert ON public.compliance_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'compliance.manage')
  );
DROP POLICY IF EXISTS compliance_artifacts_tenant_update ON public.compliance_artifacts;
CREATE POLICY compliance_artifacts_tenant_update ON public.compliance_artifacts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'compliance.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'compliance.manage')
  );
DROP POLICY IF EXISTS compliance_artifacts_tenant_delete ON public.compliance_artifacts;
CREATE POLICY compliance_artifacts_tenant_delete ON public.compliance_artifacts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'compliance.manage')
  );

-- custom_field_definitions (read stays org-wide for form rendering)
DROP POLICY IF EXISTS custom_field_definitions_tenant_insert ON public.custom_field_definitions;
CREATE POLICY custom_field_definitions_tenant_insert ON public.custom_field_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'custom_fields.manage')
  );
DROP POLICY IF EXISTS custom_field_definitions_tenant_update ON public.custom_field_definitions;
CREATE POLICY custom_field_definitions_tenant_update ON public.custom_field_definitions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'custom_fields.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'custom_fields.manage')
  );
DROP POLICY IF EXISTS custom_field_definitions_tenant_delete ON public.custom_field_definitions;
CREATE POLICY custom_field_definitions_tenant_delete ON public.custom_field_definitions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'custom_fields.manage')
  );

-- custom_field_values
DROP POLICY IF EXISTS custom_field_values_tenant_select ON public.custom_field_values;
CREATE POLICY custom_field_values_tenant_select ON public.custom_field_values
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.custom_field_value_row_allowed(organization_id, definition_id, entity_id, false)
  );
DROP POLICY IF EXISTS custom_field_values_tenant_insert ON public.custom_field_values;
CREATE POLICY custom_field_values_tenant_insert ON public.custom_field_values
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.custom_field_value_row_allowed(organization_id, definition_id, entity_id, true)
  );
DROP POLICY IF EXISTS custom_field_values_tenant_update ON public.custom_field_values;
CREATE POLICY custom_field_values_tenant_update ON public.custom_field_values
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.custom_field_value_row_allowed(organization_id, definition_id, entity_id, true)
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.custom_field_value_row_allowed(organization_id, definition_id, entity_id, true)
  );
DROP POLICY IF EXISTS custom_field_values_tenant_delete ON public.custom_field_values;
CREATE POLICY custom_field_values_tenant_delete ON public.custom_field_values
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.custom_field_value_row_allowed(organization_id, definition_id, entity_id, true)
  );

DO $$
DECLARE
  api_table text;
  api_tables text[] := ARRAY['api_clients', 'api_keys', 'webhook_endpoints', 'webhook_deliveries'];
  api_pred text := 'app.is_org_member(organization_id) AND app.has_org_permission(organization_id, ''api.manage'')';
BEGIN
  FOREACH api_table IN ARRAY api_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', api_table || '_tenant_select', api_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      api_table || '_tenant_select', api_table, api_pred
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', api_table || '_tenant_insert', api_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      api_table || '_tenant_insert', api_table, api_pred
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', api_table || '_tenant_update', api_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      api_table || '_tenant_update', api_table, api_pred, api_pred
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', api_table || '_tenant_delete', api_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      api_table || '_tenant_delete', api_table, api_pred
    );
  END LOOP;
END $$;

-- external_access_grants (tenant policies only; principal / restrictive policies from 0156 preserved)
DROP POLICY IF EXISTS external_access_grants_tenant_select ON public.external_access_grants;
CREATE POLICY external_access_grants_tenant_select ON public.external_access_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.can_manage_contractor_access(organization_id, project_id)
      OR app.has_org_permission(organization_id, 'members.manage')
    )
  );
DROP POLICY IF EXISTS external_access_grants_tenant_insert ON public.external_access_grants;
CREATE POLICY external_access_grants_tenant_insert ON public.external_access_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.can_manage_contractor_access(organization_id, project_id)
      OR app.has_org_permission(organization_id, 'members.manage')
    )
  );
DROP POLICY IF EXISTS external_access_grants_tenant_update ON public.external_access_grants;
CREATE POLICY external_access_grants_tenant_update ON public.external_access_grants
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.can_manage_contractor_access(organization_id, project_id)
      OR app.has_org_permission(organization_id, 'members.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.can_manage_contractor_access(organization_id, project_id)
      OR app.has_org_permission(organization_id, 'members.manage')
    )
  );
DROP POLICY IF EXISTS external_access_grants_tenant_delete ON public.external_access_grants;
CREATE POLICY external_access_grants_tenant_delete ON public.external_access_grants
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.can_manage_contractor_access(organization_id, project_id)
      OR app.has_org_permission(organization_id, 'members.manage')
    )
  );

DO $$
DECLARE
  asset_table text;
  asset_tables text[] := ARRAY['maintenance_records', 'assets', 'fleet_vehicles'];
  asset_read text := 'app.is_org_member(organization_id) AND (
    app.uwm_has_permission(organization_id, ''assets.read'')
    OR app.uwm_has_permission(organization_id, ''assets.manage'')
  )';
  asset_write text := 'app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, ''assets.manage'')';
BEGIN
  FOREACH asset_table IN ARRAY asset_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', asset_table || '_tenant_select', asset_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      asset_table || '_tenant_select', asset_table, asset_read
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', asset_table || '_tenant_insert', asset_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      asset_table || '_tenant_insert', asset_table, asset_write
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', asset_table || '_tenant_update', asset_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      asset_table || '_tenant_update', asset_table, asset_write, asset_write
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', asset_table || '_tenant_delete', asset_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      asset_table || '_tenant_delete', asset_table, asset_write
    );
  END LOOP;
END $$;

DO $$
DECLARE
  field_table text;
  field_tables text[] := ARRAY['inspections', 'daily_logs', 'punch_list_items'];
  field_read text := 'app.is_org_member(organization_id) AND (
    app.uwm_has_permission(organization_id, ''field_ops.read'')
    OR app.uwm_has_permission(organization_id, ''field_ops.manage'')
  ) AND (
    project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id)
  )';
  field_write text := 'app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, ''field_ops.manage'')
    AND (
      project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id)
    )';
BEGIN
  FOREACH field_table IN ARRAY field_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', field_table || '_tenant_select', field_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      field_table || '_tenant_select', field_table, field_read
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', field_table || '_tenant_insert', field_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      field_table || '_tenant_insert', field_table, field_write
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', field_table || '_tenant_update', field_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      field_table || '_tenant_update', field_table, field_write, field_write
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', field_table || '_tenant_delete', field_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      field_table || '_tenant_delete', field_table, field_write
    );
  END LOOP;
END $$;
