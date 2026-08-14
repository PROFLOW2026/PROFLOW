-- 0034_boq_lifecycle_hardening
-- Additive only. Does NOT edit 0000–0033 file contents.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Fixes Reviewer A/B BLOCKERS after 0033:
--   A1/B2 — approve/bill RLS must not rewrite billed batches or un-bill
--   A2    — status→billed only via SECURITY DEFINER claim (requires permission)
--   B1    — progress lines INSERT only while parent batch is draft
--   B5    — progress batch project_id must match BOQ project
--   B6    — hard DELETE of BOQ headers/nodes only while draft
--   B7    — progress line node must belong to batch BOQ
--   F10   — same-org FKs for change allocations + sub schedule lines → nodes

--------------------------------------------------------------------------------
-- 1) SECURITY DEFINER claim / revert for billing status flip
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.claim_boq_progress_batch_for_billing(
  p_organization_id uuid,
  p_batch_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq claim: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'boq claim: requires boq.billing.create or boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.boq_progress_batches
  SET status = 'billed', updated_at = now()
  WHERE id = p_batch_id
    AND organization_id = p_organization_id
    AND status = 'approved'
  RETURNING id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.revert_boq_progress_batch_billing_claim(
  p_organization_id uuid,
  p_batch_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq revert claim: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'boq revert claim: requires boq.billing.create or boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Only revert billed batches that still have NO billing link (failed create path).
  UPDATE public.boq_progress_batches b
  SET status = 'approved', updated_at = now()
  WHERE b.id = p_batch_id
    AND b.organization_id = p_organization_id
    AND b.status = 'billed'
    AND NOT EXISTS (
      SELECT 1
      FROM public.boq_progress_billing_links l
      WHERE l.progress_batch_id = b.id
        AND l.organization_id = b.organization_id
    );
END;
$$;

REVOKE ALL ON FUNCTION app.claim_boq_progress_batch_for_billing(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revert_boq_progress_batch_billing_claim(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_boq_progress_batch_for_billing(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.revert_boq_progress_batch_billing_claim(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.claim_boq_progress_batch_for_billing(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.revert_boq_progress_batch_billing_claim(uuid, uuid) TO service_role;

--------------------------------------------------------------------------------
-- 2) Progress batch UPDATE policies — no un-bill / no free billed rewrite
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_progress_batches_tenant_update_approve ON public.boq_progress_batches;
DROP POLICY IF EXISTS boq_progress_batches_tenant_update_bill ON public.boq_progress_batches;

-- Approvers: draft → approved | voided only (never touch billed).
CREATE POLICY boq_progress_batches_tenant_update_approve ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status = 'draft'
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status IN ('approved', 'voided')
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  );

-- Managers may void an approved (unbilled) batch without rewriting billed history.
CREATE POLICY boq_progress_batches_tenant_update_void_approved ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status = 'approved'
    AND app.has_org_permission(organization_id, 'boq.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status = 'voided'
    AND app.has_org_permission(organization_id, 'boq.manage')
  );

-- No tenant bill UPDATE policy: approved→billed only via claim function.

--------------------------------------------------------------------------------
-- 3) Progress lines: INSERT only while parent is draft
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_progress_lines_tenant_insert ON public.boq_progress_lines;

CREATE POLICY boq_progress_lines_tenant_insert ON public.boq_progress_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
    AND EXISTS (
      SELECT 1 FROM public.boq_progress_batches b
      WHERE b.id = batch_id
        AND b.organization_id = organization_id
        AND b.status = 'draft'
    )
  );

-- Tighten line UPDATE WITH CHECK to keep parent draft.
DROP POLICY IF EXISTS boq_progress_lines_tenant_update ON public.boq_progress_lines;

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
  );

--------------------------------------------------------------------------------
-- 4) Hard DELETE only while BOQ is draft
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS project_boqs_tenant_delete ON public.project_boqs;
CREATE POLICY project_boqs_tenant_delete ON public.project_boqs
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND status = 'draft'
  );

DROP POLICY IF EXISTS boq_nodes_tenant_delete ON public.boq_nodes;
CREATE POLICY boq_nodes_tenant_delete ON public.boq_nodes
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND EXISTS (
      SELECT 1 FROM public.project_boqs b
      WHERE b.id = boq_id
        AND b.organization_id = organization_id
        AND b.status = 'draft'
    )
  );

--------------------------------------------------------------------------------
-- 5) Integrity triggers: project match + line belongs to batch BOQ
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_progress_batch_project_matches_boq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
BEGIN
  SELECT project_id INTO boq_project
  FROM public.project_boqs
  WHERE id = NEW.boq_id
    AND organization_id = NEW.organization_id;

  IF boq_project IS NULL THEN
    RAISE EXCEPTION 'boq_progress_batches: BOQ not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM boq_project THEN
    RAISE EXCEPTION 'boq_progress_batches: project_id must match BOQ project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_batch_project_matches_boq_trg ON public.boq_progress_batches;
CREATE TRIGGER boq_progress_batch_project_matches_boq_trg
  BEFORE INSERT OR UPDATE OF project_id, boq_id, organization_id
  ON public.boq_progress_batches
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_batch_project_matches_boq();

CREATE OR REPLACE FUNCTION app.boq_progress_line_node_matches_batch_boq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_boq uuid;
  node_boq uuid;
BEGIN
  SELECT boq_id INTO batch_boq
  FROM public.boq_progress_batches
  WHERE id = NEW.batch_id
    AND organization_id = NEW.organization_id;

  SELECT boq_id INTO node_boq
  FROM public.boq_nodes
  WHERE id = NEW.boq_node_id
    AND organization_id = NEW.organization_id;

  IF batch_boq IS NULL OR node_boq IS NULL THEN
    RAISE EXCEPTION 'boq_progress_lines: batch or node not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF batch_boq IS DISTINCT FROM node_boq THEN
    RAISE EXCEPTION 'boq_progress_lines: node must belong to the batch BOQ'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_line_node_matches_batch_boq_trg ON public.boq_progress_lines;
CREATE TRIGGER boq_progress_line_node_matches_batch_boq_trg
  BEFORE INSERT OR UPDATE OF batch_id, boq_node_id, organization_id
  ON public.boq_progress_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_line_node_matches_batch_boq();

--------------------------------------------------------------------------------
-- 6) Same-org FKs (F10 partial): allocations + sub schedule lines → nodes
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS boq_nodes_id_org_uq
  ON public.boq_nodes (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_schedule_lines_id_org_uq
  ON public.boq_subcontractor_schedule_lines (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_node_org_fk'
  ) THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_node_org_fk
      FOREIGN KEY (boq_node_id, organization_id)
      REFERENCES public.boq_nodes (id, organization_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedule_lines_node_org_fk'
  ) THEN
    ALTER TABLE public.boq_subcontractor_schedule_lines
      ADD CONSTRAINT boq_sub_schedule_lines_node_org_fk
      FOREIGN KEY (boq_node_id, organization_id)
      REFERENCES public.boq_nodes (id, organization_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_valuation_lines_schedule_line_org_fk'
  ) THEN
    ALTER TABLE public.boq_subcontractor_valuation_lines
      ADD CONSTRAINT boq_sub_valuation_lines_schedule_line_org_fk
      FOREIGN KEY (schedule_line_id, organization_id)
      REFERENCES public.boq_subcontractor_schedule_lines (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;
