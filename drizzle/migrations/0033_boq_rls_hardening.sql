-- 0033_boq_rls_hardening
-- Additive only. Does NOT edit 0000–0032 contents (0032 remains immutable once applied).
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Fixes early review BLOCKERS F2/F3:
--   - Workers with boq.progress.submit must not UPDATE boq_nodes money/qty columns
--   - Submitters must not approve/bill progress batches via RLS alone
--   - Progress lines under locked batches must not DELETE

--------------------------------------------------------------------------------
-- 1) boq_nodes: remove submit-based UPDATE; manage only
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_nodes_tenant_update ON public.boq_nodes;

CREATE POLICY boq_nodes_tenant_update ON public.boq_nodes
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));

--------------------------------------------------------------------------------
-- 2) Progress batches: split insert/update by capability + status
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_progress_batches_tenant_update ON public.boq_progress_batches;

-- Submitters may edit draft batches only (cannot flip to approved/billed).
CREATE POLICY boq_progress_batches_tenant_update_draft ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status = 'draft'
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status = 'draft'
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  );

-- Approvers / managers may move draft → approved (and manage corrections).
CREATE POLICY boq_progress_batches_tenant_update_approve ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status IN ('draft', 'approved', 'superseded', 'voided')
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  );

-- Billing creators may mark approved → billed only.
CREATE POLICY boq_progress_batches_tenant_update_bill ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status IN ('approved', 'billed')
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status IN ('approved', 'billed')
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
  );

--------------------------------------------------------------------------------
-- 3) Progress lines: submitters draft-only; no delete after locked parent
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_progress_lines_tenant_update ON public.boq_progress_lines;
DROP POLICY IF EXISTS boq_progress_lines_tenant_delete ON public.boq_progress_lines;

CREATE POLICY boq_progress_lines_tenant_update ON public.boq_progress_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.boq_progress_batches b
      WHERE b.id = batch_id
        AND b.organization_id = organization_id
        AND b.status = 'draft'
    )
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  );

CREATE POLICY boq_progress_lines_tenant_delete ON public.boq_progress_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND EXISTS (
      SELECT 1 FROM public.boq_progress_batches b
      WHERE b.id = batch_id
        AND b.organization_id = organization_id
        AND b.status = 'draft'
    )
  );

--------------------------------------------------------------------------------
-- 4) Column guard: non-manage callers cannot rewrite money on nodes (defense in depth)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_money_without_manage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT app.has_org_permission(NEW.organization_id, 'boq.manage') THEN
      IF NEW.current_quantity IS DISTINCT FROM OLD.current_quantity
         OR NEW.current_unit_price IS DISTINCT FROM OLD.current_unit_price
         OR NEW.current_amount IS DISTINCT FROM OLD.current_amount
         OR NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
         OR NEW.original_unit_price IS DISTINCT FROM OLD.original_unit_price
         OR NEW.original_amount IS DISTINCT FROM OLD.original_amount THEN
        RAISE EXCEPTION 'boq_nodes: money/qty updates require boq.manage'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_protect_money_without_manage_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_protect_money_without_manage_trg
  BEFORE UPDATE ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_protect_money_without_manage();
