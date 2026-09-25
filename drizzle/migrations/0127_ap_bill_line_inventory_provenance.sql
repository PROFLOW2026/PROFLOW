-- 0127: AP FIFO provenance. Additive after 0126. Do not modify 0000–0126.
--
-- Separate FKs do not prove that a layer's bill line belongs to its bill,
-- or that the layer item is the line item. This migration adds that proof.
-- Cost basis is the line NET only. Gross and tax are not inventory cost.
-- Preflight: inventory_cost_layers has no ap_bill rows, so the new FK and
-- trigger do not reject existing layers.

--------------------------------------------------------------------------------
-- Section A — the bill line belongs to the named bill
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ap_bill_lines_id_bill_org_uq
  ON public.ap_bill_lines (id, ap_bill_id, organization_id);

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_ap_bill_line_bill_fk;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_ap_bill_line_bill_fk
  FOREIGN KEY (source_ap_bill_line_id, source_ap_bill_id, organization_id)
  REFERENCES public.ap_bill_lines (id, ap_bill_id, organization_id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT inventory_cost_layers_source_ap_bill_line_bill_fk
  ON public.inventory_cost_layers IS
  'The FIFO line is a line of this vendor bill, in the same organization.';

--------------------------------------------------------------------------------
-- Section B — layer insert/update must match the stored stock line
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.inventory_cost_layers_ap_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line record;
BEGIN
  IF NEW.source_kind IS DISTINCT FROM 'ap_bill' THEN
    RETURN NEW;
  END IF;

  SELECT
    l.ap_bill_id,
    l.organization_id,
    l.inventory_item_id,
    l.quantity,
    l.currency,
    l.net_amount,
    b.status,
    b.archived_at
  INTO v_line
  FROM public.ap_bill_lines l
  JOIN public.ap_bills b
    ON b.id = l.ap_bill_id
   AND b.organization_id = l.organization_id
  WHERE l.id = NEW.source_ap_bill_line_id
    AND l.organization_id = NEW.organization_id;

  IF v_line IS NULL
     OR NEW.source_ap_bill_id IS NULL
     OR NEW.source_ap_bill_line_id IS NULL
     OR v_line.ap_bill_id IS DISTINCT FROM NEW.source_ap_bill_id
     OR v_line.organization_id IS DISTINCT FROM NEW.organization_id
     OR v_line.inventory_item_id IS NULL
     OR v_line.inventory_item_id IS DISTINCT FROM NEW.inventory_item_id
     OR v_line.archived_at IS NOT NULL
     OR NOT app.is_ap_bill_recognized_status(v_line.status)
     OR v_line.quantity IS NULL
     OR v_line.quantity::numeric <= 0
     OR v_line.quantity IS DISTINCT FROM NEW.received_qty
     OR upper(v_line.currency) <> upper(NEW.currency)
     OR v_line.net_amount IS NULL
     OR v_line.net_amount::numeric <= 0
     OR abs((NEW.received_qty * NEW.unit_cost) - v_line.net_amount::numeric) >= 0.000001
  THEN
    RAISE EXCEPTION 'inventory_cost_layer_ap_source_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_cost_layers_ap_source_guard
  ON public.inventory_cost_layers;
CREATE TRIGGER inventory_cost_layers_ap_source_guard
  BEFORE INSERT OR UPDATE OF source_kind, source_ap_bill_id, source_ap_bill_line_id,
    inventory_item_id, organization_id, received_qty, unit_cost, currency
  ON public.inventory_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_cost_layers_ap_source_guard();

COMMENT ON FUNCTION app.inventory_cost_layers_ap_source_guard() IS
  'AP FIFO layer must match one recognized bill line: same org, bill, line, item, currency, quantity, and NET. Gross and VAT are not cost basis.';

--------------------------------------------------------------------------------
-- Section C — stock identity stays put after recognition or after a layer
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ap_bill_lines_inventory_attribution_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_status text;
  layer_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.inventory_cost_layers layer
      WHERE layer.source_ap_bill_line_id = OLD.id
        AND layer.organization_id = OLD.organization_id
        AND layer.source_kind = 'ap_bill'
    ) INTO layer_exists;
    IF layer_exists THEN
      RAISE EXCEPTION 'ap_bill_line_inventory_source_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.inventory_item_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT b.status
    INTO parent_status
    FROM public.ap_bills b
    WHERE b.id = NEW.ap_bill_id
      AND b.organization_id = NEW.organization_id;
    IF app.is_ap_bill_recognized_status(parent_status) THEN
      RAISE EXCEPTION 'ap_bill_line_inventory_item_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_cost_layers layer
    WHERE layer.source_ap_bill_line_id = OLD.id
      AND layer.organization_id = OLD.organization_id
      AND layer.source_kind = 'ap_bill'
  ) INTO layer_exists;

  IF layer_exists
     AND (
       NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
     )
  THEN
    RAISE EXCEPTION 'ap_bill_line_inventory_source_immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id THEN
    SELECT b.status
    INTO parent_status
    FROM public.ap_bills b
    WHERE b.id = NEW.ap_bill_id
      AND b.organization_id = NEW.organization_id;
    IF app.is_ap_bill_recognized_status(parent_status) OR layer_exists THEN
      RAISE EXCEPTION 'ap_bill_line_inventory_item_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_bill_lines_inventory_attribution_guard
  ON public.ap_bill_lines;
CREATE TRIGGER ap_bill_lines_inventory_attribution_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.ap_bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_bill_lines_inventory_attribution_guard();

COMMENT ON FUNCTION app.ap_bill_lines_inventory_attribution_guard() IS
  'Recognized AP lines cannot change inventory item. A line that already has a FIFO layer cannot change item, quantity, net, currency, or bill.';
