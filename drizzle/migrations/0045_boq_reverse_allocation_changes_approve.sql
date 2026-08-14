-- 0045_boq_reverse_allocation_changes_approve
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Manual BOQ allocation reversal stays boq.manage (public RPC).
-- Commercial Change Order reversal is ONE public RPC: app.reverse_change_order.
-- That RPC inserts the reversing CO + opposite contract_value_event and then
-- unwinds ONLY that original CO's BOQ allocations, under a DB-internal
-- execution context that authenticated cannot forge (app.co_reversal_ctx).
-- Session GUCs / set_config are NOT authorization for reversing INSERTs.
-- changes.approve cannot unwind BOQ without that commercial reversal.
-- app.boq_reverse_allocations_for_change_order is not granted to authenticated.
--
-- Canonical CO reversal must be able to unwind node current qty/price/amount
-- without granting the caller generic boq.manage. The internal reverse path
-- already holds allocation/correction latches; honor that here.
--
-- 0042 revoked authenticated DML on boq_nodes. Draft baseline insert/update/
-- delete/archive goes through app.boq_mutate_draft_node (boq.manage + member).

-- Unforgeable commercial-reversal context. Same idea as app.boq_write_latches:
-- only SECURITY DEFINER owner code can write this table. Authenticated and
-- service_role have no INSERT/UPDATE/DELETE/SELECT. A caller cannot
-- manufacture this row with set_config.
CREATE TABLE IF NOT EXISTS app.co_reversal_ctx (
  pid integer NOT NULL,
  txid bigint NOT NULL,
  organization_id uuid NOT NULL,
  change_order_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pid, txid, change_order_id)
);

