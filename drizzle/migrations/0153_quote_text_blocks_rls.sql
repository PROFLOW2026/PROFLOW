--------------------------------------------------------------------------------
-- RLS for quote text block tables (0152 follow-up)
--------------------------------------------------------------------------------

ALTER TABLE public.quote_default_text_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_default_text_blocks_tenant_select ON public.quote_default_text_blocks;
CREATE POLICY quote_default_text_blocks_tenant_select ON public.quote_default_text_blocks
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.read'));

DROP POLICY IF EXISTS quote_default_text_blocks_tenant_insert ON public.quote_default_text_blocks;
CREATE POLICY quote_default_text_blocks_tenant_insert ON public.quote_default_text_blocks
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS quote_default_text_blocks_tenant_update ON public.quote_default_text_blocks;
CREATE POLICY quote_default_text_blocks_tenant_update ON public.quote_default_text_blocks
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS quote_default_text_blocks_tenant_delete ON public.quote_default_text_blocks;
CREATE POLICY quote_default_text_blocks_tenant_delete ON public.quote_default_text_blocks
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS quote_default_text_blocks_service_all ON public.quote_default_text_blocks;
CREATE POLICY quote_default_text_blocks_service_all ON public.quote_default_text_blocks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.estimate_text_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_text_blocks_tenant_select ON public.estimate_text_blocks;
CREATE POLICY estimate_text_blocks_tenant_select ON public.estimate_text_blocks
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.read'));

DROP POLICY IF EXISTS estimate_text_blocks_tenant_insert ON public.estimate_text_blocks;
CREATE POLICY estimate_text_blocks_tenant_insert ON public.estimate_text_blocks
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS estimate_text_blocks_tenant_update ON public.estimate_text_blocks;
CREATE POLICY estimate_text_blocks_tenant_update ON public.estimate_text_blocks
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS estimate_text_blocks_tenant_delete ON public.estimate_text_blocks;
CREATE POLICY estimate_text_blocks_tenant_delete ON public.estimate_text_blocks
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

DROP POLICY IF EXISTS estimate_text_blocks_service_all ON public.estimate_text_blocks;
CREATE POLICY estimate_text_blocks_service_all ON public.estimate_text_blocks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.quote_default_text_blocks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_default_text_blocks TO authenticated;

GRANT ALL ON public.estimate_text_blocks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_text_blocks TO authenticated;
