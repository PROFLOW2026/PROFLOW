-- 0184: CRM permission RLS (S04).
-- Pending journal (Gate B). Policies only; no DML. Not applied by db:migrate until Owner approval.

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'crm_prospects',
    'crm_prospect_contacts',
    'crm_leads',
    'crm_opportunities',
    'crm_opportunity_notes',
    'crm_estimates',
    'crm_sales_quotes',
    'crm_sales_quote_versions',
    'crm_sales_quote_lines'
  ];
  read_pred text := 'app.is_org_member(organization_id) AND (
    app.uwm_has_permission(organization_id, ''crm.read'')
    OR app.uwm_has_permission(organization_id, ''crm.manage'')
  )';
  write_pred text := 'app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, ''crm.manage'')';
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_select', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      tenant_table || '_tenant_select', tenant_table, read_pred
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      tenant_table || '_tenant_insert', tenant_table, write_pred
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_update', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      tenant_table || '_tenant_update', tenant_table, write_pred, write_pred
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_delete', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      tenant_table || '_tenant_delete', tenant_table, write_pred
    );
  END LOOP;
END $$;
