-- 0038_change_order_commercial_reversal
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Approved Change Orders are immutable. Current Contract is neutralized by an
-- explicit reversal Change Order + contract_value_event (opposite sign).
-- Original row is never rewritten, never deleted.
-- BOQ allocation reversal for this workflow is the Change-Order-scoped RPC
-- (0045). Manual reverse of an arbitrary allocation stays boq.manage.

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS reversal_of_change_order_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_reversal_of_fk'
  ) THEN
    ALTER TABLE public.change_orders DROP CONSTRAINT change_orders_reversal_of_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_reversal_of_org_fk'
  ) THEN
    ALTER TABLE public.change_orders
      ADD CONSTRAINT change_orders_reversal_of_org_fk
      FOREIGN KEY (reversal_of_change_order_id, organization_id)
      REFERENCES public.change_orders (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS change_orders_reversal_of_uq
  ON public.change_orders (organization_id, reversal_of_change_order_id)
  WHERE reversal_of_change_order_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_reversal_not_self'
  ) THEN
    ALTER TABLE public.change_orders
      ADD CONSTRAINT change_orders_reversal_not_self
      CHECK (reversal_of_change_order_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.change_orders_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'change_orders: deletes are forbidden'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.change_request_id IS DISTINCT FROM OLD.change_request_id
     OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
     OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
     OR NEW.reversal_of_change_order_id IS DISTINCT FROM OLD.reversal_of_change_order_id
     OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason
     OR NEW.reversed_by_user_id IS DISTINCT FROM OLD.reversed_by_user_id THEN
    RAISE EXCEPTION 'change_orders: original commercial columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS change_orders_immutability_guard ON public.change_orders;
CREATE TRIGGER change_orders_immutability_guard
  BEFORE UPDATE OR DELETE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION app.change_orders_immutability_guard();

REVOKE ALL ON FUNCTION app.change_orders_immutability_guard() FROM PUBLIC;
