-- 0044_inventory_locations_qty
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Quantity-only inventory locations + transfer. Financial effect = NONE.
-- Do not create Actual / FIFO / average cost from these movements.

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_id_organization_id_uq
  ON public.inventory_locations (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_org_name_uq
  ON public.inventory_locations (organization_id, name)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_location_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_location_balances_item_loc_uq UNIQUE (inventory_item_id, location_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_id_organization_id_uq
  ON public.inventory_items (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_location_balances_item_org_fk'
  ) THEN
    ALTER TABLE public.inventory_location_balances
      ADD CONSTRAINT inventory_location_balances_item_org_fk
      FOREIGN KEY (inventory_item_id, organization_id)
      REFERENCES public.inventory_items (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_location_balances_loc_org_fk'
  ) THEN
    ALTER TABLE public.inventory_location_balances
      ADD CONSTRAINT inventory_location_balances_loc_org_fk
      FOREIGN KEY (location_id, organization_id)
      REFERENCES public.inventory_locations (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS from_location_id uuid,
  ADD COLUMN IF NOT EXISTS to_location_id uuid;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_known;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_known CHECK (
    movement_type IN ('receive', 'issue', 'return', 'adjust', 'transfer')
  );

COMMENT ON TABLE public.inventory_movements IS
  'Quantity movements only. Never Actual, never GL, never costing.';

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_id_organization_id_uq
  ON public.inventory_movements (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_from_loc_org_fk'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_from_loc_org_fk
      FOREIGN KEY (from_location_id, organization_id)
      REFERENCES public.inventory_locations (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_to_loc_org_fk'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_to_loc_org_fk
      FOREIGN KEY (to_location_id, organization_id)
      REFERENCES public.inventory_locations (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_location_combo;

CREATE OR REPLACE FUNCTION app.inventory_movement_location_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.movement_type IN ('receive', 'return') THEN
    IF NEW.to_location_id IS NULL OR NEW.from_location_id IS NOT NULL THEN
      RAISE EXCEPTION 'inventory_movements: % requires to_location_id only', NEW.movement_type
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.movement_type = 'issue' THEN
    IF NEW.from_location_id IS NULL OR NEW.to_location_id IS NOT NULL THEN
      RAISE EXCEPTION 'inventory_movements: issue requires from_location_id only'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.movement_type = 'transfer' THEN
    IF NEW.from_location_id IS NULL OR NEW.to_location_id IS NULL
       OR NEW.from_location_id = NEW.to_location_id THEN
      RAISE EXCEPTION 'inventory_movements: transfer requires distinct from and to locations'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.movement_type = 'adjust' THEN
    IF (NEW.from_location_id IS NULL) = (NEW.to_location_id IS NULL) THEN
      RAISE EXCEPTION 'inventory_movements: adjust requires exactly one location'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS inventory_movement_location_guard ON public.inventory_movements;
CREATE TRIGGER inventory_movement_location_guard
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_movement_location_guard();

CREATE OR REPLACE FUNCTION app.apply_inventory_location_delta(
  p_organization_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_qty numeric(18,6);
BEGIN
  PERFORM set_config('app.inventory_balance_apply', 'on', true);
  BEGIN
    INSERT INTO public.inventory_location_balances (
      organization_id, inventory_item_id, location_id, quantity
    ) VALUES (
      p_organization_id, p_item_id, p_location_id, 0
    )
    ON CONFLICT (inventory_item_id, location_id) DO NOTHING;

    SELECT quantity INTO v_qty
    FROM public.inventory_location_balances
    WHERE organization_id = p_organization_id
      AND inventory_item_id = p_item_id
      AND location_id = p_location_id
    FOR UPDATE;

    v_qty := COALESCE(v_qty, 0) + p_delta;
    IF v_qty < 0 THEN
      RAISE EXCEPTION 'inventory_location_balances: insufficient quantity'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.inventory_location_balances
    SET quantity = v_qty, updated_at = now()
    WHERE organization_id = p_organization_id
      AND inventory_item_id = p_item_id
      AND location_id = p_location_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.inventory_balance_apply', 'off', true);
    RAISE;
  END;
  PERFORM set_config('app.inventory_balance_apply', 'off', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION app.inventory_movement_apply_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sum numeric(18,6);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.movement_type IN ('receive', 'return') THEN
      PERFORM app.apply_inventory_location_delta(
        NEW.organization_id, NEW.inventory_item_id, NEW.to_location_id, NEW.quantity
      );
    ELSIF NEW.movement_type = 'issue' THEN
      PERFORM app.apply_inventory_location_delta(
        NEW.organization_id, NEW.inventory_item_id, NEW.from_location_id, -NEW.quantity
      );
    ELSIF NEW.movement_type = 'transfer' THEN
      PERFORM app.apply_inventory_location_delta(
        NEW.organization_id, NEW.inventory_item_id, NEW.from_location_id, -NEW.quantity
      );
      PERFORM app.apply_inventory_location_delta(
        NEW.organization_id, NEW.inventory_item_id, NEW.to_location_id, NEW.quantity
      );
    ELSIF NEW.movement_type = 'adjust' THEN
      IF NEW.to_location_id IS NOT NULL THEN
        PERFORM app.apply_inventory_location_delta(
          NEW.organization_id, NEW.inventory_item_id, NEW.to_location_id, NEW.quantity
        );
      ELSE
        PERFORM app.apply_inventory_location_delta(
          NEW.organization_id, NEW.inventory_item_id, NEW.from_location_id, NEW.quantity
        );
      END IF;
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_sum
    FROM public.inventory_location_balances
    WHERE organization_id = NEW.organization_id
      AND inventory_item_id = NEW.inventory_item_id;

    UPDATE public.inventory_items
    SET quantity_on_hand = v_sum, updated_at = now()
    WHERE id = NEW.inventory_item_id AND organization_id = NEW.organization_id;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'inventory_movements: updates and deletes are forbidden'
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS inventory_movement_apply_balances ON public.inventory_movements;
CREATE TRIGGER inventory_movement_apply_balances
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_movement_apply_balances();

CREATE OR REPLACE FUNCTION app.inventory_movements_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'inventory_movements: updates and deletes are forbidden'
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS inventory_movements_immutable_guard ON public.inventory_movements;
CREATE TRIGGER inventory_movements_immutable_guard
  BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_movements_immutable_guard();

-- Balances are derived from movements. Direct writes are forbidden unless the
-- movement-apply GUC is set by app.apply_inventory_location_delta.
CREATE OR REPLACE FUNCTION app.inventory_location_balances_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF current_setting('app.inventory_balance_apply', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'inventory_location_balances: movement-driven only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS inventory_location_balances_write_guard ON public.inventory_location_balances;
CREATE TRIGGER inventory_location_balances_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_location_balances
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_location_balances_write_guard();

DROP POLICY IF EXISTS inventory_location_balances_tenant_write ON public.inventory_location_balances;

REVOKE INSERT, UPDATE, DELETE ON public.inventory_location_balances FROM authenticated;
GRANT SELECT ON public.inventory_location_balances TO authenticated;

REVOKE ALL ON FUNCTION app.apply_inventory_location_delta(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.inventory_movement_apply_balances() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.inventory_movements_immutable_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.inventory_movement_location_guard() FROM PUBLIC;

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_location_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_location_balances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_locations_tenant_select ON public.inventory_locations;
CREATE POLICY inventory_locations_tenant_select ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.read'));

DROP POLICY IF EXISTS inventory_locations_tenant_write ON public.inventory_locations;
CREATE POLICY inventory_locations_tenant_write ON public.inventory_locations
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'));

DROP POLICY IF EXISTS inventory_locations_service_all ON public.inventory_locations;
CREATE POLICY inventory_locations_service_all ON public.inventory_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_location_balances_tenant_select ON public.inventory_location_balances;
CREATE POLICY inventory_location_balances_tenant_select ON public.inventory_location_balances
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.read'));

DROP POLICY IF EXISTS inventory_location_balances_tenant_write ON public.inventory_location_balances;

DROP POLICY IF EXISTS inventory_location_balances_service_all ON public.inventory_location_balances;
CREATE POLICY inventory_location_balances_service_all ON public.inventory_location_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION app.inventory_location_balances_write_guard() FROM PUBLIC;
