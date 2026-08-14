-- 0040_po_receiving
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Quantity receiving against issued purchase orders.
-- Receiving MUST NOT create Actual. Vendor Bill remains Actual. PO remains Commitment.
--
-- PO status catalog has no `received` value. Any successful receipt (partial or
-- full qty) sets status to `partially_received`. Full quantity received does
-- NOT auto-close: `closed` zeros remaining commitment and is an explicit
-- procurement action, not a receiving side-effect.

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_quantity numeric(18,6) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_received_range'
  ) THEN
    ALTER TABLE public.purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_received_range CHECK (
        received_quantity >= 0 AND received_quantity <= quantity
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.po_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL,
  received_on date NOT NULL,
  received_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS po_receipts_id_organization_id_uq
  ON public.po_receipts (id, organization_id);
CREATE INDEX IF NOT EXISTS po_receipts_po_idx ON public.po_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS po_receipts_org_idx ON public.po_receipts (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_id_organization_id_uq
  ON public.purchase_orders (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'po_receipts_po_org_fk'
  ) THEN
    ALTER TABLE public.po_receipts
      ADD CONSTRAINT po_receipts_po_org_fk
      FOREIGN KEY (purchase_order_id, organization_id)
      REFERENCES public.purchase_orders (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.po_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL,
  purchase_order_line_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_receipt_lines_quantity_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS po_receipt_lines_id_organization_id_uq
  ON public.po_receipt_lines (id, organization_id);
CREATE INDEX IF NOT EXISTS po_receipt_lines_receipt_idx ON public.po_receipt_lines (receipt_id);
CREATE INDEX IF NOT EXISTS po_receipt_lines_po_line_idx ON public.po_receipt_lines (purchase_order_line_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'po_receipt_lines_receipt_org_fk'
  ) THEN
    ALTER TABLE public.po_receipt_lines
      ADD CONSTRAINT po_receipt_lines_receipt_org_fk
      FOREIGN KEY (receipt_id, organization_id)
      REFERENCES public.po_receipts (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_lines_id_organization_id_uq
  ON public.purchase_order_lines (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'po_receipt_lines_po_line_org_fk'
  ) THEN
    ALTER TABLE public.po_receipt_lines
      ADD CONSTRAINT po_receipt_lines_po_line_org_fk
      FOREIGN KEY (purchase_order_line_id, organization_id)
      REFERENCES public.purchase_order_lines (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.po_receipt_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_line public.purchase_order_lines%ROWTYPE;
  v_receipt public.po_receipts%ROWTYPE;
  v_remaining numeric(18,6);
BEGIN
  SELECT * INTO v_receipt
  FROM public.po_receipts
  WHERE id = NEW.receipt_id AND organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'po_receipt_lines: receipt must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_receipt.purchase_order_id AND organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'po_receipt_lines: purchase order must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_po.status IN ('draft', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'po_receipt_lines: cannot receive a % purchase order', v_po.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT * INTO v_line
  FROM public.purchase_order_lines
  WHERE id = NEW.purchase_order_line_id AND organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'po_receipt_lines: purchase order line must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_line.purchase_order_id IS DISTINCT FROM v_receipt.purchase_order_id THEN
    RAISE EXCEPTION 'po_receipt_lines: line must belong to the receipt PO'
      USING ERRCODE = 'restrict_violation';
  END IF;

  v_remaining := v_line.quantity - v_line.received_quantity;
  IF NEW.quantity > v_remaining THEN
    RAISE EXCEPTION 'po_receipt_lines: quantity exceeds remaining %', v_remaining
      USING ERRCODE = 'restrict_violation';
  END IF;

  PERFORM set_config('app.po_receipt_apply', 'on', true);
  UPDATE public.purchase_order_lines
  SET received_quantity = received_quantity + NEW.quantity,
      updated_at = now()
  WHERE id = v_line.id AND organization_id = NEW.organization_id;
  PERFORM set_config('app.po_receipt_apply', 'off', true);

  UPDATE public.purchase_orders
  SET
    status = CASE
      WHEN status IN ('issued', 'partially_received') THEN 'partially_received'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_po.id AND organization_id = NEW.organization_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS po_receipt_lines_guard ON public.po_receipt_lines;
CREATE TRIGGER po_receipt_lines_guard
  BEFORE INSERT ON public.po_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.po_receipt_lines_guard();

ALTER TABLE public.po_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.po_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_receipt_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_receipts_tenant_select ON public.po_receipts;
CREATE POLICY po_receipts_tenant_select ON public.po_receipts
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'procurement.read'));

DROP POLICY IF EXISTS po_receipts_tenant_insert ON public.po_receipts;
CREATE POLICY po_receipts_tenant_insert ON public.po_receipts
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'procurement.manage'));

DROP POLICY IF EXISTS po_receipts_service_all ON public.po_receipts;
CREATE POLICY po_receipts_service_all ON public.po_receipts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS po_receipt_lines_tenant_select ON public.po_receipt_lines;
CREATE POLICY po_receipt_lines_tenant_select ON public.po_receipt_lines
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'procurement.read'));

DROP POLICY IF EXISTS po_receipt_lines_tenant_insert ON public.po_receipt_lines;
CREATE POLICY po_receipt_lines_tenant_insert ON public.po_receipt_lines
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'procurement.manage'));

DROP POLICY IF EXISTS po_receipt_lines_service_all ON public.po_receipt_lines;
CREATE POLICY po_receipt_lines_service_all ON public.po_receipt_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION app.po_receipt_lines_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.po_received_quantity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
     AND current_setting('app.po_receipt_apply', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'purchase_order_lines: received_quantity is receipt-history only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS po_received_quantity_guard ON public.purchase_order_lines;
CREATE TRIGGER po_received_quantity_guard
  BEFORE UPDATE ON public.purchase_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.po_received_quantity_guard();

CREATE OR REPLACE FUNCTION app.po_receipt_lines_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'po_receipt_lines: deletes are forbidden'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.receipt_id IS DISTINCT FROM OLD.receipt_id
     OR NEW.purchase_order_line_id IS DISTINCT FROM OLD.purchase_order_line_id
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'po_receipt_lines: receipt quantities are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS po_receipt_lines_immutable_guard ON public.po_receipt_lines;
CREATE TRIGGER po_receipt_lines_immutable_guard
  BEFORE UPDATE OR DELETE ON public.po_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.po_receipt_lines_immutable_guard();

REVOKE ALL ON FUNCTION app.po_received_quantity_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.po_receipt_lines_immutable_guard() FROM PUBLIC;
