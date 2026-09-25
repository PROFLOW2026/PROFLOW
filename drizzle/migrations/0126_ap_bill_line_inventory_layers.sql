-- 0126: Inventory FIFO layers are attributed to an AP bill line, not the whole bill.
-- Migration after 0125. Additive correction. Do not modify 0000–0125.
--
-- 0125 allowed source_kind = ap_bill and a unique index on
-- (organization_id, source_ap_bill_id). A vendor bill can contain several
-- stock lines. Each line books its own layer. Uniqueness is the line.
-- Preflight: no inventory_cost_layers rows existed, so tightening the
-- source shape does not rewrite history.

--------------------------------------------------------------------------------
-- Section A — line identity on the cost layer
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ap_bill_lines_id_org_uq
  ON public.ap_bill_lines (id, organization_id);

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_inventory_item_org_fk;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_inventory_item_org_fk
  FOREIGN KEY (inventory_item_id, organization_id)
  REFERENCES public.inventory_items (id, organization_id)
  ON DELETE RESTRICT;

COMMENT ON COLUMN public.ap_bill_lines.inventory_item_id IS
  'Set when this line buys stock. Operating actual starts at project_consume, not at bill recognition.';

ALTER TABLE public.inventory_cost_layers
  ADD COLUMN IF NOT EXISTS source_ap_bill_line_id uuid;

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_ap_bill_line_org_fk;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_ap_bill_line_org_fk
  FOREIGN KEY (source_ap_bill_line_id, organization_id)
  REFERENCES public.ap_bill_lines (id, organization_id)
  ON DELETE RESTRICT;

DROP INDEX IF EXISTS inventory_cost_layers_source_ap_bill_uq;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_source_ap_bill_line_uq
  ON public.inventory_cost_layers (organization_id, source_ap_bill_line_id)
  WHERE source_ap_bill_line_id IS NOT NULL;

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_shape;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_shape
  CHECK (
    (
      source_kind = 'expense'
      AND source_expense_id IS NOT NULL
      AND source_ap_bill_id IS NULL
      AND source_ap_bill_line_id IS NULL
    )
    OR (
      source_kind = 'ap_bill'
      AND source_ap_bill_id IS NOT NULL
      AND source_ap_bill_line_id IS NOT NULL
      AND source_expense_id IS NULL
    )
    OR (
      source_kind = 'opening_balance'
      AND source_expense_id IS NULL
      AND source_ap_bill_id IS NULL
      AND source_ap_bill_line_id IS NULL
      AND opening_reference IS NOT NULL
      AND length(trim(opening_reference)) > 0
    )
  );

COMMENT ON COLUMN public.inventory_cost_layers.source_ap_bill_id IS
  'Vendor bill that bought this stock. Paired with source_ap_bill_line_id. Not operating actual until project_consume.';

COMMENT ON COLUMN public.inventory_cost_layers.source_ap_bill_line_id IS
  'One FIFO layer per stock line on a vendor bill.';
