-- 0192: inventory_items / inventory_movements RLS (S01 / OD-51).
-- Pending journal (Gate B / EB-2). Not in journal; do not apply without Owner SQL approval.
--
-- Replaces 0011 org-only policies on inventory_items and redefines inventory_movements
-- policies (supersedes 0051 AND-chained can_access_project) with UWM permission mirrors
-- consistent with 0185 assets / field_ops sibling hardening.
--
-- App mapping: docs/audits/2026-10-s01-inventory-rls-map.md

-- inventory_items (org-wide catalog — no project_id)
DO $$
DECLARE
  item_read text := 'app.is_org_member(organization_id) AND (
    app.uwm_has_permission(organization_id, ''assets.read'')
    OR app.uwm_has_permission(organization_id, ''assets.manage'')
  )';
  item_write text := 'app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, ''assets.manage'')';
BEGIN
  EXECUTE 'ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY';

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', 'inventory_items_tenant_select');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_items FOR SELECT TO authenticated USING (%s)',
    'inventory_items_tenant_select', item_read
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', 'inventory_items_tenant_insert');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (%s)',
    'inventory_items_tenant_insert', item_write
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', 'inventory_items_tenant_update');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_items FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
    'inventory_items_tenant_update', item_write, item_write
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', 'inventory_items_tenant_delete');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_items FOR DELETE TO authenticated USING (%s)',
    'inventory_items_tenant_delete', item_write
  );
END $$;

-- inventory_movements (optional project_id on issue / project-linked rows)
DO $$
DECLARE
  move_read text := 'app.is_org_member(organization_id) AND (
    app.uwm_has_permission(organization_id, ''assets.read'')
    OR app.uwm_has_permission(organization_id, ''assets.manage'')
  ) AND (
    project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id)
  )';
  move_write text := 'app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, ''assets.manage'')
    AND (
      project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id)
    )';
BEGIN
  EXECUTE 'ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY';

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_movements', 'inventory_movements_tenant_select');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_movements FOR SELECT TO authenticated USING (%s)',
    'inventory_movements_tenant_select', move_read
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_movements', 'inventory_movements_tenant_insert');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (%s)',
    'inventory_movements_tenant_insert', move_write
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_movements', 'inventory_movements_tenant_update');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_movements FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
    'inventory_movements_tenant_update', move_write, move_write
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_movements', 'inventory_movements_tenant_delete');
  EXECUTE format(
    'CREATE POLICY %I ON public.inventory_movements FOR DELETE TO authenticated USING (%s)',
    'inventory_movements_tenant_delete', move_write
  );
END $$;
