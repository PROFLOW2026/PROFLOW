-- 0035_boq_integrity_closure
-- Additive only. Does NOT modify 0000–0034 file contents.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Closes remaining BOQ DB/lifecycle integrity gaps (owner integrity pass):
--   B  project_boqs lifecycle lock (no return to draft)
--   C  draft-only node INSERT; CO new-item via DEFINER only
--   D  current_* immutable after activate except allocation write latch
--   E  change allocation same-project / active BOQ / kind integrity
--   F  allocations append-only + reversal support
--   G  progress batch INSERT forced draft
--   H  measured ≠ approved (submit cannot forge money fields)
--   I  progress batch hard-delete draft-only
--   J  progress math / cumulative / billed immutability guards
--   K  billing link DEFINER-only + same-project
--   L  worker money masking via secure view
--   M  progress supersede RPC
--   P  subcontractor same-project guards
--   Q  SECURITY DEFINER hygiene

--------------------------------------------------------------------------------
-- 0) Session latch helpers (non-forgeable — authenticated cannot INSERT latches)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.boq_write_latches (
  pid integer NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pid, kind)
);

REVOKE ALL ON TABLE app.boq_write_latches FROM PUBLIC;
REVOKE ALL ON TABLE app.boq_write_latches FROM authenticated;
GRANT ALL ON TABLE app.boq_write_latches TO service_role;