REVOKE ALL ON TABLE app.co_reversal_ctx FROM PUBLIC;
REVOKE ALL ON TABLE app.co_reversal_ctx FROM authenticated;
REVOKE ALL ON TABLE app.co_reversal_ctx FROM service_role;

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_money_without_manage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF app.boq_guc_on('app.boq_allocation_write')
       OR app.boq_guc_on('app.boq_correction_write') THEN
      RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION app.boq_reverse_change_allocation_internal(
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

    v_qty := v_node.current_quantity - coalesce(v_src.quantity_delta, 0);
    v_price := v_node.current_unit_price - coalesce(v_src.unit_price_delta, 0);
    IF v_node.pricing_type = 'lump_sum' THEN
      v_amount := v_price;
    ELSE
      v_amount := round(v_qty * v_price, 6);
    END IF;

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

CREATE OR REPLACE FUNCTION app.boq_reverse_change_allocation(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_reverse_change_allocation: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN app.boq_reverse_change_allocation_internal(p_organization_id, p_allocation_id, p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION app.boq_reverse_allocations_for_change_order(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_notes text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_co public.change_orders%ROWTYPE;
  v_src public.boq_change_allocations%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.co_reversal_ctx
    WHERE pid = pg_backend_pid()
      AND txid = txid_current()
      AND organization_id = p_organization_id
      AND change_order_id = p_change_order_id
  ) THEN
    RAISE EXCEPTION 'boq_reverse_allocations_for_change_order: canonical commercial reversal only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_co
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_reverse_allocations_for_change_order: change order not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.change_orders r
    WHERE r.organization_id = p_organization_id
      AND r.reversal_of_change_order_id = p_change_order_id
  ) THEN
    RAISE EXCEPTION 'boq_reverse_allocations_for_change_order: reversing change order required'
      USING ERRCODE = 'restrict_violation';
  END IF;

  FOR v_src IN
    SELECT a.*
    FROM public.boq_change_allocations a
    WHERE a.organization_id = p_organization_id
      AND a.change_order_id = p_change_order_id
      AND a.allocation_kind IS DISTINCT FROM 'reversal'
      AND a.reverses_allocation_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.boq_change_allocations r
        WHERE r.organization_id = a.organization_id
          AND r.reverses_allocation_id = a.id
      )
    ORDER BY a.allocation_seq DESC
  LOOP
    PERFORM app.boq_reverse_change_allocation_internal(
      p_organization_id, v_src.id, p_notes
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.change_orders_reversal_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reversal_of_change_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM app.co_reversal_ctx
      WHERE pid = pg_backend_pid()
        AND txid = txid_current()
        AND organization_id = NEW.organization_id
        AND change_order_id = NEW.reversal_of_change_order_id
    ) THEN
      RAISE EXCEPTION 'change_orders: reversing rows only via app.reverse_change_order'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS change_orders_reversal_insert_guard ON public.change_orders;
CREATE TRIGGER change_orders_reversal_insert_guard
  BEFORE INSERT ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION app.change_orders_reversal_insert_guard();

REVOKE ALL ON FUNCTION app.change_orders_reversal_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.change_orders_reversal_insert_guard() FROM authenticated;
REVOKE ALL ON FUNCTION app.change_orders_reversal_insert_guard() FROM service_role;

CREATE OR REPLACE FUNCTION app.reverse_change_order(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_reason text,
  p_effective_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_orig public.change_orders%ROWTYPE;
  v_rev public.change_orders%ROWTYPE;
  v_direction public.change_direction;
  v_event_amount numeric(18,6);
  v_ref text;
  v_next int;
  v_actor uuid;
  v_date date;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'reverse_change_order: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'changes.approve') THEN
    RAISE EXCEPTION 'reverse_change_order: requires changes.approve'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reverse_change_order: reason is required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_actor := nullif(current_setting('app.user_id', true), '')::uuid;
  v_date := COALESCE(p_effective_date, CURRENT_DATE);

  SELECT * INTO v_orig
  FROM public.change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_change_order: change order not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.reversal_of_change_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'reverse_change_order: cannot reverse a reversing change order'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.change_orders
    WHERE organization_id = p_organization_id
      AND reversal_of_change_order_id = p_change_order_id
  ) THEN
    RAISE EXCEPTION 'reverse_change_order: already reversed'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.billing_lines l
    INNER JOIN public.billing_records r
      ON r.id = l.billing_record_id
     AND r.organization_id = l.organization_id
    WHERE l.organization_id = p_organization_id
      AND l.change_order_id = p_change_order_id
      AND r.status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'reverse_change_order: finalized billing exists'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF app.is_month_closed_unrestricted(p_organization_id, to_char(v_date, 'YYYY-MM')) THEN
    RAISE EXCEPTION 'reverse_change_order: closed month'
      USING ERRCODE = 'restrict_violation';
  END IF;

  PERFORM 1 FROM public.projects
  WHERE id = v_orig.project_id AND organization_id = p_organization_id
  FOR UPDATE;

  SELECT COALESCE(MAX(substring(reference from '^CO-(\d+)$')::int), 0) + 1
    INTO v_next
  FROM public.change_orders
  WHERE organization_id = p_organization_id
    AND project_id = v_orig.project_id;
  v_ref := 'CO-' || lpad(v_next::text, 3, '0');

  v_direction := CASE
    WHEN v_orig.direction = 'addition' THEN 'reduction'::public.change_direction
    ELSE 'addition'::public.change_direction
  END;
  v_event_amount := CASE
    WHEN v_direction = 'reduction' THEN -v_orig.amount
    ELSE v_orig.amount
  END;

  INSERT INTO app.co_reversal_ctx (pid, txid, organization_id, change_order_id)
  VALUES (pg_backend_pid(), txid_current(), p_organization_id, p_change_order_id);

  INSERT INTO public.change_orders (
    organization_id, project_id, contract_id, change_request_id, quote_version_id, approval_id,
    reference, direction, amount, currency, effective_date, notes,
    reversal_of_change_order_id, reversal_reason, reversed_by_user_id
  ) VALUES (
    p_organization_id, v_orig.project_id, v_orig.contract_id, NULL, NULL, NULL,
    v_ref, v_direction, v_orig.amount, v_orig.currency, v_date, btrim(p_reason),
    p_change_order_id, btrim(p_reason), v_actor
  ) RETURNING * INTO v_rev;

  INSERT INTO public.contract_value_events (
    organization_id, contract_id, project_id, kind, amount, currency,
    change_order_id, effective_date, reason, actor_user_id
  ) VALUES (
    p_organization_id, v_orig.contract_id, v_orig.project_id, 'change_order',
    v_event_amount, v_orig.currency, v_rev.id, v_date,
    'Change order ' || v_ref, v_actor
  );

  PERFORM app.boq_reverse_allocations_for_change_order(
    p_organization_id, p_change_order_id, btrim(p_reason)
  );

  DELETE FROM app.co_reversal_ctx
  WHERE pid = pg_backend_pid()
    AND txid = txid_current()
    AND organization_id = p_organization_id
    AND change_order_id = p_change_order_id;

  RETURN v_rev.id;
END;
$$;

REVOKE ALL ON FUNCTION app.boq_reverse_change_allocation_internal(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_reverse_change_allocation_internal(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION app.boq_reverse_change_allocation_internal(uuid, uuid, text) FROM service_role;

REVOKE ALL ON FUNCTION app.boq_reverse_change_allocation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.boq_reverse_change_allocation(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.boq_reverse_change_allocation(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM service_role;

REVOKE ALL ON FUNCTION app.reverse_change_order(uuid, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reverse_change_order(uuid, uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION app.reverse_change_order(uuid, uuid, text, date) TO service_role;

-- 0042 revoked authenticated DML on boq_nodes so unit prices cannot be SELECTed.
-- Draft baseline edits must go through this SECURITY DEFINER writer.
CREATE OR REPLACE FUNCTION app.boq_mutate_draft_node(
  p_organization_id uuid,
  p_action text,
  p_node_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_node public.boq_nodes%ROWTYPE;
  v_id uuid;
  v_boq_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'boq_mutate_draft_node: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'boq_mutate_draft_node: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action NOT IN ('insert', 'update', 'delete', 'archive') THEN
    RAISE EXCEPTION 'boq_mutate_draft_node: unknown action' USING ERRCODE = 'check_violation';
  END IF;

  IF p_action = 'insert' THEN
    v_boq_id := (p_payload->>'boq_id')::uuid;
    SELECT * INTO v_boq FROM public.project_boqs
    WHERE id = v_boq_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND OR v_boq.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_mutate_draft_node: insert requires a draft BOQ'
        USING ERRCODE = 'restrict_violation';
    END IF;
    INSERT INTO public.boq_nodes (
      organization_id, boq_id, parent_id, node_kind, item_code, description, unit, pricing_type,
      original_quantity, original_unit_price, original_amount,
      current_quantity, current_unit_price, current_amount,
      opening_approved_quantity, opening_billed_quantity,
      work_package_id, cost_category_id, budget_line_id, source_change_order_id,
      status, sort_order, notes
    ) VALUES (
      p_organization_id,
      v_boq_id,
      NULLIF(p_payload->>'parent_id', '')::uuid,
      p_payload->>'node_kind',
      NULLIF(p_payload->>'item_code', ''),
      p_payload->>'description',
      NULLIF(p_payload->>'unit', ''),
      p_payload->>'pricing_type',
      COALESCE((p_payload->>'original_quantity')::numeric, 0),
      COALESCE((p_payload->>'original_unit_price')::numeric, 0),
      COALESCE((p_payload->>'original_amount')::numeric, 0),
      COALESCE((p_payload->>'current_quantity')::numeric, 0),
      COALESCE((p_payload->>'current_unit_price')::numeric, 0),
      COALESCE((p_payload->>'current_amount')::numeric, 0),
      COALESCE((p_payload->>'opening_approved_quantity')::numeric, 0),
      COALESCE((p_payload->>'opening_billed_quantity')::numeric, 0),
      NULLIF(p_payload->>'work_package_id', '')::uuid,
      NULLIF(p_payload->>'cost_category_id', '')::uuid,
      NULLIF(p_payload->>'budget_line_id', '')::uuid,
      NULLIF(p_payload->>'source_change_order_id', '')::uuid,
      'active',
      COALESCE((p_payload->>'sort_order')::integer, 0),
      NULLIF(p_payload->>'notes', '')
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_node FROM public.boq_nodes
  WHERE id = p_node_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_mutate_draft_node: not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_boq FROM public.project_boqs
  WHERE id = v_node.boq_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF p_action = 'delete' THEN
    IF v_boq.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'boq_mutate_draft_node: delete requires a draft BOQ'
        USING ERRCODE = 'restrict_violation';
    END IF;
    DELETE FROM public.boq_nodes
    WHERE id = p_node_id AND organization_id = p_organization_id;
    RETURN p_node_id;
  END IF;

  IF p_action = 'archive' THEN
    UPDATE public.boq_nodes
    SET archived_at = now(), status = 'archived', updated_at = now()
    WHERE id = p_node_id AND organization_id = p_organization_id;
    RETURN p_node_id;
  END IF;

  IF v_boq.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'boq_mutate_draft_node: update requires a draft BOQ'
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE public.boq_nodes SET
    parent_id = CASE WHEN p_payload ? 'parent_id' THEN NULLIF(p_payload->>'parent_id', '')::uuid ELSE parent_id END,
    item_code = CASE WHEN p_payload ? 'item_code' THEN NULLIF(p_payload->>'item_code', '') ELSE item_code END,
    description = COALESCE(p_payload->>'description', description),
    unit = CASE WHEN p_payload ? 'unit' THEN NULLIF(p_payload->>'unit', '') ELSE unit END,
    pricing_type = COALESCE(p_payload->>'pricing_type', pricing_type),
    original_quantity = COALESCE((p_payload->>'original_quantity')::numeric, original_quantity),
    original_unit_price = COALESCE((p_payload->>'original_unit_price')::numeric, original_unit_price),
    original_amount = COALESCE((p_payload->>'original_amount')::numeric, original_amount),
    current_quantity = COALESCE((p_payload->>'current_quantity')::numeric, current_quantity),
    current_unit_price = COALESCE((p_payload->>'current_unit_price')::numeric, current_unit_price),
    current_amount = COALESCE((p_payload->>'current_amount')::numeric, current_amount),
    opening_approved_quantity = COALESCE((p_payload->>'opening_approved_quantity')::numeric, opening_approved_quantity),
    opening_billed_quantity = COALESCE((p_payload->>'opening_billed_quantity')::numeric, opening_billed_quantity),
    work_package_id = CASE WHEN p_payload ? 'work_package_id' THEN NULLIF(p_payload->>'work_package_id', '')::uuid ELSE work_package_id END,
    cost_category_id = CASE WHEN p_payload ? 'cost_category_id' THEN NULLIF(p_payload->>'cost_category_id', '')::uuid ELSE cost_category_id END,
    budget_line_id = CASE WHEN p_payload ? 'budget_line_id' THEN NULLIF(p_payload->>'budget_line_id', '')::uuid ELSE budget_line_id END,
    source_change_order_id = CASE WHEN p_payload ? 'source_change_order_id' THEN NULLIF(p_payload->>'source_change_order_id', '')::uuid ELSE source_change_order_id END,
    sort_order = COALESCE((p_payload->>'sort_order')::integer, sort_order),
    notes = CASE WHEN p_payload ? 'notes' THEN NULLIF(p_payload->>'notes', '') ELSE notes END,
    updated_at = now()
  WHERE id = p_node_id AND organization_id = p_organization_id;

  RETURN p_node_id;
END;
$$;

REVOKE ALL ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) TO service_role;