CREATE OR REPLACE FUNCTION app.boq_latch_acquire(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO app.boq_write_latches (pid, kind)
  VALUES (pg_backend_pid(), p_kind)
  ON CONFLICT (pid, kind) DO UPDATE SET created_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_latch_release(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM app.boq_write_latches
  WHERE pid = pg_backend_pid() AND kind = p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_latch_held(p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.boq_write_latches
    WHERE pid = pg_backend_pid() AND kind = p_kind
  );
$$;

CREATE OR REPLACE FUNCTION app.boq_guc_on(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Legacy name kept for call sites; prefer latches. GUC alone is NOT authorization.
  SELECT lower(coalesce(current_setting(p_name, true), '')) IN ('1', 'on', 'true')
    AND app.boq_latch_held(
      CASE p_name
        WHEN 'app.boq_lifecycle_write' THEN 'lifecycle'
        WHEN 'app.boq_allocation_write' THEN 'allocation'
        WHEN 'app.boq_progress_approve_write' THEN 'progress_approve'
        WHEN 'app.boq_billing_link_write' THEN 'billing_link'
        WHEN 'app.boq_billing_claim_write' THEN 'billing_claim'
        WHEN 'app.boq_correction_write' THEN 'correction'
        ELSE 'allocation'
      END
    );
$$;

-- Latch acquire/release are internal to DEFINER RPCs only (not callable by tenants).
REVOKE ALL ON FUNCTION app.boq_latch_acquire(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_latch_acquire(text) FROM authenticated;
REVOKE ALL ON FUNCTION app.boq_latch_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_latch_release(text) FROM authenticated;
REVOKE ALL ON FUNCTION app.boq_latch_held(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_latch_held(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.boq_latch_acquire(text) TO service_role;
GRANT EXECUTE ON FUNCTION app.boq_latch_release(text) TO service_role;
GRANT EXECUTE ON FUNCTION app.boq_latch_held(text) TO service_role;

CREATE OR REPLACE FUNCTION app.boq_can_see_money(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT app.is_org_member(p_organization_id)
    AND (
      app.has_org_permission(p_organization_id, 'boq.manage')
      OR app.has_org_permission(p_organization_id, 'project_financials.read')
      OR app.has_org_permission(p_organization_id, 'contracts.read')
      OR app.has_org_permission(p_organization_id, 'boq.billing.create')
    );
$$;

--------------------------------------------------------------------------------
-- 1) Schema extensions (reversals / corrections)
--------------------------------------------------------------------------------

ALTER TABLE public.boq_change_allocations
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS reverses_allocation_id uuid,
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'system';

UPDATE public.boq_change_allocations a
SET project_id = b.project_id
FROM public.project_boqs b
WHERE a.boq_id = b.id
  AND a.organization_id = b.organization_id
  AND a.project_id IS NULL;

ALTER TABLE public.boq_change_allocations
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.boq_change_allocations
  DROP CONSTRAINT IF EXISTS boq_change_allocations_kind_known;

ALTER TABLE public.boq_change_allocations
  ADD CONSTRAINT boq_change_allocations_kind_known CHECK (
    allocation_kind IN (
      'quantity_change',
      'unit_price_change',
      'new_item',
      'lump_sum',
      'unallocated_contract',
      'reversal',
      'correction'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS change_orders_id_org_project_uq
  ON public.change_orders (id, organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_project_org_fk'
  ) THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_co_project_fk'
  ) THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_co_project_fk
      FOREIGN KEY (change_order_id, organization_id, project_id)
      REFERENCES public.change_orders (id, organization_id, project_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_reverses_fk'
  ) THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_reverses_fk
      FOREIGN KEY (reverses_allocation_id, organization_id)
      REFERENCES public.boq_change_allocations (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.boq_progress_batches
  ADD COLUMN IF NOT EXISTS correction_of_batch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_batches_correction_org_fk'
  ) THEN
    ALTER TABLE public.boq_progress_batches
      ADD CONSTRAINT boq_progress_batches_correction_org_fk
      FOREIGN KEY (correction_of_batch_id, organization_id)
      REFERENCES public.boq_progress_batches (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 2) B — project_boqs lifecycle
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.project_boqs_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_project uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT app.boq_guc_on('app.boq_lifecycle_write') THEN
      RAISE EXCEPTION 'project_boqs: status changes require lifecycle function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
      NULL;
    ELSIF OLD.status = 'active' AND NEW.status IN ('superseded', 'archived') THEN
      NULL;
    ELSIF OLD.status = 'superseded' AND NEW.status = 'archived' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'project_boqs: illegal status transition % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.superseded_by_boq_id IS DISTINCT FROM OLD.superseded_by_boq_id
     AND NEW.superseded_by_boq_id IS NOT NULL THEN
    SELECT project_id INTO target_project
    FROM public.project_boqs
    WHERE id = NEW.superseded_by_boq_id
      AND organization_id = NEW.organization_id;
    IF target_project IS NULL OR target_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'project_boqs: superseded_by_boq_id must be same org and project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boqs_lifecycle_guard_trg ON public.project_boqs;
CREATE TRIGGER project_boqs_lifecycle_guard_trg
  BEFORE UPDATE ON public.project_boqs
  FOR EACH ROW
  EXECUTE FUNCTION app.project_boqs_lifecycle_guard();

CREATE OR REPLACE FUNCTION app.activate_project_boq(
  p_organization_id uuid,
  p_boq_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_prior uuid;
  v_items int;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'activate_project_boq: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'activate_project_boq: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_boq
  FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_project_boq: BOQ not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_boq.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'activate_project_boq: only draft can activate' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_items
  FROM public.boq_nodes
  WHERE boq_id = p_boq_id
    AND organization_id = p_organization_id
    AND node_kind = 'item'
    AND archived_at IS NULL;
  IF v_items < 1 THEN
    RAISE EXCEPTION 'activate_project_boq: at least one item required' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('lifecycle');
  PERFORM set_config('app.boq_lifecycle_write', 'on', true);

  SELECT id INTO v_prior
  FROM public.project_boqs
  WHERE organization_id = p_organization_id
    AND project_id = v_boq.project_id
    AND status = 'active'
    AND id IS DISTINCT FROM p_boq_id
  FOR UPDATE;

  IF v_prior IS NOT NULL THEN
    UPDATE public.project_boqs
    SET status = 'superseded',
        superseded_by_boq_id = p_boq_id,
        updated_at = now()
    WHERE id = v_prior AND organization_id = p_organization_id;
  END IF;

  UPDATE public.project_boqs
  SET status = 'active',
      activated_at = now(),
      activated_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid,
      updated_at = now()
  WHERE id = p_boq_id AND organization_id = p_organization_id;

  PERFORM app.boq_latch_release('lifecycle');
  RETURN p_boq_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.archive_project_boq(
  p_organization_id uuid,
  p_boq_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'archive_project_boq: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'archive_project_boq: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status
  FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'archive_project_boq: BOQ not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status NOT IN ('active', 'superseded') THEN
    RAISE EXCEPTION 'archive_project_boq: only active/superseded can archive' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('lifecycle');
  PERFORM set_config('app.boq_lifecycle_write', 'on', true);
  UPDATE public.project_boqs
  SET status = 'archived', archived_at = now(), updated_at = now()
  WHERE id = p_boq_id AND organization_id = p_organization_id;
  PERFORM app.boq_latch_release('lifecycle');
  RETURN p_boq_id;
END;
$$;

DROP POLICY IF EXISTS project_boqs_tenant_update ON public.project_boqs;
CREATE POLICY project_boqs_tenant_update ON public.project_boqs
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
  );

DROP POLICY IF EXISTS project_boqs_tenant_insert ON public.project_boqs;
CREATE POLICY project_boqs_tenant_insert ON public.project_boqs
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND status = 'draft'
  );

--------------------------------------------------------------------------------
-- 3) C/D — nodes draft-only insert; current/original protection
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_nodes_tenant_insert ON public.boq_nodes;
CREATE POLICY boq_nodes_tenant_insert ON public.boq_nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND (
      app.boq_guc_on('app.boq_allocation_write')
      OR EXISTS (
        SELECT 1 FROM public.project_boqs b
        WHERE b.id = boq_id
          AND b.organization_id = organization_id
          AND b.status = 'draft'
      )
    )
  );

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_after_activate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_status text;
BEGIN
  SELECT status INTO boq_status
  FROM public.project_boqs
  WHERE id = COALESCE(NEW.boq_id, OLD.boq_id)
    AND organization_id = COALESCE(NEW.organization_id, OLD.organization_id);

  IF boq_status IS NULL OR boq_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_nodes: insert into non-draft BOQ requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
       OR NEW.original_unit_price IS DISTINCT FROM OLD.original_unit_price
       OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
       OR NEW.node_kind IS DISTINCT FROM OLD.node_kind
       OR NEW.pricing_type IS DISTINCT FROM OLD.pricing_type THEN
      RAISE EXCEPTION 'boq_nodes: original/baseline immutable after activation'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF (
      NEW.current_quantity IS DISTINCT FROM OLD.current_quantity
      OR NEW.current_unit_price IS DISTINCT FROM OLD.current_unit_price
      OR NEW.current_amount IS DISTINCT FROM OLD.current_amount
      OR NEW.opening_approved_quantity IS DISTINCT FROM OLD.opening_approved_quantity
      OR NEW.opening_billed_quantity IS DISTINCT FROM OLD.opening_billed_quantity
      OR NEW.item_code IS DISTINCT FROM OLD.item_code
      OR NEW.unit IS DISTINCT FROM OLD.unit
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.status IS DISTINCT FROM OLD.status
    ) AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
      RAISE EXCEPTION 'boq_nodes: current_* changes after activation require allocation path'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_protect_after_activate_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_protect_after_activate_trg
  BEFORE INSERT OR UPDATE ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_protect_after_activate();

CREATE OR REPLACE FUNCTION app.boq_nodes_parent_same_boq_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_boq uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT boq_id INTO parent_boq
  FROM public.boq_nodes
  WHERE id = NEW.parent_id AND organization_id = NEW.organization_id;
  IF parent_boq IS NULL OR parent_boq IS DISTINCT FROM NEW.boq_id THEN
    RAISE EXCEPTION 'boq_nodes: parent must belong to same BOQ'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_parent_same_boq_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_parent_same_boq_trg
  BEFORE INSERT OR UPDATE OF parent_id, boq_id, organization_id
  ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_parent_same_boq_guard();

--------------------------------------------------------------------------------
-- 4) E/F — allocations integrity + immutability + reverse RPC
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_change_allocations_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
  boq_status text;
  boq_currency char(3);
  co_project uuid;
  co_currency char(3);
  node_boq uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: history is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: insert requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project_id, status, currency INTO boq_project, boq_status, boq_currency
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id;

  IF boq_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF boq_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ must be active' USING ERRCODE = 'check_violation';
  END IF;

  NEW.project_id := boq_project;

  SELECT project_id, currency INTO co_project, co_currency
  FROM public.change_orders
  WHERE id = NEW.change_order_id AND organization_id = NEW.organization_id;

  IF co_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: change order not found (pending changes cannot allocate)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF co_project IS DISTINCT FROM boq_project THEN
    RAISE EXCEPTION 'boq_change_allocations: change order must be same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency IS DISTINCT FROM boq_currency THEN
    RAISE EXCEPTION 'boq_change_allocations: currency must match BOQ' USING ERRCODE = 'check_violation';
  END IF;
  IF co_currency IS NOT NULL AND NEW.currency IS DISTINCT FROM co_currency THEN
    RAISE EXCEPTION 'boq_change_allocations: currency must match change order'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.allocation_kind = 'unallocated_contract' THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: unallocated must not reference a node'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('quantity_change', 'unit_price_change', 'lump_sum', 'new_item') THEN
    IF NEW.boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: mapped kind requires boq_node_id'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT boq_id INTO node_boq
    FROM public.boq_nodes
    WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
    IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
      RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('reversal', 'correction') THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      SELECT boq_id INTO node_boq
      FROM public.boq_nodes
      WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
      IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
        RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'boq_change_allocations: unknown allocation_kind'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_change_allocations_integrity_trg ON public.boq_change_allocations;
CREATE TRIGGER boq_change_allocations_integrity_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_change_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_change_allocations_integrity_guard();

DROP POLICY IF EXISTS boq_change_allocations_tenant_insert ON public.boq_change_allocations;
DROP POLICY IF EXISTS boq_change_allocations_tenant_update ON public.boq_change_allocations;
DROP POLICY IF EXISTS boq_change_allocations_tenant_delete ON public.boq_change_allocations;

CREATE POLICY boq_change_allocations_tenant_insert ON public.boq_change_allocations
  FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY boq_change_allocations_tenant_update ON public.boq_change_allocations
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY boq_change_allocations_tenant_delete ON public.boq_change_allocations
  FOR DELETE TO authenticated
  USING (false);

-- Canonical allocate (quantity / price / lump / unallocated / new_item)
CREATE OR REPLACE FUNCTION app.boq_allocate_change(
  p_organization_id uuid,
  p_boq_id uuid,
  p_change_order_id uuid,
  p_allocation_kind text,
  p_boq_node_id uuid,
  p_quantity_delta numeric,
  p_unit_price_delta numeric,
  p_amount_delta numeric,
  p_notes text,
  p_new_item jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_alloc_id uuid;
  v_new_node_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_locked numeric(18,6);
  v_cum numeric(18,6);
  v_co_amount numeric(18,6);
  v_co_direction text;
  v_net_allocated numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_allocate_change: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_allocate_change: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_allocate_change: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.change_orders
    WHERE id = p_change_order_id
      AND organization_id = p_organization_id
      AND project_id = v_boq.project_id
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: ChangeOrder required (pending ChangeRequest has no CO)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM set_config('app.boq_allocation_write', 'on', true);

  BEGIN
  IF p_allocation_kind = 'unallocated_contract' THEN
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, NULL,
      'unallocated_contract', 0, 0, coalesce(p_amount_delta, 0), v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind = 'new_item' THEN
    IF p_new_item IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: new_item payload required' USING ERRCODE = 'check_violation';
    END IF;
    v_qty := coalesce((p_new_item->>'quantity')::numeric, 0);
    v_price := coalesce((p_new_item->>'unit_price')::numeric, 0);
    IF coalesce(p_new_item->>'pricing_type', 'quantity_unit_price') = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    INSERT INTO public.boq_nodes (
      organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
      original_quantity, original_unit_price, original_amount,
      current_quantity, current_unit_price, current_amount,
      opening_approved_quantity, opening_billed_quantity,
      source_change_order_id, status, sort_order, notes
    ) VALUES (
      p_organization_id, p_boq_id,
      nullif(p_new_item->>'parent_id', '')::uuid,
      'item',
      nullif(p_new_item->>'item_code', ''),
      coalesce(p_new_item->>'description', 'Change item'),
      nullif(p_new_item->>'unit', ''),
      coalesce(p_new_item->>'pricing_type', 'quantity_unit_price'),
      0, 0, 0,
      v_qty, v_price, v_amount,
      0, 0,
      p_change_order_id, 'active', 0,
      coalesce(p_notes, 'Source: Change Order')
    ) RETURNING id INTO v_new_node_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, v_new_node_id,
      'new_item', v_qty, 0, v_amount, v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSE
    IF p_boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: boq_node_id required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = p_boq_node_id AND organization_id = p_organization_id AND boq_id = p_boq_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_allocate_change: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    v_qty := v_node.current_quantity + coalesce(p_quantity_delta, 0);
    v_price := v_node.current_unit_price + coalesce(p_unit_price_delta, 0);
    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    SELECT coalesce(sum(l.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l
    JOIN public.boq_progress_batches b
      ON b.id = l.batch_id AND b.organization_id = l.organization_id
    WHERE l.organization_id = p_organization_id
      AND l.boq_node_id = p_boq_node_id
      AND (
        b.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
      );

    v_locked := greatest(v_node.opening_approved_quantity, v_node.opening_billed_quantity) + v_cum;
    IF v_qty < v_locked THEN
      RAISE EXCEPTION 'boq_allocate_change: cannot reduce current below approved/billed floor'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = p_boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, p_boq_node_id,
      p_allocation_kind,
      coalesce(p_quantity_delta, 0),
      coalesce(p_unit_price_delta, 0),
      (v_amount - v_node.current_amount),
      v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  END IF;

  SELECT amount, direction INTO v_co_amount, v_co_direction
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id;

  SELECT coalesce(sum(amount_delta), 0) INTO v_net_allocated
  FROM public.boq_change_allocations
  WHERE organization_id = p_organization_id
    AND change_order_id = p_change_order_id;

  IF abs(v_net_allocated) > v_co_amount + 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: allocation exceeds change order amount'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'addition' AND v_net_allocated < -0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: addition CO cannot net negative'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'reduction' AND v_net_allocated > 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: reduction CO cannot net positive'
      USING ERRCODE = 'check_violation';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  RETURN v_alloc_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_reverse_change_allocation(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src public.boq_change_allocations%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_src FROM public.boq_change_allocations
  WHERE id = p_allocation_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_src.allocation_kind IN ('reversal') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: cannot reverse a reversal'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.boq_change_allocations
    WHERE organization_id = p_organization_id
      AND reverses_allocation_id = p_allocation_id
  ) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: already reversed'
      USING ERRCODE = 'unique_violation';
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM app.boq_latch_acquire('correction');
  PERFORM set_config('app.boq_allocation_write', 'on', true);
  PERFORM set_config('app.boq_correction_write', 'on', true);

  BEGIN
  IF v_src.boq_node_id IS NOT NULL AND v_src.allocation_kind IS DISTINCT FROM 'unallocated_contract' THEN
    -- Nested allocate acquires/releases allocation latch; re-acquire for reversal stamp.
    v_id := app.boq_allocate_change(
      p_organization_id,
      v_src.boq_id,
      v_src.change_order_id,
      'quantity_change',
      v_src.boq_node_id,
      -v_src.quantity_delta,
      -v_src.unit_price_delta,
      -v_src.amount_delta,
      coalesce(p_notes, 'Reversal of allocation'),
      NULL
    );
    PERFORM app.boq_latch_acquire('allocation');
    PERFORM set_config('app.boq_allocation_write', 'on', true);
    UPDATE public.boq_change_allocations
    SET allocation_kind = 'reversal',
        reverses_allocation_id = p_allocation_id,
        notes = coalesce(p_notes, notes)
    WHERE id = v_id AND organization_id = p_organization_id;
  ELSE
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, reverses_allocation_id, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_src.project_id, v_src.boq_id, v_src.change_order_id, NULL,
      'reversal', 0, 0, -v_src.amount_delta, v_src.currency,
      coalesce(p_notes, 'Reversal of unallocated'), p_allocation_id,
      nullif(current_setting('app.user_id', true), '')::uuid, 'reverse_rpc'
    ) RETURNING id INTO v_id;
  END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    PERFORM app.boq_latch_release('correction');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  PERFORM app.boq_latch_release('correction');
  RETURN v_id;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS boq_change_allocations_reverses_uq
  ON public.boq_change_allocations (reverses_allocation_id)
  WHERE reverses_allocation_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 5) G/H/I/J — progress draft insert, measured≠approved, delete, math
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_progress_batches_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT app.boq_guc_on('app.boq_correction_write') THEN
    NEW.status := 'draft';
    NEW.approved_at := NULL;
    NEW.approved_by_user_id := NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM 'draft' AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_batches: tenant insert must be draft'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_batches_insert_guard_trg ON public.boq_progress_batches;
CREATE TRIGGER boq_progress_batches_insert_guard_trg
  BEFORE INSERT ON public.boq_progress_batches
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_batches_insert_guard();

DROP POLICY IF EXISTS boq_progress_batches_tenant_insert ON public.boq_progress_batches;
CREATE POLICY boq_progress_batches_tenant_insert ON public.boq_progress_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status = 'draft'
    AND approved_at IS NULL
    AND approved_by_user_id IS NULL
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  );

DROP POLICY IF EXISTS boq_progress_batches_tenant_delete ON public.boq_progress_batches;
CREATE POLICY boq_progress_batches_tenant_delete ON public.boq_progress_batches
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND status = 'draft'
  );

CREATE OR REPLACE FUNCTION app.boq_progress_lines_submit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  can_approve boolean;
BEGIN
  can_approve :=
    app.has_org_permission(NEW.organization_id, 'boq.progress.approve')
    OR app.has_org_permission(NEW.organization_id, 'boq.manage')
    OR app.boq_guc_on('app.boq_progress_approve_write');

  IF TG_OP = 'INSERT' AND NOT can_approve THEN
    -- Submitters may only stage measured values; financial fields forced empty until approve RPC.
    NEW.approved_quantity := 0;
    NEW.previous_approved_quantity := 0;
    NEW.unit_price_snapshot := 0;
    NEW.period_amount := 0;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT can_approve THEN
    IF NEW.approved_quantity IS DISTINCT FROM OLD.approved_quantity
       OR NEW.previous_approved_quantity IS DISTINCT FROM OLD.previous_approved_quantity
       OR NEW.unit_price_snapshot IS DISTINCT FROM OLD.unit_price_snapshot
       OR NEW.period_amount IS DISTINCT FROM OLD.period_amount THEN
      RAISE EXCEPTION 'boq_progress_lines: submit cannot forge approved financial fields'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.approved_quantity < 0 AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_lines: negative approved qty requires correction path'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_lines_submit_guard_trg ON public.boq_progress_lines;
CREATE TRIGGER boq_progress_lines_submit_guard_trg
  BEFORE INSERT OR UPDATE ON public.boq_progress_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_lines_submit_guard();

CREATE OR REPLACE FUNCTION app.boq_progress_lines_locked_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_status text;
BEGIN
  SELECT status INTO batch_status
  FROM public.boq_progress_batches
  WHERE id = COALESCE(NEW.batch_id, OLD.batch_id)
    AND organization_id = COALESCE(NEW.organization_id, OLD.organization_id);

  IF batch_status IN ('approved', 'billed', 'superseded', 'voided')
     AND NOT app.boq_guc_on('app.boq_progress_approve_write')
     AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_lines: locked batch history is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_lines_locked_guard_trg ON public.boq_progress_lines;
CREATE TRIGGER boq_progress_lines_locked_guard_trg
  BEFORE UPDATE OR DELETE ON public.boq_progress_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_lines_locked_guard();

CREATE OR REPLACE FUNCTION app.approve_boq_progress_batch(
  p_organization_id uuid,
  p_batch_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.boq_progress_batches%ROWTYPE;
  v_boq public.project_boqs%ROWTYPE;
  r record;
  v_prev numeric(18,6);
  v_cum numeric(18,6);
  v_approved numeric(18,6);
  v_price numeric(18,6);
  v_period numeric(18,6);
  v_opening numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.progress.approve')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: requires approve/manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.boq_progress_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: draft batch required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = v_batch.boq_id AND organization_id = p_organization_id;
  IF v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('progress_approve');
  PERFORM set_config('app.boq_progress_approve_write', 'on', true);

  BEGIN
  FOR r IN
    SELECT l.*, n.current_quantity, n.current_unit_price, n.pricing_type,
           n.opening_approved_quantity, n.opening_billed_quantity
    FROM public.boq_progress_lines l
    JOIN public.boq_nodes n
      ON n.id = l.boq_node_id AND n.organization_id = l.organization_id
    WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id
    FOR UPDATE OF l
  LOOP
    SELECT coalesce(sum(l2.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l2
    JOIN public.boq_progress_batches b2
      ON b2.id = l2.batch_id AND b2.organization_id = l2.organization_id
    WHERE l2.organization_id = p_organization_id
      AND l2.boq_node_id = r.boq_node_id
      AND b2.id IS DISTINCT FROM p_batch_id
      AND (
        b2.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b2.id AND x.organization_id = b2.organization_id
            AND x.voided_at IS NULL
        )
      );
    v_opening := greatest(r.opening_approved_quantity, r.opening_billed_quantity);
    v_prev := v_opening + v_cum;
    -- Canonical: physical measured drives approval. Never trust client-forged approved_*.
    v_approved := r.measured_quantity;
    IF v_approved < 0 AND NOT app.boq_guc_on('app.boq_correction_write') THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: negative approved not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev + v_approved > r.current_quantity THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: over-measurement vs current quantity'
        USING ERRCODE = 'check_violation';
    END IF;

    v_price := r.current_unit_price;
    IF r.pricing_type = 'lump_sum' THEN
      IF v_approved < 0 OR v_approved > 1 THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: lump_sum approved qty must be 0..1 fraction'
          USING ERRCODE = 'check_violation';
      END IF;
      v_period := round(v_price * v_approved, 6);
    ELSE
      v_period := round(v_price * v_approved, 6);
    END IF;

    UPDATE public.boq_progress_lines
    SET previous_approved_quantity = v_prev,
        approved_quantity = v_approved,
        unit_price_snapshot = v_price,
        period_amount = v_period,
        currency = v_boq.currency,
        updated_at = now()
    WHERE id = r.id AND organization_id = p_organization_id;
  END LOOP;

  UPDATE public.boq_progress_batches
  SET status = 'approved',
      approved_at = now(),
      approved_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid,
      updated_at = now()
  WHERE id = p_batch_id AND organization_id = p_organization_id AND status = 'draft';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('progress_approve');
    RAISE;
  END;

  PERFORM app.boq_latch_release('progress_approve');
  RETURN p_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_progress_batches_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'billed'
       AND NEW.status IS DISTINCT FROM 'billed'
       AND NOT app.boq_guc_on('app.boq_correction_write')
       AND NOT app.boq_guc_on('app.boq_billing_claim_write') THEN
      -- allow revert claim (billed→approved) only with claim GUC when no link
      RAISE EXCEPTION 'boq_progress_batches: billed status is immutable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'approved'
       AND OLD.status = 'draft'
       AND NOT app.boq_guc_on('app.boq_progress_approve_write') THEN
      RAISE EXCEPTION 'boq_progress_batches: approve requires approve function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'billed'
       AND OLD.status = 'approved'
       AND NOT app.boq_guc_on('app.boq_billing_claim_write') THEN
      RAISE EXCEPTION 'boq_progress_batches: billed requires claim function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'superseded'
       AND NOT app.boq_guc_on('app.boq_correction_write') THEN
      RAISE EXCEPTION 'boq_progress_batches: supersede requires correction function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_batches_status_guard_trg ON public.boq_progress_batches;
CREATE TRIGGER boq_progress_batches_status_guard_trg
  BEFORE UPDATE OF status ON public.boq_progress_batches
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_batches_status_guard();

-- Tenant cannot flip approve/bill directly; RPCs (DEFINER) perform status writes.
DROP POLICY IF EXISTS boq_progress_batches_tenant_update_approve ON public.boq_progress_batches;
CREATE POLICY boq_progress_batches_tenant_update_approve ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

--------------------------------------------------------------------------------
-- 6) K — billing link DEFINER-only + same project
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS boq_progress_billing_links_tenant_insert ON public.boq_progress_billing_links;
CREATE POLICY boq_progress_billing_links_tenant_insert ON public.boq_progress_billing_links
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION app.boq_progress_billing_links_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_project uuid;
  batch_status text;
  bill_project uuid;
  bill_org uuid;
  bill_currency char(3);
BEGIN
  IF NOT app.boq_guc_on('app.boq_billing_link_write') THEN
    RAISE EXCEPTION 'boq_progress_billing_links: insert requires billing path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project_id, status INTO batch_project, batch_status
  FROM public.boq_progress_batches
  WHERE id = NEW.progress_batch_id AND organization_id = NEW.organization_id;

  SELECT project_id, organization_id, currency INTO bill_project, bill_org, bill_currency
  FROM public.billing_records
  WHERE id = NEW.billing_record_id;

  IF batch_project IS NULL OR bill_org IS NULL THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch or billing missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF bill_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'boq_progress_billing_links: billing org mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch_project IS DISTINCT FROM bill_project THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch and billing must share project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch_status IS DISTINCT FROM 'billed' THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch must be billed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency IS DISTINCT FROM bill_currency THEN
    RAISE EXCEPTION 'boq_progress_billing_links: currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_progress_billing_links_integrity_trg ON public.boq_progress_billing_links;
CREATE TRIGGER boq_progress_billing_links_integrity_trg
  BEFORE INSERT ON public.boq_progress_billing_links
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_progress_billing_links_integrity_guard();

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
    RAISE EXCEPTION 'boq claim: not an organization member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'boq claim: requires boq.billing.create or boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM app.boq_latch_acquire('billing_claim');
  PERFORM set_config('app.boq_billing_claim_write', 'on', true);

  UPDATE public.boq_progress_batches
  SET status = 'billed', updated_at = now()
  WHERE id = p_batch_id
    AND organization_id = p_organization_id
    AND status = 'approved'
  RETURNING id INTO updated_id;

  PERFORM app.boq_latch_release('billing_claim');
  RETURN updated_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.insert_boq_progress_billing_link(
  p_organization_id uuid,
  p_progress_batch_id uuid,
  p_billing_record_id uuid,
  p_period_net_amount numeric,
  p_currency char(3)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_line_sum numeric(18,6);
  v_bill_amount numeric(18,6);
  v_bill_currency char(3);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'insert link: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'insert link: requires billing permission' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(sum(period_amount), 0) INTO v_line_sum
  FROM public.boq_progress_lines
  WHERE batch_id = p_progress_batch_id AND organization_id = p_organization_id;

  SELECT total_amount::numeric, currency INTO v_bill_amount, v_bill_currency
  FROM public.billing_records
  WHERE id = p_billing_record_id AND organization_id = p_organization_id;

  IF v_bill_amount IS NULL THEN
    RAISE EXCEPTION 'insert link: billing record not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p_currency IS DISTINCT FROM v_bill_currency THEN
    RAISE EXCEPTION 'insert link: currency must match billing record' USING ERRCODE = 'check_violation';
  END IF;
  IF p_period_net_amount IS DISTINCT FROM v_line_sum THEN
    RAISE EXCEPTION 'insert link: amount must equal sum of approved period lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_period_net_amount IS DISTINCT FROM v_bill_amount THEN
    RAISE EXCEPTION 'insert link: amount must equal billing record amount'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('billing_link');
  PERFORM set_config('app.boq_billing_link_write', 'on', true);

  BEGIN
  INSERT INTO public.boq_progress_billing_links (
    organization_id, progress_batch_id, billing_record_id,
    period_net_amount, currency, created_by_user_id
  ) VALUES (
    p_organization_id, p_progress_batch_id, p_billing_record_id,
    p_period_net_amount, p_currency,
    nullif(current_setting('app.user_id', true), '')::uuid
  ) RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('billing_link');
    RAISE;
  END;

  PERFORM app.boq_latch_release('billing_link');
  RETURN v_id;
END;
$$;

-- Atomic claim + link after AR row exists (avoids stuck billed without link).
CREATE OR REPLACE FUNCTION app.finalize_boq_progress_billing(
  p_organization_id uuid,
  p_progress_batch_id uuid,
  p_billing_record_id uuid,
  p_period_net_amount numeric,
  p_currency char(3)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.boq_progress_batches%ROWTYPE;
  v_link_id uuid;
  v_claimed boolean;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'finalize billing: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'finalize billing: requires billing permission' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.boq_progress_batches
  WHERE id = p_progress_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'finalize billing: approved batch required' USING ERRCODE = 'check_violation';
  END IF;

  v_claimed := app.claim_boq_progress_batch_for_billing(p_organization_id, p_progress_batch_id);
  IF NOT v_claimed THEN
    RAISE EXCEPTION 'finalize billing: claim failed' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_link_id := app.insert_boq_progress_billing_link(
      p_organization_id,
      p_progress_batch_id,
      p_billing_record_id,
      p_period_net_amount,
      p_currency
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.revert_boq_progress_batch_billing_claim(p_organization_id, p_progress_batch_id);
    RAISE;
  END;

  RETURN v_link_id;
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
    RAISE EXCEPTION 'boq revert claim: not an organization member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'boq revert claim: requires boq.billing.create or boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM app.boq_latch_acquire('billing_claim');
  PERFORM set_config('app.boq_billing_claim_write', 'on', true);

  UPDATE public.boq_progress_batches b
  SET status = 'approved', updated_at = now()
  WHERE b.id = p_batch_id
    AND b.organization_id = p_organization_id
    AND b.status = 'billed'
    AND NOT EXISTS (
      SELECT 1 FROM public.boq_progress_billing_links l
      WHERE l.progress_batch_id = b.id AND l.organization_id = b.organization_id
    );
  PERFORM app.boq_latch_release('billing_claim');
END;
$$;

--------------------------------------------------------------------------------
-- 7) M — progress supersede / correction
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.supersede_boq_progress_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_period_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src public.boq_progress_batches%ROWTYPE;
  v_new_id uuid;
  v_cert int;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'supersede: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'supersede: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_src FROM public.boq_progress_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_src.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'supersede: only approved unbilled batches can be superseded (void AR before correcting billed)'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('correction');
  PERFORM app.boq_latch_acquire('progress_approve');
  PERFORM set_config('app.boq_correction_write', 'on', true);
  PERFORM set_config('app.boq_progress_approve_write', 'on', true);

  BEGIN
  UPDATE public.boq_progress_batches
  SET status = 'superseded', updated_at = now()
  WHERE id = p_batch_id AND organization_id = p_organization_id;

  SELECT coalesce(max(certificate_number), 0) + 1 INTO v_cert
  FROM public.boq_progress_batches
  WHERE organization_id = p_organization_id AND boq_id = v_src.boq_id;

  INSERT INTO public.boq_progress_batches (
    organization_id, project_id, boq_id, certificate_number, period_label,
    period_start, period_end, status, notes, supersedes_batch_id, correction_of_batch_id,
    created_by_user_id
  ) VALUES (
    p_organization_id, v_src.project_id, v_src.boq_id, v_cert,
    coalesce(p_period_label, v_src.period_label || ' (correction)'),
    v_src.period_start, v_src.period_end, 'draft',
    'Correction draft for certificate ' || v_src.certificate_number::text,
    p_batch_id,
    p_batch_id,
    nullif(current_setting('app.user_id', true), '')::uuid
  ) RETURNING id INTO v_new_id;

  -- Copy physical measured lines for correction workflow (money fields reset).
  INSERT INTO public.boq_progress_lines (
    organization_id, batch_id, boq_node_id,
    measured_quantity, previous_approved_quantity, approved_quantity,
    unit_price_snapshot, period_amount, currency, notes
  )
  SELECT
    l.organization_id, v_new_id, l.boq_node_id,
    l.measured_quantity, 0, 0,
    0, 0, l.currency,
    coalesce(l.notes, 'Copied from certificate ' || v_src.certificate_number::text)
  FROM public.boq_progress_lines l
  WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('progress_approve');
    PERFORM app.boq_latch_release('correction');
    RAISE;
  END;

  PERFORM app.boq_latch_release('progress_approve');
  PERFORM app.boq_latch_release('correction');
  RETURN v_new_id;
END;
$$;

--------------------------------------------------------------------------------
-- 8) L — secure money-masking view
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.boq_nodes_secure
WITH (security_invoker = false) AS
SELECT
  n.id,
  n.organization_id,
  n.boq_id,
  n.parent_id,
  n.node_kind,
  n.item_code,
  n.description,
  n.unit,
  n.pricing_type,
  n.original_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_unit_price ELSE 0::numeric(18,6) END AS original_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_amount ELSE 0::numeric(18,6) END AS original_amount,
  n.current_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_unit_price ELSE 0::numeric(18,6) END AS current_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_amount ELSE 0::numeric(18,6) END AS current_amount,
  n.opening_approved_quantity,
  n.opening_billed_quantity,
  n.work_package_id,
  n.cost_category_id,
  n.budget_line_id,
  n.source_change_order_id,
  n.status,
  n.sort_order,
  n.notes,
  n.archived_at,
  n.created_at,
  n.updated_at
FROM public.boq_nodes n;

GRANT SELECT ON public.boq_nodes_secure TO authenticated;
GRANT SELECT ON public.boq_nodes_secure TO service_role;

-- Force view-only money: revoke table SELECT, re-grant non-money columns only.
REVOKE SELECT ON TABLE public.boq_nodes FROM authenticated;
GRANT SELECT (
  id, organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
  original_quantity, current_quantity, opening_approved_quantity, opening_billed_quantity,
  work_package_id, cost_category_id, budget_line_id, source_change_order_id,
  status, sort_order, notes, archived_at, created_at, updated_at
) ON public.boq_nodes TO authenticated;

REVOKE SELECT ON TABLE public.boq_progress_lines FROM authenticated;
GRANT SELECT (
  id, organization_id, batch_id, boq_node_id, measured_quantity,
  previous_approved_quantity, approved_quantity, currency, notes, created_at, updated_at
) ON public.boq_progress_lines TO authenticated;

REVOKE SELECT ON TABLE public.boq_change_allocations FROM authenticated;
GRANT SELECT (
  id, organization_id, project_id, boq_id, change_order_id, boq_node_id, allocation_kind,
  quantity_delta, currency, notes, reverses_allocation_id, created_via, created_by_user_id, created_at
) ON public.boq_change_allocations TO authenticated;

REVOKE SELECT (
  unit_rate
) ON public.boq_subcontractor_schedule_lines FROM authenticated;

CREATE OR REPLACE VIEW public.boq_progress_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id,
  l.organization_id,
  l.batch_id,
  l.boq_node_id,
  l.measured_quantity,
  l.previous_approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.approved_quantity ELSE l.measured_quantity END AS approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_price_snapshot ELSE 0::numeric(18,6) END AS unit_price_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency,
  l.notes,
  l.created_at,
  l.updated_at
FROM public.boq_progress_lines l;

GRANT SELECT ON public.boq_progress_lines_secure TO authenticated;
GRANT SELECT ON public.boq_progress_lines_secure TO service_role;

CREATE OR REPLACE VIEW public.boq_change_allocations_secure
WITH (security_invoker = false) AS
SELECT
  a.id,
  a.organization_id,
  a.project_id,
  a.boq_id,
  a.change_order_id,
  a.boq_node_id,
  a.allocation_kind,
  a.quantity_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.unit_price_delta ELSE 0::numeric(18,6) END AS unit_price_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.amount_delta ELSE 0::numeric(18,6) END AS amount_delta,
  a.currency,
  a.notes,
  a.reverses_allocation_id,
  a.created_via,
  a.created_by_user_id,
  a.created_at
FROM public.boq_change_allocations a;

GRANT SELECT ON public.boq_change_allocations_secure TO authenticated;
GRANT SELECT ON public.boq_change_allocations_secure TO service_role;

--------------------------------------------------------------------------------
-- 9) P — subcontractor same-project integrity
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_project_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
  eng_project uuid;
BEGIN
  SELECT project_id INTO boq_project
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id;
  SELECT project_id INTO eng_project
  FROM public.vendor_engagements
  WHERE id = NEW.vendor_engagement_id AND organization_id = NEW.organization_id;

  IF boq_project IS NULL OR eng_project IS NULL THEN
    RAISE EXCEPTION 'boq_sub_schedules: BOQ or engagement missing' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM boq_project OR NEW.project_id IS DISTINCT FROM eng_project THEN
    RAISE EXCEPTION 'boq_sub_schedules: project must match BOQ and engagement'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_project_guard_trg ON public.boq_subcontractor_schedules;
CREATE TRIGGER boq_sub_schedule_project_guard_trg
  BEFORE INSERT OR UPDATE OF project_id, boq_id, vendor_engagement_id, organization_id
  ON public.boq_subcontractor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_schedule_project_guard();

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_line_same_boq_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  schedule_boq uuid;
  node_boq uuid;
BEGIN
  SELECT boq_id INTO schedule_boq
  FROM public.boq_subcontractor_schedules
  WHERE id = NEW.schedule_id AND organization_id = NEW.organization_id;
  SELECT boq_id INTO node_boq
  FROM public.boq_nodes
  WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
  IF schedule_boq IS NULL OR node_boq IS NULL OR schedule_boq IS DISTINCT FROM node_boq THEN
    RAISE EXCEPTION 'boq_sub_schedule_lines: node must belong to schedule BOQ'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_line_same_boq_trg ON public.boq_subcontractor_schedule_lines;
CREATE TRIGGER boq_sub_schedule_line_same_boq_trg
  BEFORE INSERT OR UPDATE OF schedule_id, boq_node_id, organization_id
  ON public.boq_subcontractor_schedule_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_schedule_line_same_boq_guard();

--------------------------------------------------------------------------------
-- 10) Q — grants / revoke PUBLIC
--------------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
BEGIN
  -- Canonical tenant-callable entrypoints only.
  FOREACH fn IN ARRAY ARRAY[
    'app.activate_project_boq(uuid,uuid)',
    'app.archive_project_boq(uuid,uuid)',
    'app.boq_allocate_change(uuid,uuid,uuid,text,uuid,numeric,numeric,numeric,text,jsonb)',
    'app.boq_reverse_change_allocation(uuid,uuid,text)',
    'app.approve_boq_progress_batch(uuid,uuid)',
    'app.finalize_boq_progress_billing(uuid,uuid,uuid,numeric,char)',
    'app.supersede_boq_progress_batch(uuid,uuid,text)',
    'app.boq_can_see_money(uuid)',
    'app.boq_guc_on(text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;

  -- Internal billing primitives: not callable by authenticated tenants.
  FOREACH fn IN ARRAY ARRAY[
    'app.claim_boq_progress_batch_for_billing(uuid,uuid)',
    'app.revert_boq_progress_batch_billing_claim(uuid,uuid)',
    'app.insert_boq_progress_billing_link(uuid,uuid,uuid,numeric,char)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
--------------------------------------------------------------------------------
-- 11) FINAL INTEGRITY CORRECTION (owner SQL review blockers)
--------------------------------------------------------------------------------

-- 11.1 ChangeOrder model: existence = approved commercial change.
-- Do NOT add change_orders.status. Pending lives on ChangeRequest only.
-- Allocation integrity / require helpers are finalized in section 12.

-- 11.3 Secure views: owner-style read BUT membership-filtered (no cross-tenant)
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.boq_nodes_secure
WITH (security_invoker = false) AS
SELECT
  n.id,
  n.organization_id,
  n.boq_id,
  n.parent_id,
  n.node_kind,
  n.item_code,
  n.description,
  n.unit,
  n.pricing_type,
  n.original_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_unit_price ELSE 0::numeric(18,6) END AS original_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_amount ELSE 0::numeric(18,6) END AS original_amount,
  n.current_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_unit_price ELSE 0::numeric(18,6) END AS current_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_amount ELSE 0::numeric(18,6) END AS current_amount,
  n.opening_approved_quantity,
  n.opening_billed_quantity,
  n.work_package_id,
  n.cost_category_id,
  n.budget_line_id,
  n.source_change_order_id,
  n.status,
  n.sort_order,
  n.notes,
  n.archived_at,
  n.created_at,
  n.updated_at
FROM public.boq_nodes n
WHERE app.is_org_member(n.organization_id);

CREATE OR REPLACE VIEW public.boq_progress_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id,
  l.organization_id,
  l.batch_id,
  l.boq_node_id,
  l.measured_quantity,
  l.previous_approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.approved_quantity ELSE l.measured_quantity END AS approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_price_snapshot ELSE 0::numeric(18,6) END AS unit_price_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency,
  l.notes,
  l.created_at,
  l.updated_at
FROM public.boq_progress_lines l
WHERE app.is_org_member(l.organization_id);

CREATE OR REPLACE VIEW public.boq_change_allocations_secure
WITH (security_invoker = false) AS
SELECT
  a.id,
  a.organization_id,
  a.project_id,
  a.boq_id,
  a.change_order_id,
  a.boq_node_id,
  a.allocation_kind,
  a.quantity_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.unit_price_delta ELSE 0::numeric(18,6) END AS unit_price_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.amount_delta ELSE 0::numeric(18,6) END AS amount_delta,
  a.currency,
  a.notes,
  a.reverses_allocation_id,
  a.created_via,
  a.created_by_user_id,
  a.created_at
FROM public.boq_change_allocations a
WHERE app.is_org_member(a.organization_id);

GRANT SELECT ON public.boq_nodes_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_progress_lines_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_change_allocations_secure TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 11.4 Node identity lock + activation protect uses OLD.boq_id
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_after_activate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.boq_id IS DISTINCT FROM OLD.boq_id THEN
      RAISE EXCEPTION 'boq_nodes: organization_id/boq_id are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- Always evaluate against the node's owned BOQ (OLD on update).
  SELECT status INTO boq_status
  FROM public.project_boqs
  WHERE id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.boq_id ELSE NEW.boq_id END
    AND organization_id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.organization_id ELSE NEW.organization_id END;

  IF boq_status IS NULL OR boq_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_nodes: insert into non-draft BOQ requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
       OR NEW.original_unit_price IS DISTINCT FROM OLD.original_unit_price
       OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
       OR NEW.node_kind IS DISTINCT FROM OLD.node_kind
       OR NEW.pricing_type IS DISTINCT FROM OLD.pricing_type
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.item_code IS DISTINCT FROM OLD.item_code
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.source_change_order_id IS DISTINCT FROM OLD.source_change_order_id THEN
      RAISE EXCEPTION 'boq_nodes: original/baseline immutable after activation'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF (
      NEW.current_quantity IS DISTINCT FROM OLD.current_quantity
      OR NEW.current_unit_price IS DISTINCT FROM OLD.current_unit_price
      OR NEW.current_amount IS DISTINCT FROM OLD.current_amount
      OR NEW.opening_approved_quantity IS DISTINCT FROM OLD.opening_approved_quantity
      OR NEW.opening_billed_quantity IS DISTINCT FROM OLD.opening_billed_quantity
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    ) AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
      RAISE EXCEPTION 'boq_nodes: current_* changes after activation require allocation path'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 11.5 project_boqs identity lock after draft
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.project_boqs_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_project uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'project_boqs: organization_id is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status IS DISTINCT FROM 'draft' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.version_number IS DISTINCT FROM OLD.version_number
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.progress_mode IS DISTINCT FROM OLD.progress_mode THEN
        RAISE EXCEPTION 'project_boqs: financial identity fields locked after draft'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF (NEW.activated_at IS DISTINCT FROM OLD.activated_at
          OR NEW.activated_by_user_id IS DISTINCT FROM OLD.activated_by_user_id
          OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
          OR NEW.superseded_by_boq_id IS DISTINCT FROM OLD.superseded_by_boq_id)
         AND NOT app.boq_guc_on('app.boq_lifecycle_write') THEN
        RAISE EXCEPTION 'project_boqs: activation/archive metadata requires lifecycle function'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT app.boq_guc_on('app.boq_lifecycle_write') THEN
      RAISE EXCEPTION 'project_boqs: status changes require lifecycle function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
      NULL;
    ELSIF OLD.status = 'active' AND NEW.status IN ('superseded', 'archived') THEN
      NULL;
    ELSIF OLD.status = 'superseded' AND NEW.status = 'archived' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'project_boqs: illegal status transition % â†’ %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.superseded_by_boq_id IS DISTINCT FROM OLD.superseded_by_boq_id
     AND NEW.superseded_by_boq_id IS NOT NULL THEN
    IF NOT app.boq_guc_on('app.boq_lifecycle_write') THEN
      RAISE EXCEPTION 'project_boqs: superseded_by requires lifecycle function'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT project_id INTO target_project
    FROM public.project_boqs
    WHERE id = NEW.superseded_by_boq_id
      AND organization_id = NEW.organization_id;
    IF target_project IS NULL OR target_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'project_boqs: superseded_by_boq_id must be same org and project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 11.6 Subcontractor valuation line same-schedule + proposed AP bill FK
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuation_line_same_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_schedule uuid;
  line_schedule uuid;
BEGIN
  SELECT schedule_id INTO v_schedule
  FROM public.boq_subcontractor_valuations
  WHERE id = NEW.valuation_id AND organization_id = NEW.organization_id;
  SELECT schedule_id INTO line_schedule
  FROM public.boq_subcontractor_schedule_lines
  WHERE id = NEW.schedule_line_id AND organization_id = NEW.organization_id;
  IF v_schedule IS NULL OR line_schedule IS NULL OR v_schedule IS DISTINCT FROM line_schedule THEN
    RAISE EXCEPTION 'boq_sub_valuation_lines: schedule_line must belong to valuation schedule'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuation_line_same_schedule_trg ON public.boq_subcontractor_valuation_lines;
CREATE TRIGGER boq_sub_valuation_line_same_schedule_trg
  BEFORE INSERT OR UPDATE OF valuation_id, schedule_line_id, organization_id
  ON public.boq_subcontractor_valuation_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_valuation_line_same_schedule_guard();

CREATE OR REPLACE FUNCTION app.boq_sub_valuation_proposed_bill_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  bill_org uuid;
  bill_vendor uuid;
  sched_vendor_eng uuid;
  eng_vendor uuid;
BEGIN
  IF NEW.proposed_vendor_bill_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Explicit AP proposal: must reference same-org ap_bills when set.
  SELECT organization_id, vendor_id INTO bill_org, bill_vendor
  FROM public.ap_bills
  WHERE id = NEW.proposed_vendor_bill_id;
  IF bill_org IS NULL OR bill_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed_vendor_bill_id must be same-org ap_bills'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT vendor_engagement_id INTO sched_vendor_eng
  FROM public.boq_subcontractor_schedules
  WHERE id = NEW.schedule_id AND organization_id = NEW.organization_id;
  SELECT vendor_id INTO eng_vendor
  FROM public.vendor_engagements
  WHERE id = sched_vendor_eng AND organization_id = NEW.organization_id;
  IF eng_vendor IS NOT NULL AND bill_vendor IS DISTINCT FROM eng_vendor THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed bill vendor must match schedule engagement'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuation_proposed_bill_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuation_proposed_bill_trg
  BEFORE INSERT OR UPDATE OF proposed_vendor_bill_id, schedule_id, organization_id
  ON public.boq_subcontractor_valuations
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_valuation_proposed_bill_guard();

CREATE OR REPLACE FUNCTION app.boq_sub_valuations_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_sub_valuations: only draft valuations may be hard-deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'proposed_ap') THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('voided', 'proposed_ap') THEN
      RAISE EXCEPTION 'boq_sub_valuations: illegal status transition from %', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.period_label IS DISTINCT FROM OLD.period_label THEN
      RAISE EXCEPTION 'boq_sub_valuations: approved history is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuations_history_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuations_history_trg
  BEFORE UPDATE OR DELETE ON public.boq_subcontractor_valuations
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_valuations_history_guard();

--------------------------------------------------------------------------------
-- 11.7 Billing link void + AR void release + supersede after void
--------------------------------------------------------------------------------

ALTER TABLE public.boq_progress_billing_links
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE OR REPLACE FUNCTION app.release_boq_progress_after_billing_void(
  p_organization_id uuid,
  p_billing_record_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT l.id AS link_id, l.progress_batch_id
    FROM public.boq_progress_billing_links l
    WHERE l.organization_id = p_organization_id
      AND l.billing_record_id = p_billing_record_id
      AND l.voided_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.boq_progress_billing_links
    SET voided_at = now()
    WHERE id = r.link_id AND organization_id = p_organization_id;

    -- If no other effective links remain, restore batch to approved for correction.
    IF NOT EXISTS (
      SELECT 1 FROM public.boq_progress_billing_links x
      WHERE x.progress_batch_id = r.progress_batch_id
        AND x.organization_id = p_organization_id
        AND x.voided_at IS NULL
    ) THEN
      PERFORM app.boq_latch_acquire('billing_claim');
      PERFORM set_config('app.boq_billing_claim_write', 'on', true);
      UPDATE public.boq_progress_batches
      SET status = 'approved', updated_at = now()
      WHERE id = r.progress_batch_id
        AND organization_id = p_organization_id
        AND status = 'billed';
      PERFORM app.boq_latch_release('billing_claim');
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_billing_records_void_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'void'
     AND OLD.status IS DISTINCT FROM 'void' THEN
    PERFORM app.release_boq_progress_after_billing_void(NEW.organization_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_billing_records_void_release_trg ON public.billing_records;
CREATE TRIGGER boq_billing_records_void_release_trg
  AFTER UPDATE OF status ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_billing_records_void_release();

-- Cumulative helpers: ignore voided links
CREATE OR REPLACE FUNCTION app.boq_progress_line_counts_toward_cumulative(p_batch_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boq_progress_batches b
    WHERE b.id = p_batch_id AND b.organization_id = p_organization_id
      AND (
        b.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id
            AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
      )
      AND NOT (
        b.status = 'billed'
        AND NOT EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id
            AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id
            AND x.organization_id = b.organization_id
            AND x.voided_at IS NOT NULL
        )
      )
  );
$$;

-- Supersede: approved only (after AR void, batch returns to approved)
CREATE OR REPLACE FUNCTION app.supersede_boq_progress_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_period_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src public.boq_progress_batches%ROWTYPE;
  v_new_id uuid;
  v_cert int;
  v_effective_link int;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'supersede: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'supersede: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_src FROM public.boq_progress_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede: batch not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_effective_link
  FROM public.boq_progress_billing_links
  WHERE progress_batch_id = p_batch_id
    AND organization_id = p_organization_id
    AND voided_at IS NULL;

  IF v_src.status = 'billed' AND v_effective_link > 0 THEN
    RAISE EXCEPTION 'supersede: void the AR billing record first (effective link still present)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_src.status NOT IN ('approved', 'billed') THEN
    RAISE EXCEPTION 'supersede: approved (or billed-after-void) batch required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_src.status = 'billed' AND v_effective_link = 0 THEN
    -- Normalize to approved before supersede.
    PERFORM app.boq_latch_acquire('billing_claim');
    PERFORM set_config('app.boq_billing_claim_write', 'on', true);
    UPDATE public.boq_progress_batches
    SET status = 'approved', updated_at = now()
    WHERE id = p_batch_id AND organization_id = p_organization_id;
    PERFORM app.boq_latch_release('billing_claim');
    v_src.status := 'approved';
  END IF;

  PERFORM app.boq_latch_acquire('correction');
  PERFORM app.boq_latch_acquire('progress_approve');
  PERFORM set_config('app.boq_correction_write', 'on', true);
  PERFORM set_config('app.boq_progress_approve_write', 'on', true);

  BEGIN
  UPDATE public.boq_progress_batches
  SET status = 'superseded', updated_at = now()
  WHERE id = p_batch_id AND organization_id = p_organization_id;

  SELECT coalesce(max(certificate_number), 0) + 1 INTO v_cert
  FROM public.boq_progress_batches
  WHERE organization_id = p_organization_id AND boq_id = v_src.boq_id;

  INSERT INTO public.boq_progress_batches (
    organization_id, project_id, boq_id, certificate_number, period_label,
    period_start, period_end, status, notes, supersedes_batch_id, correction_of_batch_id,
    created_by_user_id
  ) VALUES (
    p_organization_id, v_src.project_id, v_src.boq_id, v_cert,
    coalesce(p_period_label, v_src.period_label || ' (correction)'),
    v_src.period_start, v_src.period_end, 'draft',
    'Correction draft for certificate ' || v_src.certificate_number::text,
    p_batch_id, p_batch_id,
    nullif(current_setting('app.user_id', true), '')::uuid
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.boq_progress_lines (
    organization_id, batch_id, boq_node_id,
    measured_quantity, previous_approved_quantity, approved_quantity,
    unit_price_snapshot, period_amount, currency, notes
  )
  SELECT
    l.organization_id, v_new_id, l.boq_node_id,
    l.measured_quantity, 0, 0,
    0, 0, l.currency,
    coalesce(l.notes, 'Copied from certificate ' || v_src.certificate_number::text)
  FROM public.boq_progress_lines l
  WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('progress_approve');
    PERFORM app.boq_latch_release('correction');
    RAISE;
  END;

  PERFORM app.boq_latch_release('progress_approve');
  PERFORM app.boq_latch_release('correction');
  RETURN v_new_id;
END;
$$;

-- Billing link integrity: only one effective (non-voided) link per batch.
-- History of voided links remains for audit.
DROP INDEX IF EXISTS public.boq_progress_billing_links_batch_uq;
CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_billing_links_batch_effective_uq
  ON public.boq_progress_billing_links (progress_batch_id)
  WHERE voided_at IS NULL;

--------------------------------------------------------------------------------
-- 11.8 Re-assert internal billing primitive grants (authenticated blocked)
--------------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'app.claim_boq_progress_batch_for_billing(uuid,uuid)',
    'app.revert_boq_progress_batch_billing_claim(uuid,uuid)',
    'app.insert_boq_progress_billing_link(uuid,uuid,uuid,numeric,char)',
    'app.release_boq_progress_after_billing_void(uuid,uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;



--------------------------------------------------------------------------------
-- 12) TRUE FINAL CLOSURE (owner review — no parallel ChangeOrder lifecycle)
--------------------------------------------------------------------------------

-- 12.1 Remove parallel ChangeOrder status lifecycle entirely
DROP TRIGGER IF EXISTS change_orders_status_guard_trg ON public.change_orders;
DROP FUNCTION IF EXISTS app.change_orders_status_guard();
ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_boq_status_known;
ALTER TABLE public.change_orders DROP COLUMN IF EXISTS status;

CREATE OR REPLACE FUNCTION app.boq_change_allocations_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
  boq_status text;
  boq_currency char(3);
  co_project uuid;
  co_currency char(3);
  node_boq uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: history is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: insert requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project_id, status, currency INTO boq_project, boq_status, boq_currency
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id;
  IF boq_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF boq_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ must be active' USING ERRCODE = 'check_violation';
  END IF;
  NEW.project_id := boq_project;

  -- ChangeOrder row existence = approved commercial change (pending lives on ChangeRequest).
  SELECT project_id, currency INTO co_project, co_currency
  FROM public.change_orders
  WHERE id = NEW.change_order_id AND organization_id = NEW.organization_id;
  IF co_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: ChangeOrder not found (pending ChangeRequest cannot allocate)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF co_project IS DISTINCT FROM boq_project THEN
    RAISE EXCEPTION 'boq_change_allocations: change order must be same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency IS DISTINCT FROM boq_currency
     OR (co_currency IS NOT NULL AND NEW.currency IS DISTINCT FROM co_currency) THEN
    RAISE EXCEPTION 'boq_change_allocations: currency must match BOQ/ChangeOrder'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.allocation_kind = 'unallocated_contract' THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: unallocated must not reference a node'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('quantity_change', 'unit_price_change', 'lump_sum', 'new_item') THEN
    IF NEW.boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: mapped kind requires boq_node_id'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT boq_id INTO node_boq FROM public.boq_nodes
    WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
    IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
      RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('reversal', 'correction') THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      SELECT boq_id INTO node_boq FROM public.boq_nodes
      WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
      IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
        RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'boq_change_allocations: unknown allocation_kind'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_require_approved_change_order(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_project_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'boq_allocate_change: ChangeOrder required (pending ChangeRequest has no CO)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_project IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'boq_allocate_change: change order must be same project'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 12.2 Subcontractor money: revoke table SELECT; grant safe columns only;
--      money only via secure views (same pattern as main BOQ nodes/lines)
--------------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.boq_subcontractor_schedule_lines FROM authenticated;
GRANT SELECT (
  id, organization_id, schedule_id, boq_node_id, unit, agreed_quantity,
  currency, notes, sort_order, created_at, updated_at
) ON public.boq_subcontractor_schedule_lines TO authenticated;
-- Column-level SELECT revoke must not strip write privileges (manage path).
GRANT INSERT, UPDATE, DELETE ON public.boq_subcontractor_schedule_lines TO authenticated;

REVOKE SELECT ON TABLE public.boq_subcontractor_valuation_lines FROM authenticated;
GRANT SELECT (
  id, organization_id, valuation_id, schedule_line_id,
  previous_approved_quantity, approved_quantity,
  currency, notes, created_at, updated_at
) ON public.boq_subcontractor_valuation_lines TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.boq_subcontractor_valuation_lines TO authenticated;

CREATE OR REPLACE VIEW public.boq_subcontractor_schedule_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id, l.organization_id, l.schedule_id, l.boq_node_id, l.unit, l.agreed_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_rate ELSE 0::numeric(18,6) END AS unit_rate,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.amount ELSE 0::numeric(18,6) END AS amount,
  l.currency, l.notes, l.sort_order, l.created_at, l.updated_at
FROM public.boq_subcontractor_schedule_lines l
WHERE app.is_org_member(l.organization_id);

CREATE OR REPLACE VIEW public.boq_subcontractor_valuation_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id, l.organization_id, l.valuation_id, l.schedule_line_id,
  l.previous_approved_quantity, l.approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_rate_snapshot ELSE 0::numeric(18,6) END AS unit_rate_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency, l.notes, l.created_at, l.updated_at
FROM public.boq_subcontractor_valuation_lines l
WHERE app.is_org_member(l.organization_id);

GRANT SELECT ON public.boq_subcontractor_schedule_lines_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_subcontractor_valuation_lines_secure TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 12.3 Subcontractor schedule lifecycle + draft-only line mutations
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'boq_sub_schedules: organization_id immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.boq_id IS DISTINCT FROM OLD.boq_id
         OR NEW.vendor_engagement_id IS DISTINCT FROM OLD.vendor_engagement_id
         OR NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'boq_sub_schedules: identity locked after draft'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        NULL;
      ELSIF OLD.status = 'active' AND NEW.status = 'archived' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'boq_sub_schedules: illegal status % → %', OLD.status, NEW.status
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_sub_schedules: hard delete draft only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_lifecycle_trg ON public.boq_subcontractor_schedules;
CREATE TRIGGER boq_sub_schedule_lifecycle_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_schedules
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_schedule_lifecycle_guard();

DROP POLICY IF EXISTS boq_sub_schedules_tenant_write ON public.boq_subcontractor_schedules;
DROP POLICY IF EXISTS boq_sub_schedules_tenant_insert ON public.boq_subcontractor_schedules;
DROP POLICY IF EXISTS boq_sub_schedules_tenant_update ON public.boq_subcontractor_schedules;
DROP POLICY IF EXISTS boq_sub_schedules_tenant_delete ON public.boq_subcontractor_schedules;

CREATE POLICY boq_sub_schedules_tenant_insert ON public.boq_subcontractor_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND status = 'draft'
  );
CREATE POLICY boq_sub_schedules_tenant_update ON public.boq_subcontractor_schedules
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_sub_schedules_tenant_delete ON public.boq_subcontractor_schedules
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.manage')
    AND status = 'draft'
  );

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_line_draft_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sched_status text;
BEGIN
  SELECT status INTO sched_status
  FROM public.boq_subcontractor_schedules
  WHERE id = COALESCE(NEW.schedule_id, OLD.schedule_id)
    AND organization_id = COALESCE(NEW.organization_id, OLD.organization_id);
  IF sched_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_sub_schedule_lines: mutations require draft schedule'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    NEW.amount := round(NEW.agreed_quantity * NEW.unit_rate, 6);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_line_draft_only_trg ON public.boq_subcontractor_schedule_lines;
CREATE TRIGGER boq_sub_schedule_line_draft_only_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_schedule_lines
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_schedule_line_draft_only_guard();

--------------------------------------------------------------------------------
-- 12.4 Valuation lifecycle + line immutability after approval
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuations_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_valuations: only draft may be hard-deleted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status IN ('approved', 'voided') THEN
      NULL;
    ELSIF OLD.status = 'approved' AND NEW.status IN ('proposed_ap', 'voided') THEN
      NULL;
    ELSIF OLD.status = 'proposed_ap' AND NEW.status = 'voided' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'boq_sub_valuations: illegal status % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.status IN ('approved', 'proposed_ap', 'voided') THEN
    IF NEW.period_label IS DISTINCT FROM OLD.period_label
       OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id THEN
      RAISE EXCEPTION 'boq_sub_valuations: approved history immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuations_history_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuations_history_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_valuations
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_valuations_history_guard();

CREATE OR REPLACE FUNCTION app.boq_sub_valuation_line_draft_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  val_status text;
  line_rate numeric(18,6);
  line_currency char(3);
BEGIN
  SELECT status INTO val_status
  FROM public.boq_subcontractor_valuations
  WHERE id = COALESCE(NEW.valuation_id, OLD.valuation_id)
    AND organization_id = COALESCE(NEW.organization_id, OLD.organization_id);

  IF TG_OP = 'DELETE' THEN
    IF val_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: delete requires draft valuation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF val_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_sub_valuation_lines: mutations require draft valuation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT unit_rate, currency INTO line_rate, line_currency
  FROM public.boq_subcontractor_schedule_lines
  WHERE id = NEW.schedule_line_id AND organization_id = NEW.organization_id;
  IF line_rate IS NULL THEN
    RAISE EXCEPTION 'boq_sub_valuation_lines: schedule line not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.unit_rate_snapshot := line_rate;
  NEW.currency := line_currency;
  NEW.period_amount := round(NEW.approved_quantity * NEW.unit_rate_snapshot, 6);
  IF NEW.approved_quantity < 0 THEN
    RAISE EXCEPTION 'boq_sub_valuation_lines: negative approved requires correction model'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuation_line_draft_only_trg ON public.boq_subcontractor_valuation_lines;
CREATE TRIGGER boq_sub_valuation_line_draft_only_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_valuation_lines
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_valuation_line_draft_only_guard();

--------------------------------------------------------------------------------
-- 12.5 Proposed AP bill: organization + vendor + project + currency
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuation_proposed_bill_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  bill_org uuid;
  bill_vendor uuid;
  bill_project uuid;
  bill_currency char(3);
  sched_project uuid;
  sched_currency char(3);
  sched_vendor_eng uuid;
  eng_vendor uuid;
BEGIN
  IF NEW.proposed_vendor_bill_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT organization_id, vendor_id, project_id, currency
    INTO bill_org, bill_vendor, bill_project, bill_currency
  FROM public.ap_bills WHERE id = NEW.proposed_vendor_bill_id;
  IF bill_org IS NULL OR bill_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed bill must be same-org ap_bills'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT project_id, currency, vendor_engagement_id
    INTO sched_project, sched_currency, sched_vendor_eng
  FROM public.boq_subcontractor_schedules
  WHERE id = NEW.schedule_id AND organization_id = NEW.organization_id;
  SELECT vendor_id INTO eng_vendor
  FROM public.vendor_engagements
  WHERE id = sched_vendor_eng AND organization_id = NEW.organization_id;
  IF eng_vendor IS NOT NULL AND bill_vendor IS DISTINCT FROM eng_vendor THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed bill vendor mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF bill_project IS DISTINCT FROM sched_project THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed bill project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF bill_currency IS DISTINCT FROM sched_currency THEN
    RAISE EXCEPTION 'boq_sub_valuations: proposed bill currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuation_proposed_bill_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuation_proposed_bill_trg
  BEFORE INSERT OR UPDATE OF proposed_vendor_bill_id, schedule_id, organization_id
  ON public.boq_subcontractor_valuations
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_sub_valuation_proposed_bill_guard();

--------------------------------------------------------------------------------
-- 12.6 Secure progress lines: never fabricate approved from measured
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.boq_progress_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id,
  l.organization_id,
  l.batch_id,
  l.boq_node_id,
  l.measured_quantity,
  l.previous_approved_quantity,
  l.approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_price_snapshot ELSE 0::numeric(18,6) END AS unit_price_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency,
  l.notes,
  l.created_at,
  l.updated_at
FROM public.boq_progress_lines l
WHERE app.is_org_member(l.organization_id);

GRANT SELECT ON public.boq_progress_lines_secure TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 12.7 SECURITY DEFINER EXECUTE lockdown (all BOQ-related DEFINER helpers)
--------------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  tenant_entry text[] := ARRAY[
    'activate_project_boq',
    'archive_project_boq',
    'boq_allocate_change',
    'boq_reverse_change_allocation',
    'approve_boq_progress_batch',
    'finalize_boq_progress_billing',
    'supersede_boq_progress_batch',
    'boq_can_see_money',
    'boq_guc_on'
  ];
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig,
           p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.prosecdef
      AND (
        p.proname LIKE '%boq%'
        OR p.proname LIKE 'boq_%'
        OR p.proname = 'change_orders_status_guard'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (tenant_entry) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 12.8 BOQ node mapping same-org / same-project integrity
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_mapping_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
  wp_org uuid;
  wp_project uuid;
  cat_org uuid;
  bl_org uuid;
  bl_project uuid;
  co_org uuid;
  co_project uuid;
BEGIN
  SELECT project_id INTO boq_project
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id;

  IF NEW.work_package_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO wp_org, wp_project
    FROM public.work_packages WHERE id = NEW.work_package_id;
    IF wp_org IS NULL OR wp_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'boq_nodes: work_package must be same organization'
        USING ERRCODE = 'check_violation';
    END IF;
    IF wp_project IS DISTINCT FROM boq_project THEN
      RAISE EXCEPTION 'boq_nodes: work_package must be same project as BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.cost_category_id IS NOT NULL THEN
    SELECT organization_id INTO cat_org
    FROM public.cost_categories WHERE id = NEW.cost_category_id;
    IF cat_org IS NULL OR cat_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'boq_nodes: cost_category must be same organization'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.budget_line_id IS NOT NULL THEN
    SELECT bl.organization_id, b.project_id INTO bl_org, bl_project
    FROM public.project_budget_lines bl
    JOIN public.project_budgets b
      ON b.id = bl.budget_id AND b.organization_id = bl.organization_id
    WHERE bl.id = NEW.budget_line_id;
    IF bl_org IS NULL OR bl_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'boq_nodes: budget_line must be same organization'
        USING ERRCODE = 'check_violation';
    END IF;
    IF bl_project IS DISTINCT FROM boq_project THEN
      RAISE EXCEPTION 'boq_nodes: budget_line must be same project as BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.source_change_order_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO co_org, co_project
    FROM public.change_orders WHERE id = NEW.source_change_order_id;
    IF co_org IS NULL OR co_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'boq_nodes: source ChangeOrder must be same organization'
        USING ERRCODE = 'check_violation';
    END IF;
    IF co_project IS DISTINCT FROM boq_project THEN
      RAISE EXCEPTION 'boq_nodes: source ChangeOrder must be same project as BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_mapping_integrity_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_mapping_integrity_trg
  BEFORE INSERT OR UPDATE OF work_package_id, cost_category_id, budget_line_id, source_change_order_id, boq_id, organization_id
  ON public.boq_nodes
  FOR EACH ROW EXECUTE FUNCTION app.boq_nodes_mapping_integrity_guard();

COMMENT ON FUNCTION app.boq_nodes_mapping_integrity_guard() IS
  'Same-org/same-project mapping FKs. WP/cost/budget reclassification after activate is allowed and auditable via app history; originals and source ChangeOrder remain locked by protect trigger.';

-- Ensure mapping guard itself is not PUBLIC-executable
REVOKE ALL ON FUNCTION app.boq_nodes_mapping_integrity_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_nodes_mapping_integrity_guard() FROM authenticated;
GRANT EXECUTE ON FUNCTION app.boq_nodes_mapping_integrity_guard() TO service_role;


--------------------------------------------------------------------------------
-- 13) FINAL CLOSURE — adversarial pattern sweep (reparent, billing net, sub approve)
--------------------------------------------------------------------------------

-- Extend latch map for subcontractor valuation approval
CREATE OR REPLACE FUNCTION app.boq_guc_on(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lower(coalesce(current_setting(p_name, true), '')) IN ('1', 'on', 'true')
    AND app.boq_latch_held(
      CASE p_name
        WHEN 'app.boq_lifecycle_write' THEN 'lifecycle'
        WHEN 'app.boq_allocation_write' THEN 'allocation'
        WHEN 'app.boq_progress_approve_write' THEN 'progress_approve'
        WHEN 'app.boq_billing_link_write' THEN 'billing_link'
        WHEN 'app.boq_billing_claim_write' THEN 'billing_claim'
        WHEN 'app.boq_correction_write' THEN 'correction'
        WHEN 'app.boq_sub_valuation_approve_write' THEN 'sub_valuation_approve'
        ELSE 'allocation'
      END
    );
$$;

--------------------------------------------------------------------------------
-- 13.1 Progress line reparent bypass (OLD + NEW batch must allow mutation)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_progress_lines_locked_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_status text;
  new_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO old_status
    FROM public.boq_progress_batches
    WHERE id = OLD.batch_id AND organization_id = OLD.organization_id;
    IF old_status IN ('approved', 'billed', 'superseded', 'voided')
       AND NOT app.boq_guc_on('app.boq_progress_approve_write')
       AND NOT app.boq_guc_on('app.boq_correction_write') THEN
      RAISE EXCEPTION 'boq_progress_lines: locked batch history is immutable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: both OLD and NEW parents must permit mutation (blocks reparent escape).
  SELECT status INTO old_status
  FROM public.boq_progress_batches
  WHERE id = OLD.batch_id AND organization_id = OLD.organization_id;
  SELECT status INTO new_status
  FROM public.boq_progress_batches
  WHERE id = NEW.batch_id AND organization_id = NEW.organization_id;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'boq_progress_lines: organization_id immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF old_status IN ('approved', 'billed', 'superseded', 'voided')
     AND NOT app.boq_guc_on('app.boq_progress_approve_write')
     AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_lines: locked batch history is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF new_status IN ('approved', 'billed', 'superseded', 'voided')
     AND NOT app.boq_guc_on('app.boq_progress_approve_write')
     AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_lines: cannot reparent into locked batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
     AND (old_status IS DISTINCT FROM 'draft' OR new_status IS DISTINCT FROM 'draft') THEN
    RAISE EXCEPTION 'boq_progress_lines: reparent only between draft batches'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 13.2 Subcontractor schedule line: OLD+NEW draft, currency, non-negative math
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_line_draft_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_status text;
  new_status text;
  sched_currency char(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO old_status
    FROM public.boq_subcontractor_schedules
    WHERE id = OLD.schedule_id AND organization_id = OLD.organization_id;
    IF old_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_schedule_lines: delete requires draft schedule'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'boq_sub_schedule_lines: organization_id immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT status INTO old_status
    FROM public.boq_subcontractor_schedules
    WHERE id = OLD.schedule_id AND organization_id = OLD.organization_id;
    SELECT status, currency INTO new_status, sched_currency
    FROM public.boq_subcontractor_schedules
    WHERE id = NEW.schedule_id AND organization_id = NEW.organization_id;
    IF old_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_schedule_lines: OLD schedule must be draft (no active reparent)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF new_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_schedule_lines: NEW schedule must be draft'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- INSERT
    SELECT status, currency INTO new_status, sched_currency
    FROM public.boq_subcontractor_schedules
    WHERE id = NEW.schedule_id AND organization_id = NEW.organization_id;
    IF new_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_schedule_lines: insert requires draft schedule'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.agreed_quantity < 0 OR NEW.unit_rate < 0 THEN
    RAISE EXCEPTION 'boq_sub_schedule_lines: negative qty/rate requires explicit correction model'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.currency := sched_currency;
  NEW.amount := round(NEW.agreed_quantity * NEW.unit_rate, 6);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_line_draft_only_trg ON public.boq_subcontractor_schedule_lines;
CREATE TRIGGER boq_sub_schedule_line_draft_only_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_schedule_lines
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_schedule_line_draft_only_guard();

--------------------------------------------------------------------------------
-- 13.3 Valuation line: OLD+NEW draft; no approved reparent
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuation_line_draft_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_status text;
  new_status text;
  line_rate numeric(18,6);
  line_currency char(3);
  sched_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO old_status
    FROM public.boq_subcontractor_valuations
    WHERE id = OLD.valuation_id AND organization_id = OLD.organization_id;
    IF old_status IS DISTINCT FROM 'draft'
       AND NOT app.boq_guc_on('app.boq_sub_valuation_approve_write') THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: delete requires draft valuation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: organization_id immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT status INTO old_status
    FROM public.boq_subcontractor_valuations
    WHERE id = OLD.valuation_id AND organization_id = OLD.organization_id;
    SELECT status INTO new_status
    FROM public.boq_subcontractor_valuations
    WHERE id = NEW.valuation_id AND organization_id = NEW.organization_id;

    IF app.boq_guc_on('app.boq_sub_valuation_approve_write') THEN
      -- Canonical approve RPC may stamp previous/rate/amount while parent still draft→approved.
      NULL;
    ELSE
      IF old_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'boq_sub_valuation_lines: OLD valuation must be draft (no approved reparent)'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF new_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'boq_sub_valuation_lines: NEW valuation must be draft'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  ELSE
    SELECT status INTO new_status
    FROM public.boq_subcontractor_valuations
    WHERE id = NEW.valuation_id AND organization_id = NEW.organization_id;
    IF new_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: insert requires draft valuation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT app.boq_guc_on('app.boq_sub_valuation_approve_write') THEN
    SELECT sl.unit_rate, sl.currency, sl.schedule_id
      INTO line_rate, line_currency, sched_id
    FROM public.boq_subcontractor_schedule_lines sl
    WHERE sl.id = NEW.schedule_line_id AND sl.organization_id = NEW.organization_id;
    IF line_rate IS NULL THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: schedule line not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.unit_rate_snapshot := line_rate;
    NEW.currency := line_currency;
    NEW.period_amount := round(NEW.approved_quantity * NEW.unit_rate_snapshot, 6);
    IF NEW.approved_quantity < 0 THEN
      RAISE EXCEPTION 'boq_sub_valuation_lines: negative approved requires correction model'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuation_line_draft_only_trg ON public.boq_subcontractor_valuation_lines;
CREATE TRIGGER boq_sub_valuation_line_draft_only_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_valuation_lines
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_valuation_line_draft_only_guard();

--------------------------------------------------------------------------------
-- 13.4 Valuation parent: canonical approve latch, evidence stamp, field locks
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuations_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.approved_at := NULL;
    NEW.approved_by_user_id := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_valuations: only draft may be hard-deleted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: organization_id immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_approve_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: approve only via approve_boq_subcontractor_valuation'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.approved_at := clock_timestamp();
      NEW.approved_by_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
    ELSIF OLD.status = 'draft' AND NEW.status = 'voided' THEN
      NULL;
    ELSIF OLD.status = 'approved' AND NEW.status = 'proposed_ap' THEN
      IF NEW.proposed_vendor_bill_id IS NULL THEN
        RAISE EXCEPTION 'boq_sub_valuations: proposed_ap requires proposed_vendor_bill_id'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'voided' THEN
      NULL;
    ELSIF OLD.status = 'proposed_ap' AND NEW.status = 'voided' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'boq_sub_valuations: illegal status % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'approved'
        AND NEW.proposed_vendor_bill_id IS DISTINCT FROM OLD.proposed_vendor_bill_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: set proposed bill only via approved→proposed_ap'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('approved', 'proposed_ap', 'voided') THEN
    IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
       OR NEW.period_label IS DISTINCT FROM OLD.period_label
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'boq_sub_valuations: approval evidence / identity immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('proposed_ap', 'voided')
       AND NEW.proposed_vendor_bill_id IS DISTINCT FROM OLD.proposed_vendor_bill_id THEN
      RAISE EXCEPTION 'boq_sub_valuations: proposed bill immutable after proposed_ap/void'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- Reject client-forged approval evidence while draft
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id THEN
      RAISE EXCEPTION 'boq_sub_valuations: cannot forge approved_at/by while draft'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuations_history_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuations_history_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_valuations
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_valuations_history_guard();

--------------------------------------------------------------------------------
-- 13.5 Canonical subcontractor valuation approval (cumulative + row locks)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.approve_boq_subcontractor_valuation(
  p_organization_id uuid,
  p_valuation_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_val public.boq_subcontractor_valuations%ROWTYPE;
  v_sched public.boq_subcontractor_schedules%ROWTYPE;
  r record;
  v_prev numeric(18,6);
  v_period numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'approve_boq_sub_valuation: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'approve_boq_sub_valuation: requires boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_val
  FROM public.boq_subcontractor_valuations
  WHERE id = p_valuation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_val.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'approve_boq_sub_valuation: draft valuation required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sched
  FROM public.boq_subcontractor_schedules
  WHERE id = v_val.schedule_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_sched.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'approve_boq_sub_valuation: active schedule required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('sub_valuation_approve');
  PERFORM set_config('app.boq_sub_valuation_approve_write', 'on', true);

  BEGIN
    FOR r IN
      SELECT l.*, sl.agreed_quantity, sl.unit_rate, sl.currency AS line_currency, sl.id AS sl_id
      FROM public.boq_subcontractor_valuation_lines l
      JOIN public.boq_subcontractor_schedule_lines sl
        ON sl.id = l.schedule_line_id AND sl.organization_id = l.organization_id
      WHERE l.valuation_id = p_valuation_id AND l.organization_id = p_organization_id
      FOR UPDATE OF l, sl
    LOOP
      SELECT coalesce(sum(l2.approved_quantity), 0) INTO v_prev
      FROM public.boq_subcontractor_valuation_lines l2
      JOIN public.boq_subcontractor_valuations v2
        ON v2.id = l2.valuation_id AND v2.organization_id = l2.organization_id
      WHERE l2.organization_id = p_organization_id
        AND l2.schedule_line_id = r.sl_id
        AND v2.id IS DISTINCT FROM p_valuation_id
        AND v2.status IN ('approved', 'proposed_ap');

      v_period := r.approved_quantity;
      IF v_period < 0 THEN
        RAISE EXCEPTION 'approve_boq_sub_valuation: negative period requires correction model'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_prev + v_period > r.agreed_quantity THEN
        RAISE EXCEPTION 'approve_boq_sub_valuation: cumulative % exceeds agreed %',
          v_prev + v_period, r.agreed_quantity
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE public.boq_subcontractor_valuation_lines
      SET previous_approved_quantity = v_prev,
          unit_rate_snapshot = r.unit_rate,
          period_amount = round(v_period * r.unit_rate, 6),
          currency = r.line_currency,
          updated_at = now()
      WHERE id = r.id AND organization_id = p_organization_id;
    END LOOP;

    UPDATE public.boq_subcontractor_valuations
    SET status = 'approved', updated_at = now()
    WHERE id = p_valuation_id AND organization_id = p_organization_id AND status = 'draft';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('sub_valuation_approve');
    RAISE;
  END;

  PERFORM app.boq_latch_release('sub_valuation_approve');
  RETURN p_valuation_id;
END;
$$;

--------------------------------------------------------------------------------
-- 13.6 BOQ billing link: net = AR subtotal; finalized invoice only
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.insert_boq_progress_billing_link(
  p_organization_id uuid,
  p_progress_batch_id uuid,
  p_billing_record_id uuid,
  p_period_net_amount numeric,
  p_currency char(3)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_line_sum numeric(18,6);
  v_subtotal numeric(18,6);
  v_tax numeric(18,6);
  v_total numeric(18,6);
  v_bill_currency char(3);
  v_bill_status text;
  v_bill_kind text;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'insert link: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.billing.create')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'insert link: requires billing permission' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(sum(period_amount), 0) INTO v_line_sum
  FROM public.boq_progress_lines
  WHERE batch_id = p_progress_batch_id AND organization_id = p_organization_id;

  SELECT
    subtotal_amount::numeric,
    coalesce(tax_amount::numeric, 0),
    total_amount::numeric,
    currency,
    status::text,
    kind::text
  INTO v_subtotal, v_tax, v_total, v_bill_currency, v_bill_status, v_bill_kind
  FROM public.billing_records
  WHERE id = p_billing_record_id AND organization_id = p_organization_id;

  IF v_subtotal IS NULL THEN
    RAISE EXCEPTION 'insert link: billing record not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_bill_status IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'insert link: billing_records.status must be finalized (got %)', v_bill_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill_kind IS DISTINCT FROM 'invoice' THEN
    RAISE EXCEPTION 'insert link: billing kind must be invoice (got %)', v_bill_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency IS DISTINCT FROM v_bill_currency THEN
    RAISE EXCEPTION 'insert link: currency must match billing record' USING ERRCODE = 'check_violation';
  END IF;
  IF p_period_net_amount IS DISTINCT FROM v_line_sum THEN
    RAISE EXCEPTION 'insert link: amount must equal sum of approved period lines'
      USING ERRCODE = 'check_violation';
  END IF;
  -- BOQ period_net is NET — compare to AR subtotal, never total (VAT separate).
  IF p_period_net_amount IS DISTINCT FROM v_subtotal THEN
    RAISE EXCEPTION 'insert link: BOQ period_net must equal billing_records.subtotal_amount'
      USING ERRCODE = 'check_violation';
  END IF;
  IF round(v_subtotal + v_tax, 6) IS DISTINCT FROM round(v_total, 6) THEN
    RAISE EXCEPTION 'insert link: AR tax/total invariant broken'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('billing_link');
  PERFORM set_config('app.boq_billing_link_write', 'on', true);

  BEGIN
  INSERT INTO public.boq_progress_billing_links (
    organization_id, progress_batch_id, billing_record_id,
    period_net_amount, currency, created_by_user_id
  ) VALUES (
    p_organization_id, p_progress_batch_id, p_billing_record_id,
    p_period_net_amount, p_currency,
    nullif(current_setting('app.user_id', true), '')::uuid
  ) RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('billing_link');
    RAISE;
  END;

  PERFORM app.boq_latch_release('billing_link');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_progress_billing_links_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_project uuid;
  batch_status text;
  bill_project uuid;
  bill_org uuid;
  bill_currency char(3);
  bill_status text;
  bill_kind text;
  bill_subtotal numeric(18,6);
BEGIN
  IF NOT app.boq_guc_on('app.boq_billing_link_write') THEN
    RAISE EXCEPTION 'boq_progress_billing_links: insert requires billing path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project_id, status INTO batch_project, batch_status
  FROM public.boq_progress_batches
  WHERE id = NEW.progress_batch_id AND organization_id = NEW.organization_id;

  SELECT project_id, organization_id, currency, status::text, kind::text, subtotal_amount::numeric
    INTO bill_project, bill_org, bill_currency, bill_status, bill_kind, bill_subtotal
  FROM public.billing_records
  WHERE id = NEW.billing_record_id;

  IF batch_project IS NULL OR bill_org IS NULL THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch or billing missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF bill_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'boq_progress_billing_links: billing org mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch_project IS DISTINCT FROM bill_project THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch and billing must share project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch_status IS DISTINCT FROM 'billed' THEN
    RAISE EXCEPTION 'boq_progress_billing_links: batch must be billed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency IS DISTINCT FROM bill_currency THEN
    RAISE EXCEPTION 'boq_progress_billing_links: currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF bill_status IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'boq_progress_billing_links: AR must be finalized'
      USING ERRCODE = 'check_violation';
  END IF;
  IF bill_kind IS DISTINCT FROM 'invoice' THEN
    RAISE EXCEPTION 'boq_progress_billing_links: AR kind must be invoice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.period_net_amount IS DISTINCT FROM bill_subtotal THEN
    RAISE EXCEPTION 'boq_progress_billing_links: period_net must equal AR subtotal'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 13.7 Post-activation mapping lock (WP / cost / budget) — option A
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_after_activate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.boq_id IS DISTINCT FROM OLD.boq_id THEN
      RAISE EXCEPTION 'boq_nodes: organization_id/boq_id are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  SELECT status INTO boq_status
  FROM public.project_boqs
  WHERE id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.boq_id ELSE NEW.boq_id END
    AND organization_id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.organization_id ELSE NEW.organization_id END;

  IF boq_status IS NULL OR boq_status = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_nodes: insert into non-draft BOQ requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
       OR NEW.original_unit_price IS DISTINCT FROM OLD.original_unit_price
       OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
       OR NEW.node_kind IS DISTINCT FROM OLD.node_kind
       OR NEW.pricing_type IS DISTINCT FROM OLD.pricing_type
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.item_code IS DISTINCT FROM OLD.item_code
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.source_change_order_id IS DISTINCT FROM OLD.source_change_order_id THEN
      RAISE EXCEPTION 'boq_nodes: original/baseline immutable after activation'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Classification mappings locked after activation (no silent report drift).
    IF NEW.work_package_id IS DISTINCT FROM OLD.work_package_id
       OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
       OR NEW.budget_line_id IS DISTINCT FROM OLD.budget_line_id THEN
      RAISE EXCEPTION 'boq_nodes: WP/cost/budget mappings locked after BOQ activation'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF (
      NEW.current_quantity IS DISTINCT FROM OLD.current_quantity
      OR NEW.current_unit_price IS DISTINCT FROM OLD.current_unit_price
      OR NEW.current_amount IS DISTINCT FROM OLD.current_amount
      OR NEW.opening_approved_quantity IS DISTINCT FROM OLD.opening_approved_quantity
      OR NEW.opening_billed_quantity IS DISTINCT FROM OLD.opening_billed_quantity
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    ) AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
      RAISE EXCEPTION 'boq_nodes: current_* changes after activation require allocation path'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.boq_nodes_mapping_integrity_guard() IS
  'Same-org/same-project mapping FKs. After BOQ activation, WP/cost/budget mappings are locked by protect trigger.';

--------------------------------------------------------------------------------
-- 13.8 Grants / DEFINER lockdown for new RPC
--------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION app.approve_boq_subcontractor_valuation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.approve_boq_subcontractor_valuation(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.approve_boq_subcontractor_valuation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.approve_boq_subcontractor_valuation(uuid, uuid) TO service_role;

DO $$
DECLARE
  r record;
  tenant_entry text[] := ARRAY[
    'activate_project_boq',
    'archive_project_boq',
    'boq_allocate_change',
    'boq_reverse_change_allocation',
    'approve_boq_progress_batch',
    'approve_boq_subcontractor_valuation',
    'finalize_boq_progress_billing',
    'supersede_boq_progress_batch',
    'boq_can_see_money',
    'boq_guc_on'
  ];
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig,
           p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.prosecdef
      AND (p.proname LIKE '%boq%' OR p.proname LIKE 'boq_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (tenant_entry) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 14) OWNER FULL-BUNDLE CLOSURE (advanced approve, exact reverse, hierarchy,
--     subcontractor canonical lifecycle). Additive only; does not rewrite 0000-0034.
--------------------------------------------------------------------------------

-- Latch map extensions for subcontractor schedule/valuation lifecycle RPCs
CREATE OR REPLACE FUNCTION app.boq_guc_on(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lower(coalesce(current_setting(p_name, true), '')) IN ('1', 'on', 'true')
    AND app.boq_latch_held(
      CASE p_name
        WHEN 'app.boq_lifecycle_write' THEN 'lifecycle'
        WHEN 'app.boq_allocation_write' THEN 'allocation'
        WHEN 'app.boq_progress_approve_write' THEN 'progress_approve'
        WHEN 'app.boq_billing_link_write' THEN 'billing_link'
        WHEN 'app.boq_billing_claim_write' THEN 'billing_claim'
        WHEN 'app.boq_correction_write' THEN 'correction'
        WHEN 'app.boq_sub_valuation_approve_write' THEN 'sub_valuation_approve'
        WHEN 'app.boq_sub_schedule_lifecycle_write' THEN 'sub_schedule_lifecycle'
        WHEN 'app.boq_sub_valuation_lifecycle_write' THEN 'sub_valuation_lifecycle'
        ELSE 'allocation'
      END
    );
$$;

--------------------------------------------------------------------------------
-- 14.1 Progress submit: NEVER forge approved_* before approve RPC (any role)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_progress_lines_submit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- INSERT always stages measured only; approve RPC stamps financial fields under latch.
  IF TG_OP = 'INSERT' AND NOT app.boq_guc_on('app.boq_progress_approve_write')
     AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    NEW.approved_quantity := 0;
    NEW.previous_approved_quantity := 0;
    NEW.unit_price_snapshot := 0;
    NEW.period_amount := 0;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT app.boq_guc_on('app.boq_progress_approve_write')
     AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    IF NEW.approved_quantity IS DISTINCT FROM OLD.approved_quantity
       OR NEW.previous_approved_quantity IS DISTINCT FROM OLD.previous_approved_quantity
       OR NEW.unit_price_snapshot IS DISTINCT FROM OLD.unit_price_snapshot
       OR NEW.period_amount IS DISTINCT FROM OLD.period_amount THEN
      RAISE EXCEPTION 'boq_progress_lines: submit cannot forge approved financial fields'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.approved_quantity < 0 AND NOT app.boq_guc_on('app.boq_correction_write') THEN
    RAISE EXCEPTION 'boq_progress_lines: negative approved qty requires correction path'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 14.2 Advanced/simple progress approval (approver-supplied qty in advanced)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.approve_boq_progress_batch(uuid, uuid);

CREATE OR REPLACE FUNCTION app.approve_boq_progress_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_line_approvals jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.boq_progress_batches%ROWTYPE;
  v_boq public.project_boqs%ROWTYPE;
  r record;
  v_prev numeric(18,6);
  v_cum numeric(18,6);
  v_approved numeric(18,6);
  v_price numeric(18,6);
  v_period numeric(18,6);
  v_opening numeric(18,6);
  v_supplied numeric;
  v_mode text;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.progress.approve')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: requires approve/manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.boq_progress_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: draft batch required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = v_batch.boq_id AND organization_id = p_organization_id;
  IF v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  v_mode := coalesce(v_boq.progress_mode, 'simple');
  IF v_mode = 'advanced' AND (p_line_approvals IS NULL OR jsonb_typeof(p_line_approvals) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: advanced mode requires line approvals map'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('progress_approve');
  PERFORM set_config('app.boq_progress_approve_write', 'on', true);

  BEGIN
  FOR r IN
    SELECT l.*, n.current_quantity, n.current_unit_price, n.pricing_type,
           n.opening_approved_quantity, n.opening_billed_quantity
    FROM public.boq_progress_lines l
    JOIN public.boq_nodes n
      ON n.id = l.boq_node_id AND n.organization_id = l.organization_id
    WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id
    FOR UPDATE OF l
  LOOP
    SELECT coalesce(sum(l2.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l2
    JOIN public.boq_progress_batches b2
      ON b2.id = l2.batch_id AND b2.organization_id = l2.organization_id
    WHERE l2.organization_id = p_organization_id
      AND l2.boq_node_id = r.boq_node_id
      AND b2.id IS DISTINCT FROM p_batch_id
      AND (
        b2.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b2.id AND x.organization_id = b2.organization_id
            AND x.voided_at IS NULL
        )
      );
    v_opening := greatest(r.opening_approved_quantity, r.opening_billed_quantity);
    v_prev := v_opening + v_cum;

    IF v_mode = 'simple' THEN
      v_approved := r.measured_quantity;
    ELSE
      v_supplied := NULLIF(p_line_approvals ->> r.id::text, '')::numeric;
      IF v_supplied IS NULL THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: missing approved qty for line %', r.id
          USING ERRCODE = 'check_violation';
      END IF;
      v_approved := v_supplied;
      IF v_approved > r.measured_quantity THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: approved % exceeds measured %',
          v_approved, r.measured_quantity
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_approved < 0 AND NOT app.boq_guc_on('app.boq_correction_write') THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: negative approved not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev + v_approved > r.current_quantity THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: over-measurement vs current quantity'
        USING ERRCODE = 'check_violation';
    END IF;

    v_price := r.current_unit_price;
    IF r.pricing_type = 'lump_sum' THEN
      IF v_approved < 0 OR v_approved > 1 THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: lump_sum approved qty must be 0..1 fraction'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_period := round(v_price * v_approved, 6);

    UPDATE public.boq_progress_lines
    SET previous_approved_quantity = v_prev,
        approved_quantity = v_approved,
        unit_price_snapshot = v_price,
        period_amount = v_period,
        currency = v_boq.currency,
        updated_at = now()
    WHERE id = r.id AND organization_id = p_organization_id;
  END LOOP;

  UPDATE public.boq_progress_batches
  SET status = 'approved',
      approved_at = now(),
      approved_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid,
      updated_at = now()
  WHERE id = p_batch_id AND organization_id = p_organization_id AND status = 'draft';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('progress_approve');
    RAISE;
  END;

  PERFORM app.boq_latch_release('progress_approve');
  RETURN p_batch_id;
END;
$$;

--------------------------------------------------------------------------------
-- 14.3 Exact change allocation (no mixed qty+price) + history-safe reverse
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_allocate_change(
  p_organization_id uuid,
  p_boq_id uuid,
  p_change_order_id uuid,
  p_allocation_kind text,
  p_boq_node_id uuid,
  p_quantity_delta numeric,
  p_unit_price_delta numeric,
  p_amount_delta numeric,
  p_notes text,
  p_new_item jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_alloc_id uuid;
  v_new_node_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_locked numeric(18,6);
  v_cum numeric(18,6);
  v_co_amount numeric(18,6);
  v_co_direction text;
  v_net_allocated numeric(18,6);
  v_qty_delta numeric(18,6);
  v_price_delta numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_allocate_change: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_allocate_change: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_allocate_change: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.change_orders
    WHERE id = p_change_order_id
      AND organization_id = p_organization_id
      AND project_id = v_boq.project_id
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: ChangeOrder required (pending ChangeRequest has no CO)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_qty_delta := coalesce(p_quantity_delta, 0);
  v_price_delta := coalesce(p_unit_price_delta, 0);

  IF p_allocation_kind IN ('quantity_change', 'unit_price_change') THEN
    IF v_qty_delta <> 0 AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: mixed quantity+unit_price change not supported'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'quantity_change' AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: quantity_change may only alter quantity'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'unit_price_change' AND v_qty_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: unit_price_change may only alter unit price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM set_config('app.boq_allocation_write', 'on', true);

  BEGIN
  IF p_allocation_kind = 'unallocated_contract' THEN
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, NULL,
      'unallocated_contract', 0, 0, coalesce(p_amount_delta, 0), v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind = 'new_item' THEN
    IF p_new_item IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: new_item payload required' USING ERRCODE = 'check_violation';
    END IF;
    v_qty := coalesce((p_new_item->>'quantity')::numeric, 0);
    v_price := coalesce((p_new_item->>'unit_price')::numeric, 0);
    IF coalesce(p_new_item->>'pricing_type', 'quantity_unit_price') = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    INSERT INTO public.boq_nodes (
      organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
      original_quantity, original_unit_price, original_amount,
      current_quantity, current_unit_price, current_amount,
      opening_approved_quantity, opening_billed_quantity,
      source_change_order_id, status, sort_order, notes
    ) VALUES (
      p_organization_id, p_boq_id,
      nullif(p_new_item->>'parent_id', '')::uuid,
      'item',
      nullif(p_new_item->>'item_code', ''),
      coalesce(p_new_item->>'description', 'Change item'),
      nullif(p_new_item->>'unit', ''),
      coalesce(p_new_item->>'pricing_type', 'quantity_unit_price'),
      0, 0, 0,
      v_qty, v_price, v_amount,
      0, 0,
      p_change_order_id, 'active', 0,
      coalesce(p_notes, 'Source: Change Order')
    ) RETURNING id INTO v_new_node_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, v_new_node_id,
      'new_item', v_qty, 0, v_amount, v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSE
    IF p_boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: boq_node_id required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = p_boq_node_id AND organization_id = p_organization_id AND boq_id = p_boq_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_allocate_change: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_allocation_kind = 'unit_price_change' THEN
      v_qty := v_node.current_quantity;
      v_price := v_node.current_unit_price + v_price_delta;
    ELSE
      -- quantity_change (default node-bound kind)
      v_qty := v_node.current_quantity + v_qty_delta;
      v_price := v_node.current_unit_price;
      v_price_delta := 0;
    END IF;

    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    SELECT coalesce(sum(l.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l
    JOIN public.boq_progress_batches b
      ON b.id = l.batch_id AND b.organization_id = l.organization_id
    WHERE l.organization_id = p_organization_id
      AND l.boq_node_id = p_boq_node_id
      AND (
        b.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
      );

    v_locked := greatest(v_node.opening_approved_quantity, v_node.opening_billed_quantity) + v_cum;
    IF v_qty < v_locked THEN
      RAISE EXCEPTION 'boq_allocate_change: cannot reduce current below approved/billed floor'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = p_boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, p_boq_node_id,
      CASE
        WHEN p_allocation_kind = 'unit_price_change' THEN 'unit_price_change'
        ELSE 'quantity_change'
      END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN 0 ELSE v_qty_delta END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN v_price_delta ELSE 0 END,
      (v_amount - v_node.current_amount),
      v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  END IF;

  SELECT amount, direction INTO v_co_amount, v_co_direction
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id;

  SELECT coalesce(sum(amount_delta), 0) INTO v_net_allocated
  FROM public.boq_change_allocations
  WHERE organization_id = p_organization_id
    AND change_order_id = p_change_order_id;

  IF abs(v_net_allocated) > v_co_amount + 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: allocation exceeds change order amount'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'addition' AND v_net_allocated < -0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: addition CO cannot net negative'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'reduction' AND v_net_allocated > 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: reduction CO cannot net positive'
      USING ERRCODE = 'check_violation';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  RETURN v_alloc_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_reverse_change_allocation(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src public.boq_change_allocations%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_later_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_src FROM public.boq_change_allocations
  WHERE id = p_allocation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_src.allocation_kind IN ('reversal') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: cannot reverse a reversal'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.boq_change_allocations
    WHERE organization_id = p_organization_id
      AND reverses_allocation_id = p_allocation_id
  ) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: already reversed'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Node-bound: only the latest effective (non-reversed) allocation on that node may reverse.
  IF v_src.boq_node_id IS NOT NULL AND v_src.allocation_kind IS DISTINCT FROM 'unallocated_contract' THEN
    SELECT a.id INTO v_later_id
    FROM public.boq_change_allocations a
    WHERE a.organization_id = p_organization_id
      AND a.boq_node_id = v_src.boq_node_id
      AND a.allocation_kind IS DISTINCT FROM 'reversal'
      AND a.id IS DISTINCT FROM p_allocation_id
      AND (
        a.created_at > v_src.created_at
        OR (a.created_at = v_src.created_at AND a.id > p_allocation_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.boq_change_allocations r
        WHERE r.organization_id = a.organization_id
          AND r.reverses_allocation_id = a.id
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1;
    IF v_later_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: later effective allocation % must be reversed first',
        v_later_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM app.boq_latch_acquire('correction');
  PERFORM set_config('app.boq_allocation_write', 'on', true);
  PERFORM set_config('app.boq_correction_write', 'on', true);

  BEGIN
  IF v_src.boq_node_id IS NOT NULL AND v_src.allocation_kind IS DISTINCT FROM 'unallocated_contract' THEN
    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = v_src.boq_node_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    -- Exact neutralization using immutable source deltas (not path-dependent recompute).
    v_qty := v_node.current_quantity - coalesce(v_src.quantity_delta, 0);
    v_price := v_node.current_unit_price - coalesce(v_src.unit_price_delta, 0);
    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    -- Economic check: node amount change must equal -source.amount_delta.
    IF abs((v_amount - v_node.current_amount) + v_src.amount_delta) > 0.000001 THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: exact neutralization failed (expected amount delta %)',
        -v_src.amount_delta
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = v_src.boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, reverses_allocation_id, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_src.project_id, v_src.boq_id, v_src.change_order_id, v_src.boq_node_id,
      'reversal',
      -coalesce(v_src.quantity_delta, 0),
      -coalesce(v_src.unit_price_delta, 0),
      -v_src.amount_delta,
      v_src.currency,
      coalesce(p_notes, 'Reversal of allocation'),
      p_allocation_id,
      nullif(current_setting('app.user_id', true), '')::uuid,
      'reverse_rpc'
    ) RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, reverses_allocation_id, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_src.project_id, v_src.boq_id, v_src.change_order_id, NULL,
      'reversal', 0, 0, -v_src.amount_delta, v_src.currency,
      coalesce(p_notes, 'Reversal of unallocated'), p_allocation_id,
      nullif(current_setting('app.user_id', true), '')::uuid, 'reverse_rpc'
    ) RETURNING id INTO v_id;
  END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    PERFORM app.boq_latch_release('correction');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  PERFORM app.boq_latch_release('correction');
  RETURN v_id;
END;
$$;


--------------------------------------------------------------------------------
-- 14.4 BOQ hierarchy integrity (self-parent, parent kind, cycles)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_parent_same_boq_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_boq uuid;
  parent_kind text;
  walk_id uuid;
  seen int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'boq_nodes: node cannot parent itself'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT boq_id, node_kind INTO parent_boq, parent_kind
  FROM public.boq_nodes
  WHERE id = NEW.parent_id AND organization_id = NEW.organization_id;
  IF parent_boq IS NULL OR parent_boq IS DISTINCT FROM NEW.boq_id THEN
    RAISE EXCEPTION 'boq_nodes: parent must belong to same BOQ'
      USING ERRCODE = 'check_violation';
  END IF;
  IF parent_kind IS DISTINCT FROM 'chapter' THEN
    RAISE EXCEPTION 'boq_nodes: parent must be a chapter/container node'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cycle detection: walk ancestors; NEW must not appear.
  walk_id := NEW.parent_id;
  WHILE walk_id IS NOT NULL LOOP
    seen := seen + 1;
    IF seen > 64 THEN
      RAISE EXCEPTION 'boq_nodes: hierarchy depth/cycle limit exceeded'
        USING ERRCODE = 'check_violation';
    END IF;
    IF walk_id = NEW.id THEN
      RAISE EXCEPTION 'boq_nodes: hierarchy cycle not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO walk_id
    FROM public.boq_nodes
    WHERE id = walk_id AND organization_id = NEW.organization_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_parent_same_boq_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_parent_same_boq_trg
  BEFORE INSERT OR UPDATE OF parent_id, boq_id, organization_id, id
  ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_parent_same_boq_guard();

--------------------------------------------------------------------------------
-- 14.5 Subcontractor schedule activation (canonical)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_schedule_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'boq_sub_schedules: organization_id immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.boq_id IS DISTINCT FROM OLD.boq_id
         OR NEW.vendor_engagement_id IS DISTINCT FROM OLD.vendor_engagement_id
         OR NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'boq_sub_schedules: identity locked after draft'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT app.boq_guc_on('app.boq_sub_schedule_lifecycle_write') THEN
        RAISE EXCEPTION 'boq_sub_schedules: status changes require canonical RPC'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        NULL;
      ELSIF OLD.status = 'active' AND NEW.status = 'archived' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'boq_sub_schedules: illegal status % â†’ %', OLD.status, NEW.status
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_sub_schedules: hard delete draft only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_schedule_lifecycle_trg ON public.boq_subcontractor_schedules;
CREATE TRIGGER boq_sub_schedule_lifecycle_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_schedules
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_schedule_lifecycle_guard();

CREATE OR REPLACE FUNCTION app.activate_boq_subcontractor_schedule(
  p_organization_id uuid,
  p_schedule_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sched public.boq_subcontractor_schedules%ROWTYPE;
  v_line_count int;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'activate_boq_sub_schedule: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'activate_boq_sub_schedule: requires boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sched
  FROM public.boq_subcontractor_schedules
  WHERE id = p_schedule_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_sched.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'activate_boq_sub_schedule: draft schedule required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.boq_subcontractor_schedule_lines
  WHERE schedule_id = p_schedule_id AND organization_id = p_organization_id;
  IF v_line_count < 1 THEN
    RAISE EXCEPTION 'activate_boq_sub_schedule: at least one line required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('sub_schedule_lifecycle');
  PERFORM set_config('app.boq_sub_schedule_lifecycle_write', 'on', true);
  BEGIN
    UPDATE public.boq_subcontractor_schedules
    SET status = 'active', updated_at = now()
    WHERE id = p_schedule_id AND organization_id = p_organization_id AND status = 'draft';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('sub_schedule_lifecycle');
    RAISE;
  END;
  PERFORM app.boq_latch_release('sub_schedule_lifecycle');
  RETURN p_schedule_id;
END;
$$;

--------------------------------------------------------------------------------
-- 14.6 Subcontractor valuation: proposed_ap / void via canonical RPCs only
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_sub_valuations_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proposed_vendor_bill_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_sub_valuations: proposed_vendor_bill_id must be null on insert'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := 'draft';
    NEW.approved_at := NULL;
    NEW.approved_by_user_id := NULL;
    NEW.proposed_vendor_bill_id := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_sub_valuations: only draft may be hard-deleted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: organization_id immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_approve_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: approve only via approve_boq_subcontractor_valuation'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.approved_at := clock_timestamp();
      NEW.approved_by_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
      -- approved keeps proposed_vendor_bill_id NULL
      NEW.proposed_vendor_bill_id := NULL;
    ELSIF OLD.status = 'draft' AND NEW.status = 'voided' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_lifecycle_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: void only via canonical RPC'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'proposed_ap' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_lifecycle_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: proposed_ap only via canonical RPC'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.proposed_vendor_bill_id IS NULL THEN
        RAISE EXCEPTION 'boq_sub_valuations: proposed_ap requires proposed_vendor_bill_id'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'voided' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_lifecycle_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: void only via canonical RPC'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF OLD.status = 'proposed_ap' AND NEW.status = 'voided' THEN
      IF NOT app.boq_guc_on('app.boq_sub_valuation_lifecycle_write') THEN
        RAISE EXCEPTION 'boq_sub_valuations: void only via canonical RPC'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      RAISE EXCEPTION 'boq_sub_valuations: illegal status % â†’ %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'approved'
        AND NEW.proposed_vendor_bill_id IS DISTINCT FROM OLD.proposed_vendor_bill_id THEN
    RAISE EXCEPTION 'boq_sub_valuations: set proposed bill only via approvedâ†’proposed_ap'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('approved', 'proposed_ap', 'voided') THEN
    IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
       OR NEW.period_label IS DISTINCT FROM OLD.period_label
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'boq_sub_valuations: approval evidence / identity immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('proposed_ap', 'voided')
       AND NEW.proposed_vendor_bill_id IS DISTINCT FROM OLD.proposed_vendor_bill_id THEN
      RAISE EXCEPTION 'boq_sub_valuations: proposed bill immutable after proposed_ap/void'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
       OR NEW.proposed_vendor_bill_id IS DISTINCT FROM OLD.proposed_vendor_bill_id THEN
      RAISE EXCEPTION 'boq_sub_valuations: cannot forge approved_at/by or proposed bill while draft'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_sub_valuations_history_trg ON public.boq_subcontractor_valuations;
CREATE TRIGGER boq_sub_valuations_history_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_subcontractor_valuations
  FOR EACH ROW EXECUTE FUNCTION app.boq_sub_valuations_history_guard();

CREATE OR REPLACE FUNCTION app.propose_boq_subcontractor_valuation_ap(
  p_organization_id uuid,
  p_valuation_id uuid,
  p_vendor_bill_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_val public.boq_subcontractor_valuations%ROWTYPE;
  v_sched public.boq_subcontractor_schedules%ROWTYPE;
  v_bill record;
  v_engagement record;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: requires boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_val
  FROM public.boq_subcontractor_valuations
  WHERE id = p_valuation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_val.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: approved valuation required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_val.proposed_vendor_bill_id IS NOT NULL THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: already has proposed bill'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_sched
  FROM public.boq_subcontractor_schedules
  WHERE id = v_val.schedule_id AND organization_id = p_organization_id
  FOR UPDATE;

  SELECT e.vendor_id, e.project_id INTO v_engagement
  FROM public.vendor_engagements e
  WHERE e.id = v_sched.vendor_engagement_id AND e.organization_id = p_organization_id;

  SELECT b.id, b.organization_id, b.vendor_id, b.project_id, b.currency
  INTO v_bill
  FROM public.ap_bills b
  WHERE b.id = p_vendor_bill_id AND b.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: vendor bill not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_bill.vendor_id IS DISTINCT FROM v_engagement.vendor_id THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: vendor mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill.project_id IS DISTINCT FROM v_sched.project_id THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill.currency IS DISTINCT FROM v_sched.currency THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('sub_valuation_lifecycle');
  PERFORM set_config('app.boq_sub_valuation_lifecycle_write', 'on', true);
  BEGIN
    UPDATE public.boq_subcontractor_valuations
    SET status = 'proposed_ap',
        proposed_vendor_bill_id = p_vendor_bill_id,
        updated_at = now()
    WHERE id = p_valuation_id AND organization_id = p_organization_id AND status = 'approved';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('sub_valuation_lifecycle');
    RAISE;
  END;
  PERFORM app.boq_latch_release('sub_valuation_lifecycle');
  RETURN p_valuation_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.void_boq_subcontractor_valuation(
  p_organization_id uuid,
  p_valuation_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_val public.boq_subcontractor_valuations%ROWTYPE;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'void_boq_sub_valuation: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'void_boq_sub_valuation: requires boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_val
  FROM public.boq_subcontractor_valuations
  WHERE id = p_valuation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_boq_sub_valuation: not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_val.status NOT IN ('draft', 'approved', 'proposed_ap') THEN
    RAISE EXCEPTION 'void_boq_sub_valuation: cannot void from %', v_val.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('sub_valuation_lifecycle');
  PERFORM set_config('app.boq_sub_valuation_lifecycle_write', 'on', true);
  BEGIN
    UPDATE public.boq_subcontractor_valuations
    SET status = 'voided', updated_at = now()
    WHERE id = p_valuation_id AND organization_id = p_organization_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('sub_valuation_lifecycle');
    RAISE;
  END;
  PERFORM app.boq_latch_release('sub_valuation_lifecycle');
  RETURN p_valuation_id;
END;
$$;

--------------------------------------------------------------------------------
-- 14.7 Grants / DEFINER lockdown for section 14 RPCs
--------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION app.approve_boq_progress_batch(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.approve_boq_progress_batch(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION app.approve_boq_progress_batch(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app.approve_boq_progress_batch(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION app.activate_boq_subcontractor_schedule(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.activate_boq_subcontractor_schedule(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.activate_boq_subcontractor_schedule(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.activate_boq_subcontractor_schedule(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.propose_boq_subcontractor_valuation_ap(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.propose_boq_subcontractor_valuation_ap(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.propose_boq_subcontractor_valuation_ap(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.propose_boq_subcontractor_valuation_ap(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.void_boq_subcontractor_valuation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.void_boq_subcontractor_valuation(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.void_boq_subcontractor_valuation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.void_boq_subcontractor_valuation(uuid, uuid) TO service_role;

DO $$
DECLARE
  r record;
  tenant_entry text[] := ARRAY[
    'activate_project_boq',
    'archive_project_boq',
    'boq_allocate_change',
    'boq_reverse_change_allocation',
    'approve_boq_progress_batch',
    'approve_boq_subcontractor_valuation',
    'activate_boq_subcontractor_schedule',
    'propose_boq_subcontractor_valuation_ap',
    'void_boq_subcontractor_valuation',
    'finalize_boq_progress_billing',
    'supersede_boq_progress_batch',
    'boq_can_see_money',
    'boq_guc_on'
  ];
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig,
           p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.prosecdef
      AND (p.proname LIKE '%boq%' OR p.proname LIKE 'boq_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (tenant_entry) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;


--------------------------------------------------------------------------------
-- 15. OWNER V2 CLOSURE � concurrency / draft AP / allocation seq / lump_sum /
--     hierarchy serialize (additive; does not edit 0000�0034)
--------------------------------------------------------------------------------

-- 15.1 Deterministic monotonic allocation ordering (not UUID / not txn-stable now())
CREATE SEQUENCE IF NOT EXISTS public.boq_change_allocation_seq;

ALTER TABLE public.boq_change_allocations
  ADD COLUMN IF NOT EXISTS allocation_seq bigint;

UPDATE public.boq_change_allocations a
SET allocation_seq = s.seq
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM public.boq_change_allocations
) s
WHERE a.id = s.id AND a.allocation_seq IS NULL;

DO $$
DECLARE
  v_max bigint;
BEGIN
  SELECT max(allocation_seq) INTO v_max FROM public.boq_change_allocations;
  IF v_max IS NULL THEN
    -- Next nextval() returns 1.
    PERFORM setval('public.boq_change_allocation_seq', 1, false);
  ELSE
    PERFORM setval('public.boq_change_allocation_seq', v_max, true);
  END IF;
END $$;

ALTER TABLE public.boq_change_allocations
  ALTER COLUMN allocation_seq SET DEFAULT nextval('public.boq_change_allocation_seq');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'boq_change_allocations'
      AND column_name = 'allocation_seq'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.boq_change_allocations
      ALTER COLUMN allocation_seq SET NOT NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS boq_change_allocations_allocation_seq_uq
  ON public.boq_change_allocations (allocation_seq);

-- 15.2 Remove silent lump_sum change-allocation kind (node pricing_type lump_sum remains)
ALTER TABLE public.boq_change_allocations
  DROP CONSTRAINT IF EXISTS boq_change_allocations_kind_known;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.boq_change_allocations WHERE allocation_kind = 'lump_sum'
  ) THEN
    RAISE EXCEPTION
      '0035 §15: cannot remove allocation_kind lump_sum while rows exist — reverse/migrate first';
  END IF;
END $$;

ALTER TABLE public.boq_change_allocations
  ADD CONSTRAINT boq_change_allocations_kind_known CHECK (
    allocation_kind IN (
      'quantity_change',
      'unit_price_change',
      'new_item',
      'unallocated_contract',
      'reversal',
      'correction'
    )
  );

CREATE OR REPLACE FUNCTION app.boq_change_allocations_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_project uuid;
  boq_status text;
  boq_currency char(3);
  co_project uuid;
  co_currency char(3);
  node_boq uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: history is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NOT app.boq_guc_on('app.boq_allocation_write') THEN
    RAISE EXCEPTION 'boq_change_allocations: insert requires allocation path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project_id, status, currency INTO boq_project, boq_status, boq_currency
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id;
  IF boq_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF boq_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_change_allocations: BOQ must be active' USING ERRCODE = 'check_violation';
  END IF;
  NEW.project_id := boq_project;

  SELECT project_id, currency INTO co_project, co_currency
  FROM public.change_orders
  WHERE id = NEW.change_order_id AND organization_id = NEW.organization_id;
  IF co_project IS NULL THEN
    RAISE EXCEPTION 'boq_change_allocations: ChangeOrder not found (pending ChangeRequest cannot allocate)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF co_project IS DISTINCT FROM boq_project THEN
    RAISE EXCEPTION 'boq_change_allocations: change order must be same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency IS DISTINCT FROM boq_currency
     OR (co_currency IS NOT NULL AND NEW.currency IS DISTINCT FROM co_currency) THEN
    RAISE EXCEPTION 'boq_change_allocations: currency must match BOQ/ChangeOrder'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.allocation_kind = 'unallocated_contract' THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: unallocated must not reference a node'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('quantity_change', 'unit_price_change', 'new_item') THEN
    IF NEW.boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_change_allocations: mapped kind requires boq_node_id'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT boq_id INTO node_boq FROM public.boq_nodes
    WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
    IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
      RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.allocation_kind IN ('reversal', 'correction') THEN
    IF NEW.boq_node_id IS NOT NULL THEN
      SELECT boq_id INTO node_boq FROM public.boq_nodes
      WHERE id = NEW.boq_node_id AND organization_id = NEW.organization_id;
      IF node_boq IS NULL OR node_boq IS DISTINCT FROM NEW.boq_id THEN
        RAISE EXCEPTION 'boq_change_allocations: node must belong to BOQ'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'boq_change_allocations: unknown allocation_kind'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;



-- 15.3 Concurrent progress approval: lock shared boq_nodes before cumulative math
CREATE OR REPLACE FUNCTION app.approve_boq_progress_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_line_approvals jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.boq_progress_batches%ROWTYPE;
  v_boq public.project_boqs%ROWTYPE;
  r record;
  v_prev numeric(18,6);
  v_cum numeric(18,6);
  v_approved numeric(18,6);
  v_price numeric(18,6);
  v_period numeric(18,6);
  v_opening numeric(18,6);
  v_supplied numeric;
  v_mode text;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    app.has_org_permission(p_organization_id, 'boq.progress.approve')
    OR app.has_org_permission(p_organization_id, 'boq.manage')
  ) THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: requires approve/manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.boq_progress_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: draft batch required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = v_batch.boq_id AND organization_id = p_organization_id;
  IF v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  v_mode := coalesce(v_boq.progress_mode, 'simple');
  IF v_mode = 'advanced' AND (p_line_approvals IS NULL OR jsonb_typeof(p_line_approvals) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'approve_boq_progress_batch: advanced mode requires line approvals map'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize cumulative consumption of shared contractual quantity across sessions.
  -- Deterministic node ID order avoids multi-line batch deadlocks.
  PERFORM n.id
  FROM public.boq_nodes n
  WHERE n.organization_id = p_organization_id
    AND n.id IN (
      SELECT DISTINCT l.boq_node_id
      FROM public.boq_progress_lines l
      WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id
    )
  ORDER BY n.id
  FOR UPDATE;

  PERFORM app.boq_latch_acquire('progress_approve');
  PERFORM set_config('app.boq_progress_approve_write', 'on', true);

  BEGIN
  FOR r IN
    SELECT l.*, n.current_quantity, n.current_unit_price, n.pricing_type,
           n.opening_approved_quantity, n.opening_billed_quantity
    FROM public.boq_progress_lines l
    JOIN public.boq_nodes n
      ON n.id = l.boq_node_id AND n.organization_id = l.organization_id
    WHERE l.batch_id = p_batch_id AND l.organization_id = p_organization_id
    ORDER BY l.boq_node_id, l.id
    FOR UPDATE OF l
  LOOP
    SELECT coalesce(sum(l2.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l2
    JOIN public.boq_progress_batches b2
      ON b2.id = l2.batch_id AND b2.organization_id = l2.organization_id
    WHERE l2.organization_id = p_organization_id
      AND l2.boq_node_id = r.boq_node_id
      AND b2.id IS DISTINCT FROM p_batch_id
      AND (
        b2.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b2.id AND x.organization_id = b2.organization_id
            AND x.voided_at IS NULL
        )
      );
    v_opening := greatest(r.opening_approved_quantity, r.opening_billed_quantity);
    v_prev := v_opening + v_cum;

    IF v_mode = 'simple' THEN
      v_approved := r.measured_quantity;
    ELSE
      v_supplied := NULLIF(p_line_approvals ->> r.id::text, '')::numeric;
      IF v_supplied IS NULL THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: missing approved qty for line %', r.id
          USING ERRCODE = 'check_violation';
      END IF;
      v_approved := v_supplied;
      IF v_approved > r.measured_quantity THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: approved % exceeds measured %',
          v_approved, r.measured_quantity
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_approved < 0 AND NOT app.boq_guc_on('app.boq_correction_write') THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: negative approved not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev + v_approved > r.current_quantity THEN
      RAISE EXCEPTION 'approve_boq_progress_batch: over-measurement vs current quantity'
        USING ERRCODE = 'check_violation';
    END IF;

    v_price := r.current_unit_price;
    IF r.pricing_type = 'lump_sum' THEN
      IF v_approved < 0 OR v_approved > 1 THEN
        RAISE EXCEPTION 'approve_boq_progress_batch: lump_sum approved qty must be 0..1 fraction'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_period := round(v_price * v_approved, 6);

    UPDATE public.boq_progress_lines
    SET previous_approved_quantity = v_prev,
        approved_quantity = v_approved,
        unit_price_snapshot = v_price,
        period_amount = v_period,
        currency = v_boq.currency,
        updated_at = now()
    WHERE id = r.id AND organization_id = p_organization_id;
  END LOOP;

  UPDATE public.boq_progress_batches
  SET status = 'approved',
      approved_at = now(),
      approved_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid,
      updated_at = now()
  WHERE id = p_batch_id AND organization_id = p_organization_id AND status = 'draft';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('progress_approve');
    RAISE;
  END;

  PERFORM app.boq_latch_release('progress_approve');
  RETURN p_batch_id;
END;
$$;

--------------------------------------------------------------------------------

-- 15.4 Reject lump_sum / unknown allocation kinds (never coerce to quantity_change)
CREATE OR REPLACE FUNCTION app.boq_allocate_change(
  p_organization_id uuid,
  p_boq_id uuid,
  p_change_order_id uuid,
  p_allocation_kind text,
  p_boq_node_id uuid,
  p_quantity_delta numeric,
  p_unit_price_delta numeric,
  p_amount_delta numeric,
  p_notes text,
  p_new_item jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_alloc_id uuid;
  v_new_node_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_locked numeric(18,6);
  v_cum numeric(18,6);
  v_co_amount numeric(18,6);
  v_co_direction text;
  v_net_allocated numeric(18,6);
  v_qty_delta numeric(18,6);
  v_price_delta numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_allocate_change: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_allocate_change: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_allocation_kind IS NULL OR p_allocation_kind NOT IN (
    'quantity_change', 'unit_price_change', 'new_item', 'unallocated_contract'
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: unsupported or unknown allocation_kind %',
      coalesce(p_allocation_kind, '<null>')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_allocate_change: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.change_orders
    WHERE id = p_change_order_id
      AND organization_id = p_organization_id
      AND project_id = v_boq.project_id
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: ChangeOrder required (pending ChangeRequest has no CO)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_qty_delta := coalesce(p_quantity_delta, 0);
  v_price_delta := coalesce(p_unit_price_delta, 0);

  IF p_allocation_kind IN ('quantity_change', 'unit_price_change') THEN
    IF v_qty_delta <> 0 AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: mixed quantity+unit_price change not supported'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'quantity_change' AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: quantity_change may only alter quantity'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'unit_price_change' AND v_qty_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: unit_price_change may only alter unit price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM set_config('app.boq_allocation_write', 'on', true);

  BEGIN
  IF p_allocation_kind = 'unallocated_contract' THEN
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, NULL,
      'unallocated_contract', 0, 0, coalesce(p_amount_delta, 0), v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind = 'new_item' THEN
    IF p_new_item IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: new_item payload required' USING ERRCODE = 'check_violation';
    END IF;
    v_qty := coalesce((p_new_item->>'quantity')::numeric, 0);
    v_price := coalesce((p_new_item->>'unit_price')::numeric, 0);
    IF coalesce(p_new_item->>'pricing_type', 'quantity_unit_price') = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    INSERT INTO public.boq_nodes (
      organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
      original_quantity, original_unit_price, original_amount,
      current_quantity, current_unit_price, current_amount,
      opening_approved_quantity, opening_billed_quantity,
      source_change_order_id, status, sort_order, notes
    ) VALUES (
      p_organization_id, p_boq_id,
      nullif(p_new_item->>'parent_id', '')::uuid,
      'item',
      nullif(p_new_item->>'item_code', ''),
      coalesce(p_new_item->>'description', 'Change item'),
      nullif(p_new_item->>'unit', ''),
      coalesce(p_new_item->>'pricing_type', 'quantity_unit_price'),
      0, 0, 0,
      v_qty, v_price, v_amount,
      0, 0,
      p_change_order_id, 'active', 0,
      coalesce(p_notes, 'Source: Change Order')
    ) RETURNING id INTO v_new_node_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, v_new_node_id,
      'new_item', v_qty, 0, v_amount, v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind IN ('quantity_change', 'unit_price_change') THEN
    IF p_boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: boq_node_id required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = p_boq_node_id AND organization_id = p_organization_id AND boq_id = p_boq_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_allocate_change: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_allocation_kind = 'unit_price_change' THEN
      v_qty := v_node.current_quantity;
      v_price := v_node.current_unit_price + v_price_delta;
    ELSE
      -- quantity_change (default node-bound kind)
      v_qty := v_node.current_quantity + v_qty_delta;
      v_price := v_node.current_unit_price;
      v_price_delta := 0;
    END IF;

    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    SELECT coalesce(sum(l.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l
    JOIN public.boq_progress_batches b
      ON b.id = l.batch_id AND b.organization_id = l.organization_id
    WHERE l.organization_id = p_organization_id
      AND l.boq_node_id = p_boq_node_id
      AND (
        b.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
      );

    v_locked := greatest(v_node.opening_approved_quantity, v_node.opening_billed_quantity) + v_cum;
    IF v_qty < v_locked THEN
      RAISE EXCEPTION 'boq_allocate_change: cannot reduce current below approved/billed floor'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = p_boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, p_boq_node_id,
      CASE
        WHEN p_allocation_kind = 'unit_price_change' THEN 'unit_price_change'
        ELSE 'quantity_change'
      END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN 0 ELSE v_qty_delta END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN v_price_delta ELSE 0 END,
      (v_amount - v_node.current_amount),
      v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSE
    RAISE EXCEPTION 'boq_allocate_change: unsupported or unknown allocation_kind %',
      p_allocation_kind
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT amount, direction INTO v_co_amount, v_co_direction
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id;

  SELECT coalesce(sum(amount_delta), 0) INTO v_net_allocated
  FROM public.boq_change_allocations
  WHERE organization_id = p_organization_id
    AND change_order_id = p_change_order_id;

  IF abs(v_net_allocated) > v_co_amount + 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: allocation exceeds change order amount'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'addition' AND v_net_allocated < -0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: addition CO cannot net negative'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'reduction' AND v_net_allocated > 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: reduction CO cannot net positive'
      USING ERRCODE = 'check_violation';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  RETURN v_alloc_id;
END;
$$;

-- 15.5 Exact LIFO reverse uses allocation_seq (not created_at/UUID)
CREATE OR REPLACE FUNCTION app.boq_reverse_change_allocation(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src public.boq_change_allocations%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_later_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_src FROM public.boq_change_allocations
  WHERE id = p_allocation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_src.allocation_kind IN ('reversal') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: cannot reverse a reversal'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.boq_change_allocations
    WHERE organization_id = p_organization_id
      AND reverses_allocation_id = p_allocation_id
  ) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: already reversed'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Node-bound: only the latest effective (non-reversed) allocation on that node may reverse.
  IF v_src.boq_node_id IS NOT NULL AND v_src.allocation_kind IS DISTINCT FROM 'unallocated_contract' THEN
    SELECT a.id INTO v_later_id
    FROM public.boq_change_allocations a
    WHERE a.organization_id = p_organization_id
      AND a.boq_node_id = v_src.boq_node_id
      AND a.allocation_kind IS DISTINCT FROM 'reversal'
      AND a.id IS DISTINCT FROM p_allocation_id
      AND a.allocation_seq > v_src.allocation_seq
      AND NOT EXISTS (
        SELECT 1 FROM public.boq_change_allocations r
        WHERE r.organization_id = a.organization_id
          AND r.reverses_allocation_id = a.id
      )
    ORDER BY a.allocation_seq DESC
    LIMIT 1;
    IF v_later_id IS NOT NULL THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: later effective allocation % must be reversed first',
        v_later_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM app.boq_latch_acquire('correction');
  PERFORM set_config('app.boq_allocation_write', 'on', true);
  PERFORM set_config('app.boq_correction_write', 'on', true);

  BEGIN
  IF v_src.boq_node_id IS NOT NULL AND v_src.allocation_kind IS DISTINCT FROM 'unallocated_contract' THEN
    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = v_src.boq_node_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    -- Exact neutralization using immutable source deltas (not path-dependent recompute).
    v_qty := v_node.current_quantity - coalesce(v_src.quantity_delta, 0);
    v_price := v_node.current_unit_price - coalesce(v_src.unit_price_delta, 0);
    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    -- Economic check: node amount change must equal -source.amount_delta.
    IF abs((v_amount - v_node.current_amount) + v_src.amount_delta) > 0.000001 THEN
      RAISE EXCEPTION 'boq_reverse_change_allocation: exact neutralization failed (expected amount delta %)',
        -v_src.amount_delta
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = v_src.boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, reverses_allocation_id, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_src.project_id, v_src.boq_id, v_src.change_order_id, v_src.boq_node_id,
      'reversal',
      -coalesce(v_src.quantity_delta, 0),
      -coalesce(v_src.unit_price_delta, 0),
      -v_src.amount_delta,
      v_src.currency,
      coalesce(p_notes, 'Reversal of allocation'),
      p_allocation_id,
      nullif(current_setting('app.user_id', true), '')::uuid,
      'reverse_rpc'
    ) RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, reverses_allocation_id, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_src.project_id, v_src.boq_id, v_src.change_order_id, NULL,
      'reversal', 0, 0, -v_src.amount_delta, v_src.currency,
      coalesce(p_notes, 'Reversal of unallocated'), p_allocation_id,
      nullif(current_setting('app.user_id', true), '')::uuid, 'reverse_rpc'
    ) RETURNING id INTO v_id;
  END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    PERFORM app.boq_latch_release('correction');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  PERFORM app.boq_latch_release('correction');
  RETURN v_id;
END;
$$;


--------------------------------------------------------------------------------

-- 15.6 Proposed AP requires canonical draft AP bill status
CREATE OR REPLACE FUNCTION app.propose_boq_subcontractor_valuation_ap(
  p_organization_id uuid,
  p_valuation_id uuid,
  p_vendor_bill_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_val public.boq_subcontractor_valuations%ROWTYPE;
  v_sched public.boq_subcontractor_schedules%ROWTYPE;
  v_bill record;
  v_engagement record;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: requires boq.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_val
  FROM public.boq_subcontractor_valuations
  WHERE id = p_valuation_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_val.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: approved valuation required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_val.proposed_vendor_bill_id IS NOT NULL THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: already has proposed bill'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_sched
  FROM public.boq_subcontractor_schedules
  WHERE id = v_val.schedule_id AND organization_id = p_organization_id
  FOR UPDATE;

  SELECT e.vendor_id, e.project_id INTO v_engagement
  FROM public.vendor_engagements e
  WHERE e.id = v_sched.vendor_engagement_id AND e.organization_id = p_organization_id;

  SELECT b.id, b.organization_id, b.vendor_id, b.project_id, b.currency, b.status
  INTO v_bill
  FROM public.ap_bills b
  WHERE b.id = p_vendor_bill_id AND b.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: vendor bill not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  -- Canonical ProjectFlow AP lifecycle: draft is the only draft-safe proposal state.
  IF v_bill.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: AP bill must be draft (got %)', v_bill.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill.vendor_id IS DISTINCT FROM v_engagement.vendor_id THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: vendor mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill.project_id IS DISTINCT FROM v_sched.project_id THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: project mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_bill.currency IS DISTINCT FROM v_sched.currency THEN
    RAISE EXCEPTION 'propose_boq_sub_valuation_ap: currency mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('sub_valuation_lifecycle');
  PERFORM set_config('app.boq_sub_valuation_lifecycle_write', 'on', true);
  BEGIN
    UPDATE public.boq_subcontractor_valuations
    SET status = 'proposed_ap',
        proposed_vendor_bill_id = p_vendor_bill_id,
        updated_at = now()
    WHERE id = p_valuation_id AND organization_id = p_organization_id AND status = 'approved';
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('sub_valuation_lifecycle');
    RAISE;
  END;
  PERFORM app.boq_latch_release('sub_valuation_lifecycle');
  RETURN p_valuation_id;
END;
$$;

-- 15.7 Concurrent hierarchy: serialize reparenting within a BOQ
CREATE OR REPLACE FUNCTION app.boq_nodes_parent_same_boq_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_boq uuid;
  parent_kind text;
  walk_id uuid;
  seen int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cross-session serialization for hierarchy mutations on this BOQ.
  PERFORM 1
  FROM public.project_boqs
  WHERE id = NEW.boq_id AND organization_id = NEW.organization_id
  FOR UPDATE;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'boq_nodes: node cannot parent itself'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT boq_id, node_kind INTO parent_boq, parent_kind
  FROM public.boq_nodes
  WHERE id = NEW.parent_id AND organization_id = NEW.organization_id;
  IF parent_boq IS NULL OR parent_boq IS DISTINCT FROM NEW.boq_id THEN
    RAISE EXCEPTION 'boq_nodes: parent must belong to same BOQ'
      USING ERRCODE = 'check_violation';
  END IF;
  IF parent_kind IS DISTINCT FROM 'chapter' THEN
    RAISE EXCEPTION 'boq_nodes: parent must be a chapter/container node'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cycle detection: walk ancestors; NEW must not appear.
  walk_id := NEW.parent_id;
  WHILE walk_id IS NOT NULL LOOP
    seen := seen + 1;
    IF seen > 64 THEN
      RAISE EXCEPTION 'boq_nodes: hierarchy depth/cycle limit exceeded'
        USING ERRCODE = 'check_violation';
    END IF;
    IF walk_id = NEW.id THEN
      RAISE EXCEPTION 'boq_nodes: hierarchy cycle not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO walk_id
    FROM public.boq_nodes
    WHERE id = walk_id AND organization_id = NEW.organization_id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 15.8 Expose allocation_seq on secure allocation view (ordering is not money)
DROP VIEW IF EXISTS public.boq_change_allocations_secure;
CREATE VIEW public.boq_change_allocations_secure
WITH (security_invoker = false) AS
SELECT
  a.id,
  a.organization_id,
  a.project_id,
  a.boq_id,
  a.change_order_id,
  a.boq_node_id,
  a.allocation_kind,
  a.quantity_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.unit_price_delta ELSE 0::numeric(18,6) END AS unit_price_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.amount_delta ELSE 0::numeric(18,6) END AS amount_delta,
  a.currency,
  a.notes,
  a.reverses_allocation_id,
  a.created_via,
  a.created_by_user_id,
  a.created_at,
  a.allocation_seq
FROM public.boq_change_allocations a
WHERE app.is_org_member(a.organization_id);

GRANT SELECT ON public.boq_change_allocations_secure TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 16. OWNER V3 APPLY BLOCKERS — secure-view boq.read + new_item deltas
--     (additive; does not edit 0000–0034)
--------------------------------------------------------------------------------

-- 16.1 Canonical BOQ read gate (membership alone is NOT enough)
CREATE OR REPLACE FUNCTION app.boq_can_read(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT app.is_org_member(p_organization_id)
    AND app.has_org_permission(p_organization_id, 'boq.read');
$$;

-- Money remains a SECOND gate after boq.read
CREATE OR REPLACE FUNCTION app.boq_can_see_money(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT app.boq_can_read(p_organization_id)
    AND (
      app.has_org_permission(p_organization_id, 'boq.manage')
      OR app.has_org_permission(p_organization_id, 'project_financials.read')
      OR app.has_org_permission(p_organization_id, 'contracts.read')
      OR app.has_org_permission(p_organization_id, 'boq.billing.create')
    );
$$;

REVOKE ALL ON FUNCTION app.boq_can_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_can_read(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.boq_can_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.boq_can_read(uuid) TO service_role;
REVOKE ALL ON FUNCTION app.boq_can_see_money(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.boq_can_see_money(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.boq_can_see_money(uuid) TO service_role;

-- 16.2 Every BOQ secure view requires boq_can_read
DROP VIEW IF EXISTS public.boq_nodes_secure;
CREATE VIEW public.boq_nodes_secure
WITH (security_invoker = false) AS
SELECT
  n.id,
  n.organization_id,
  n.boq_id,
  n.parent_id,
  n.node_kind,
  n.item_code,
  n.description,
  n.unit,
  n.pricing_type,
  n.original_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_unit_price ELSE 0::numeric(18,6) END AS original_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.original_amount ELSE 0::numeric(18,6) END AS original_amount,
  n.current_quantity,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_unit_price ELSE 0::numeric(18,6) END AS current_unit_price,
  CASE WHEN app.boq_can_see_money(n.organization_id) THEN n.current_amount ELSE 0::numeric(18,6) END AS current_amount,
  n.opening_approved_quantity,
  n.opening_billed_quantity,
  n.work_package_id,
  n.cost_category_id,
  n.budget_line_id,
  n.source_change_order_id,
  n.status,
  n.sort_order,
  n.notes,
  n.archived_at,
  n.created_at,
  n.updated_at
FROM public.boq_nodes n
WHERE app.boq_can_read(n.organization_id);

DROP VIEW IF EXISTS public.boq_progress_lines_secure;
CREATE VIEW public.boq_progress_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id,
  l.organization_id,
  l.batch_id,
  l.boq_node_id,
  l.measured_quantity,
  l.previous_approved_quantity,
  l.approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_price_snapshot ELSE 0::numeric(18,6) END AS unit_price_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency,
  l.notes,
  l.created_at,
  l.updated_at
FROM public.boq_progress_lines l
WHERE app.boq_can_read(l.organization_id);

DROP VIEW IF EXISTS public.boq_change_allocations_secure;
CREATE VIEW public.boq_change_allocations_secure
WITH (security_invoker = false) AS
SELECT
  a.id,
  a.organization_id,
  a.project_id,
  a.boq_id,
  a.change_order_id,
  a.boq_node_id,
  a.allocation_kind,
  a.quantity_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.unit_price_delta ELSE 0::numeric(18,6) END AS unit_price_delta,
  CASE WHEN app.boq_can_see_money(a.organization_id) THEN a.amount_delta ELSE 0::numeric(18,6) END AS amount_delta,
  a.currency,
  a.notes,
  a.reverses_allocation_id,
  a.created_via,
  a.created_by_user_id,
  a.created_at,
  a.allocation_seq
FROM public.boq_change_allocations a
WHERE app.boq_can_read(a.organization_id);

DROP VIEW IF EXISTS public.boq_subcontractor_schedule_lines_secure;
CREATE VIEW public.boq_subcontractor_schedule_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id, l.organization_id, l.schedule_id, l.boq_node_id, l.unit, l.agreed_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_rate ELSE 0::numeric(18,6) END AS unit_rate,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.amount ELSE 0::numeric(18,6) END AS amount,
  l.currency, l.notes, l.sort_order, l.created_at, l.updated_at
FROM public.boq_subcontractor_schedule_lines l
WHERE app.boq_can_read(l.organization_id);

DROP VIEW IF EXISTS public.boq_subcontractor_valuation_lines_secure;
CREATE VIEW public.boq_subcontractor_valuation_lines_secure
WITH (security_invoker = false) AS
SELECT
  l.id, l.organization_id, l.valuation_id, l.schedule_line_id,
  l.previous_approved_quantity, l.approved_quantity,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.unit_rate_snapshot ELSE 0::numeric(18,6) END AS unit_rate_snapshot,
  CASE WHEN app.boq_can_see_money(l.organization_id) THEN l.period_amount ELSE 0::numeric(18,6) END AS period_amount,
  l.currency, l.notes, l.created_at, l.updated_at
FROM public.boq_subcontractor_valuation_lines l
WHERE app.boq_can_read(l.organization_id);

GRANT SELECT ON public.boq_nodes_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_progress_lines_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_change_allocations_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_subcontractor_schedule_lines_secure TO authenticated, service_role;
GRANT SELECT ON public.boq_subcontractor_valuation_lines_secure TO authenticated, service_role;

-- 16.3 new_item stores unit_price_delta for exact reversal; block quantity_change on lump_sum nodes
CREATE OR REPLACE FUNCTION app.boq_allocate_change(
  p_organization_id uuid,
  p_boq_id uuid,
  p_change_order_id uuid,
  p_allocation_kind text,
  p_boq_node_id uuid,
  p_quantity_delta numeric,
  p_unit_price_delta numeric,
  p_amount_delta numeric,
  p_notes text,
  p_new_item jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_alloc_id uuid;
  v_new_node_id uuid;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_amount numeric(18,6);
  v_locked numeric(18,6);
  v_cum numeric(18,6);
  v_co_amount numeric(18,6);
  v_co_direction text;
  v_net_allocated numeric(18,6);
  v_qty_delta numeric(18,6);
  v_price_delta numeric(18,6);
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_allocate_change: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_allocate_change: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_allocation_kind IS NULL OR p_allocation_kind NOT IN (
    'quantity_change', 'unit_price_change', 'new_item', 'unallocated_contract'
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: unsupported or unknown allocation_kind %',
      coalesce(p_allocation_kind, '<null>')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_boq.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'boq_allocate_change: active BOQ required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.change_orders
    WHERE id = p_change_order_id
      AND organization_id = p_organization_id
      AND project_id = v_boq.project_id
  ) THEN
    RAISE EXCEPTION 'boq_allocate_change: ChangeOrder required (pending ChangeRequest has no CO)'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_qty_delta := coalesce(p_quantity_delta, 0);
  v_price_delta := coalesce(p_unit_price_delta, 0);

  IF p_allocation_kind IN ('quantity_change', 'unit_price_change') THEN
    IF v_qty_delta <> 0 AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: mixed quantity+unit_price change not supported'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'quantity_change' AND v_price_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: quantity_change may only alter quantity'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_allocation_kind = 'unit_price_change' AND v_qty_delta <> 0 THEN
      RAISE EXCEPTION 'boq_allocate_change: unit_price_change may only alter unit price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM app.boq_latch_acquire('allocation');
  PERFORM set_config('app.boq_allocation_write', 'on', true);

  BEGIN
  IF p_allocation_kind = 'unallocated_contract' THEN
    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, NULL,
      'unallocated_contract', 0, 0, coalesce(p_amount_delta, 0), v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind = 'new_item' THEN
    IF p_new_item IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: new_item payload required' USING ERRCODE = 'check_violation';
    END IF;
    v_qty := coalesce((p_new_item->>'quantity')::numeric, 0);
    v_price := coalesce((p_new_item->>'unit_price')::numeric, 0);
    IF coalesce(p_new_item->>'pricing_type', 'quantity_unit_price') = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    -- New item starts from zero originals; source deltas must neutralize qty+price+amount.
    INSERT INTO public.boq_nodes (
      organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
      original_quantity, original_unit_price, original_amount,
      current_quantity, current_unit_price, current_amount,
      opening_approved_quantity, opening_billed_quantity,
      source_change_order_id, status, sort_order, notes
    ) VALUES (
      p_organization_id, p_boq_id,
      nullif(p_new_item->>'parent_id', '')::uuid,
      'item',
      nullif(p_new_item->>'item_code', ''),
      coalesce(p_new_item->>'description', 'Change item'),
      nullif(p_new_item->>'unit', ''),
      coalesce(p_new_item->>'pricing_type', 'quantity_unit_price'),
      0, 0, 0,
      v_qty, v_price, v_amount,
      0, 0,
      p_change_order_id, 'active', 0,
      coalesce(p_notes, 'Source: Change Order')
    ) RETURNING id INTO v_new_node_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, v_new_node_id,
      'new_item', v_qty, v_price, v_amount, v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSIF p_allocation_kind IN ('quantity_change', 'unit_price_change') THEN
    IF p_boq_node_id IS NULL THEN
      RAISE EXCEPTION 'boq_allocate_change: boq_node_id required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_node FROM public.boq_nodes
    WHERE id = p_boq_node_id AND organization_id = p_organization_id AND boq_id = p_boq_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'boq_allocate_change: node not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_allocation_kind = 'quantity_change' AND v_node.pricing_type = 'lump_sum' THEN
      RAISE EXCEPTION
        'boq_allocate_change: quantity_change not allowed on lump_sum-priced items; use unit_price_change'
        USING ERRCODE = 'check_violation';
    END IF;

    IF p_allocation_kind = 'unit_price_change' THEN
      v_qty := v_node.current_quantity;
      v_price := v_node.current_unit_price + v_price_delta;
    ELSE
      v_qty := v_node.current_quantity + v_qty_delta;
      v_price := v_node.current_unit_price;
      v_price_delta := 0;
    END IF;

    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

    SELECT coalesce(sum(l.approved_quantity), 0) INTO v_cum
    FROM public.boq_progress_lines l
    JOIN public.boq_progress_batches b
      ON b.id = l.batch_id AND b.organization_id = l.organization_id
    WHERE l.organization_id = p_organization_id
      AND l.boq_node_id = p_boq_node_id
      AND (
        b.status IN ('approved', 'billed')
        OR EXISTS (
          SELECT 1 FROM public.boq_progress_billing_links x
          WHERE x.progress_batch_id = b.id AND x.organization_id = b.organization_id
            AND x.voided_at IS NULL
        )
      );

    v_locked := greatest(v_node.opening_approved_quantity, v_node.opening_billed_quantity) + v_cum;
    IF v_qty < v_locked THEN
      RAISE EXCEPTION 'boq_allocate_change: cannot reduce current below approved/billed floor'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.boq_nodes
    SET current_quantity = v_qty,
        current_unit_price = v_price,
        current_amount = v_amount,
        updated_at = now()
    WHERE id = p_boq_node_id AND organization_id = p_organization_id;

    INSERT INTO public.boq_change_allocations (
      organization_id, project_id, boq_id, change_order_id, boq_node_id,
      allocation_kind, quantity_delta, unit_price_delta, amount_delta, currency,
      notes, created_by_user_id, created_via
    ) VALUES (
      p_organization_id, v_boq.project_id, p_boq_id, p_change_order_id, p_boq_node_id,
      CASE
        WHEN p_allocation_kind = 'unit_price_change' THEN 'unit_price_change'
        ELSE 'quantity_change'
      END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN 0 ELSE v_qty_delta END,
      CASE WHEN p_allocation_kind = 'unit_price_change' THEN v_price_delta ELSE 0 END,
      (v_amount - v_node.current_amount),
      v_boq.currency,
      p_notes, nullif(current_setting('app.user_id', true), '')::uuid, 'allocate_rpc'
    ) RETURNING id INTO v_alloc_id;
  ELSE
    RAISE EXCEPTION 'boq_allocate_change: unsupported or unknown allocation_kind %',
      p_allocation_kind
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT amount, direction INTO v_co_amount, v_co_direction
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id;

  SELECT coalesce(sum(amount_delta), 0) INTO v_net_allocated
  FROM public.boq_change_allocations
  WHERE organization_id = p_organization_id
    AND change_order_id = p_change_order_id;

  IF abs(v_net_allocated) > v_co_amount + 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: allocation exceeds change order amount'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'addition' AND v_net_allocated < -0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: addition CO cannot net negative'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_co_direction = 'reduction' AND v_net_allocated > 0.000001 THEN
    RAISE EXCEPTION 'boq_allocate_change: reduction CO cannot net positive'
      USING ERRCODE = 'check_violation';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    PERFORM app.boq_latch_release('allocation');
    RAISE;
  END;

  PERFORM app.boq_latch_release('allocation');
  RETURN v_alloc_id;
END;
$$;
