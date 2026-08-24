-- 0069: Managerial true cost & profitability foundation (Owner-review revision).
-- General monthly cost pool + auto project attribution, expense installment
-- managerial schedules, recurring amount versions, inventory cost layers,
-- asset acquisition linkage.
-- Owner applies; agent must not apply.
-- Does NOT modify 0000–0068.
--
-- Revision notes vs first draft:
-- - House-style RLS (install_org_table_rls + FORCE + permission gates; derived tables select-only)
-- - Signed general pool (credits/reversals); allocation amounts may be negative; weights >= 0
-- - Model A frozen general-cost month immutability (forever after close; no reopen)
-- - Recurring amount-version non-overlap (0021 advisory lock + optional gist exclusion)
-- - year_month 01–12 validation
-- - Child currency = parent currency (FK + trigger)
-- - source_key uniqueness for recompute idempotency
-- - Inventory layer/item composite FK; consumption idempotency per event+layer
-- - Inventory/asset same-org source FKs with ON DELETE RESTRICT
-- - Inventory layer source shape (exactly one of expense / AP)
-- - Closed month blocks ALL schedule line mutations (no void exception)

-- ---------------------------------------------------------------------------
-- Expenses: installment managerial spread (payment ≠ Actual)
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS installment_start_date date;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS inventory_stock_purchase boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.expenses.installment_count IS
  'Owner-defined managerial monthly cost spread count. 1 = recognize full NET in start month. Cash payments never create Actual.';

COMMENT ON COLUMN public.expenses.installment_start_date IS
  'First calendar month for installment recognition. NULL → expense_date month. Supports retro schedules.';

COMMENT ON COLUMN public.expenses.inventory_stock_purchase IS
  'When true, finalized NET books to inventory cost basis (stock state) instead of operating Actual. Consume/write-off create profit-affecting Actual.';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS inventory_purchase_qty numeric(18, 6);

COMMENT ON COLUMN public.expenses.inventory_item_id IS
  'Target inventory item when inventory_stock_purchase is true. NULL when flag is false.';

COMMENT ON COLUMN public.expenses.inventory_purchase_qty IS
  'Quantity received into central stock for this purchase expense. NULL when flag is false.';

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_inventory_item_org_fk;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_inventory_item_org_fk
  FOREIGN KEY (inventory_item_id, organization_id)
  REFERENCES public.inventory_items(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_inventory_stock_purchase_shape;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_inventory_stock_purchase_shape
  CHECK (
    (
      inventory_stock_purchase = false
      AND inventory_item_id IS NULL
      AND inventory_purchase_qty IS NULL
    )
    OR (
      inventory_stock_purchase = true
      AND inventory_item_id IS NOT NULL
      AND inventory_purchase_qty IS NOT NULL
      AND inventory_purchase_qty > 0
    )
  );

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_installment_count_range;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_installment_count_range
  CHECK (installment_count >= 1 AND installment_count <= 120);

-- Inventory stock purchase is stock state — not operating installment recognition.
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_inventory_installment_exclusive;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_inventory_installment_exclusive
  CHECK (inventory_stock_purchase = false OR installment_count = 1);

-- Finalized expenses: economic-driving fields are immutable (corrections via void/replacement).
CREATE OR REPLACE FUNCTION app.expenses_economic_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF NEW.installment_count IS DISTINCT FROM OLD.installment_count
       OR NEW.installment_start_date IS DISTINCT FROM OLD.installment_start_date
       OR NEW.inventory_stock_purchase IS DISTINCT FROM OLD.inventory_stock_purchase
       OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
       OR NEW.inventory_purchase_qty IS DISTINCT FROM OLD.inventory_purchase_qty
    THEN
      RAISE EXCEPTION 'expenses_economic_settings_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.currency IS DISTINCT FROM OLD.currency
     AND EXISTS (
       SELECT 1
       FROM public.expense_managerial_schedule_lines s
       WHERE s.expense_id = OLD.id
         AND s.organization_id = OLD.organization_id
         AND s.status IN ('scheduled', 'recognized')
     )
  THEN
    RAISE EXCEPTION 'expense_currency_schedule_locked'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_economic_settings_guard ON public.expenses;
CREATE TRIGGER expenses_economic_settings_guard
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.expenses_economic_settings_guard();

CREATE TABLE IF NOT EXISTS public.expense_managerial_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL,
  year_month char(7) NOT NULL,
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_managerial_schedule_lines_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT expense_managerial_schedule_lines_expense_org_fk
    FOREIGN KEY (expense_id, organization_id)
    REFERENCES public.expenses(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT expense_managerial_schedule_lines_year_month_shape
    CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT expense_managerial_schedule_lines_amount_positive
    CHECK (amount > 0),
  CONSTRAINT expense_managerial_schedule_lines_status_known
    CHECK (status IN ('scheduled', 'recognized', 'void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_managerial_schedule_lines_active_uq
  ON public.expense_managerial_schedule_lines (expense_id, year_month)
  WHERE status IN ('scheduled', 'recognized');

CREATE INDEX IF NOT EXISTS expense_managerial_schedule_lines_org_month_idx
  ON public.expense_managerial_schedule_lines (organization_id, year_month);

CREATE INDEX IF NOT EXISTS expense_managerial_schedule_lines_expense_idx
  ON public.expense_managerial_schedule_lines (expense_id);

-- Upgrade-safe: tighten year_month if a prior draft used weaker regex
ALTER TABLE public.expense_managerial_schedule_lines
  DROP CONSTRAINT IF EXISTS expense_managerial_schedule_lines_year_month_shape;

ALTER TABLE public.expense_managerial_schedule_lines
  ADD CONSTRAINT expense_managerial_schedule_lines_year_month_shape
  CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE public.expense_managerial_schedule_lines
  DROP CONSTRAINT IF EXISTS expense_managerial_schedule_lines_amount_nonzero;

ALTER TABLE public.expense_managerial_schedule_lines
  DROP CONSTRAINT IF EXISTS expense_managerial_schedule_lines_amount_positive;

ALTER TABLE public.expense_managerial_schedule_lines
  ADD CONSTRAINT expense_managerial_schedule_lines_amount_positive
  CHECK (amount > 0);

-- ---------------------------------------------------------------------------
-- Recurring draft amount effective dating
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_draft_amount_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_draft_amount_versions_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT recurring_draft_amount_versions_draft_org_fk
    FOREIGN KEY (draft_id, organization_id)
    REFERENCES public.recurring_financial_drafts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT recurring_draft_amount_versions_amount_non_negative
    CHECK (amount >= 0),
  CONSTRAINT recurring_draft_amount_versions_date_order
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS recurring_draft_amount_versions_draft_idx
  ON public.recurring_draft_amount_versions (draft_id, valid_from);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_draft_amount_versions_open_uq
  ON public.recurring_draft_amount_versions (draft_id)
  WHERE valid_to IS NULL;

-- Upgrade-safe: amount-version history survives draft row (pause/end/archive — no hard delete).
ALTER TABLE public.recurring_draft_amount_versions
  DROP CONSTRAINT IF EXISTS recurring_draft_amount_versions_draft_org_fk;

ALTER TABLE public.recurring_draft_amount_versions
  ADD CONSTRAINT recurring_draft_amount_versions_draft_org_fk
  FOREIGN KEY (draft_id, organization_id)
  REFERENCES public.recurring_financial_drafts(id, organization_id)
  ON DELETE RESTRICT;

-- History immutable: DELETE blocked; UPDATE only to close open version (valid_to null → set).
-- Corrections = new effective versions via trusted service path (INSERT).
CREATE OR REPLACE FUNCTION app.recurring_draft_amount_versions_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'recurring_draft_amount_versions_history_immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.valid_to IS NULL
       AND NEW.valid_to IS NOT NULL
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.draft_id IS NOT DISTINCT FROM OLD.draft_id
       AND NEW.valid_from IS NOT DISTINCT FROM OLD.valid_from
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'recurring_draft_amount_versions_history_immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_draft_amount_versions_history_guard
  ON public.recurring_draft_amount_versions;
CREATE TRIGGER recurring_draft_amount_versions_history_guard
  BEFORE UPDATE OR DELETE ON public.recurring_draft_amount_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_draft_amount_versions_history_guard();

-- Non-overlapping effective ranges (0021 pattern: advisory lock + optional gist exclusion)
CREATE OR REPLACE FUNCTION app.recurring_draft_amount_versions_assert_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.organization_id::text || ':recurring_amount:' || NEW.draft_id::text)
  );

  IF EXISTS (
    SELECT 1
    FROM public.recurring_draft_amount_versions existing
    WHERE existing.organization_id = NEW.organization_id
      AND existing.draft_id = NEW.draft_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.valid_from, COALESCE(existing.valid_to, 'infinity'::date), '[]')
          && daterange(NEW.valid_from, COALESCE(NEW.valid_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'recurring_draft_amount_versions_no_overlap'
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_draft_amount_versions_no_overlap
  ON public.recurring_draft_amount_versions;
CREATE TRIGGER recurring_draft_amount_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.recurring_draft_amount_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_draft_amount_versions_assert_no_overlap();

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'btree_gist unavailable (%) — exclusion skipped; advisory+trigger enforce overlap',
        SQLERRM;
      RETURN;
  END;

  ALTER TABLE public.recurring_draft_amount_versions
    DROP CONSTRAINT IF EXISTS recurring_draft_amount_versions_no_overlap_excl;

  ALTER TABLE public.recurring_draft_amount_versions
    ADD CONSTRAINT recurring_draft_amount_versions_no_overlap_excl
    EXCLUDE USING gist (
      organization_id WITH =,
      draft_id WITH =,
      daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
    );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'recurring amount-version exclusion not created (%) — advisory+trigger remain',
      SQLERRM;
END $$;

ALTER TABLE public.recurring_financial_drafts
  ADD COLUMN IF NOT EXISTS auto_finalize_expense boolean NOT NULL DEFAULT false;

ALTER TABLE public.recurring_financial_drafts
  ADD COLUMN IF NOT EXISTS managerial_cost_kind text;

COMMENT ON COLUMN public.recurring_financial_drafts.auto_finalize_expense IS
  'When true and draft_kind=expense, generated occurrences finalize into Actual when month is open.';

COMMENT ON COLUMN public.recurring_financial_drafts.managerial_cost_kind IS
  'direct_project | general_business — Owner attribution for generated expenses.';

ALTER TABLE public.recurring_financial_drafts
  DROP CONSTRAINT IF EXISTS recurring_financial_drafts_managerial_cost_kind_known;

ALTER TABLE public.recurring_financial_drafts
  ADD CONSTRAINT recurring_financial_drafts_managerial_cost_kind_known
  CHECK (
    managerial_cost_kind IS NULL
    OR managerial_cost_kind IN ('direct_project', 'general_business')
  );

-- Amount-version semantics apply ONLY to fixed recurring business expenses.
ALTER TABLE public.recurring_financial_drafts
  DROP CONSTRAINT IF EXISTS recurring_financial_drafts_expense_semantics;

ALTER TABLE public.recurring_financial_drafts
  ADD CONSTRAINT recurring_financial_drafts_expense_semantics
  CHECK (
    draft_kind = 'expense'
    OR (
      auto_finalize_expense = false
      AND managerial_cost_kind IS NULL
    )
  );

-- Amount versions: parent draft must be draft_kind=expense (trusted INSERT path).
CREATE OR REPLACE FUNCTION app.recurring_draft_amount_versions_expense_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.recurring_financial_drafts d
    WHERE d.id = NEW.draft_id
      AND d.organization_id = NEW.organization_id
      AND d.draft_kind = 'expense'
  ) THEN
    RAISE EXCEPTION 'recurring_draft_amount_versions_expense_only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_draft_amount_versions_expense_only
  ON public.recurring_draft_amount_versions;
CREATE TRIGGER recurring_draft_amount_versions_expense_only
  BEFORE INSERT ON public.recurring_draft_amount_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_draft_amount_versions_expense_only();

ALTER TABLE public.recurring_financial_draft_runs
  ADD COLUMN IF NOT EXISTS occurrence_year_month char(7);

ALTER TABLE public.recurring_financial_draft_runs
  DROP CONSTRAINT IF EXISTS recurring_financial_draft_runs_occurrence_ym_shape;

ALTER TABLE public.recurring_financial_draft_runs
  ADD CONSTRAINT recurring_financial_draft_runs_occurrence_ym_shape
  CHECK (
    occurrence_year_month IS NULL
    OR occurrence_year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS recurring_financial_draft_runs_month_uq
  ON public.recurring_financial_draft_runs (organization_id, draft_id, occurrence_year_month)
  WHERE occurrence_year_month IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Monthly general business cost pool + auto project allocations (SIGNED)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.general_cost_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year_month char(7) NOT NULL,
  currency char(3) NOT NULL,
  pool_amount numeric(18, 6) NOT NULL DEFAULT 0,
  allocated_amount numeric(18, 6) NOT NULL DEFAULT 0,
  unallocatable_amount numeric(18, 6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  basis_mode text NOT NULL DEFAULT 'none',
  computed_at timestamptz NOT NULL DEFAULT now(),
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT general_cost_months_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT general_cost_months_org_month_currency_uq UNIQUE (organization_id, year_month, currency),
  CONSTRAINT general_cost_months_year_month_shape
    CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT general_cost_months_status_known
    CHECK (status IN ('open', 'frozen')),
  CONSTRAINT general_cost_months_basis_known
    CHECK (basis_mode IN ('direct_actual_weight', 'equal_split', 'none')),
  -- Signed pool: credits/reversals may make net negative. Do NOT clamp to zero.
  CONSTRAINT general_cost_months_conservation
    CHECK (abs((allocated_amount + unallocatable_amount) - pool_amount) < 0.000001)
);

-- If a prior draft of 0069 created non-negative checks, drop them (upgrade-safe).
ALTER TABLE public.general_cost_months
  DROP CONSTRAINT IF EXISTS general_cost_months_amounts_non_negative;

ALTER TABLE public.general_cost_months
  DROP CONSTRAINT IF EXISTS general_cost_months_year_month_shape;

ALTER TABLE public.general_cost_months
  ADD CONSTRAINT general_cost_months_year_month_shape
  CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE TABLE IF NOT EXISTS public.general_cost_month_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  general_cost_month_id uuid NOT NULL,
  project_id uuid NOT NULL,
  direct_actual_basis numeric(18, 6) NOT NULL DEFAULT 0,
  weight_percent numeric(9, 6),
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT general_cost_month_allocations_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT general_cost_month_allocations_month_org_fk
    FOREIGN KEY (general_cost_month_id, organization_id)
    REFERENCES public.general_cost_months(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT general_cost_month_allocations_project_org_fk
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT general_cost_month_allocations_month_project_uq
    UNIQUE (general_cost_month_id, project_id),
  -- Signed allocation amounts; weights always non-negative
  CONSTRAINT general_cost_month_allocations_amount_nonzero
    CHECK (amount <> 0),
  CONSTRAINT general_cost_month_allocations_weight_non_negative
    CHECK (weight_percent IS NULL OR (weight_percent >= 0 AND weight_percent <= 100))
);

-- Upgrade-safe: drop prior positive-only amount check if present
ALTER TABLE public.general_cost_month_allocations
  DROP CONSTRAINT IF EXISTS general_cost_month_allocations_amount_positive;

CREATE INDEX IF NOT EXISTS general_cost_month_allocations_project_idx
  ON public.general_cost_month_allocations (organization_id, project_id);

CREATE TABLE IF NOT EXISTS public.general_cost_month_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  general_cost_month_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_id uuid,
  source_key text NOT NULL,
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT general_cost_month_sources_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT general_cost_month_sources_month_org_fk
    FOREIGN KEY (general_cost_month_id, organization_id)
    REFERENCES public.general_cost_months(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT general_cost_month_sources_kind_known
    CHECK (source_kind IN (
      'expense_unallocated',
      'labor_monthly_unallocated',
      'labor_non_project',
      'ap_bill_remainder',
      'ap_bill_null_project',
      'inventory_writeoff',
      'other'
    )),
  CONSTRAINT general_cost_month_sources_amount_nonzero
    CHECK (amount <> 0),
  CONSTRAINT general_cost_month_sources_key_nonempty
    CHECK (length(trim(source_key)) > 0)
);

-- Upgrade-safe: add source_key if table existed without it
ALTER TABLE public.general_cost_month_sources
  ADD COLUMN IF NOT EXISTS source_key text;

UPDATE public.general_cost_month_sources
SET source_key = source_kind || ':' || coalesce(source_id::text, 'aggregate')
WHERE source_key IS NULL OR trim(source_key) = '';

ALTER TABLE public.general_cost_month_sources
  ALTER COLUMN source_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS general_cost_month_sources_month_key_uq
  ON public.general_cost_month_sources (general_cost_month_id, source_key);

CREATE INDEX IF NOT EXISTS general_cost_month_sources_month_idx
  ON public.general_cost_month_sources (general_cost_month_id);

CREATE UNIQUE INDEX IF NOT EXISTS general_cost_months_id_org_currency_uq
  ON public.general_cost_months (id, organization_id, currency);

-- Upgrade-safe: widen child→parent FK to include currency (structural integrity)
ALTER TABLE public.general_cost_month_allocations
  DROP CONSTRAINT IF EXISTS general_cost_month_allocations_month_org_fk;

ALTER TABLE public.general_cost_month_allocations
  ADD CONSTRAINT general_cost_month_allocations_month_org_fk
  FOREIGN KEY (general_cost_month_id, organization_id, currency)
  REFERENCES public.general_cost_months(id, organization_id, currency)
  ON DELETE CASCADE;

ALTER TABLE public.general_cost_month_sources
  DROP CONSTRAINT IF EXISTS general_cost_month_sources_month_org_fk;

ALTER TABLE public.general_cost_month_sources
  ADD CONSTRAINT general_cost_month_sources_month_org_fk
  FOREIGN KEY (general_cost_month_id, organization_id, currency)
  REFERENCES public.general_cost_months(id, organization_id, currency)
  ON DELETE CASCADE;

-- Child currency must match parent month currency
CREATE OR REPLACE FUNCTION app.general_cost_child_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_currency char(3);
BEGIN
  SELECT m.currency INTO parent_currency
  FROM public.general_cost_months m
  WHERE m.id = NEW.general_cost_month_id
    AND m.organization_id = NEW.organization_id;

  IF parent_currency IS NULL THEN
    RAISE EXCEPTION 'general_cost_parent_missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF upper(NEW.currency) <> upper(parent_currency) THEN
    RAISE EXCEPTION 'general_cost_currency_mismatch: child % vs parent %',
      NEW.currency, parent_currency
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS general_cost_month_allocations_currency_guard
  ON public.general_cost_month_allocations;
CREATE TRIGGER general_cost_month_allocations_currency_guard
  BEFORE INSERT OR UPDATE OF currency, general_cost_month_id, organization_id
  ON public.general_cost_month_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_child_currency_guard();

DROP TRIGGER IF EXISTS general_cost_month_sources_currency_guard
  ON public.general_cost_month_sources;
CREATE TRIGGER general_cost_month_sources_currency_guard
  BEFORE INSERT OR UPDATE OF currency, general_cost_month_id, organization_id
  ON public.general_cost_month_sources
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_child_currency_guard();

-- Frozen general-cost month immutability (DB-level; not UI-only).
-- Model A (canonical): closed months never reopen (canTransitionMonthClose forbids
-- closed→open). Post-close corrections use month_close_adjustments only. General
-- cost pool rows stay frozen forever after month close — frozen→open is blocked.
CREATE OR REPLACE FUNCTION app.general_cost_month_frozen_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  month_status text;
  ym char(7);
BEGIN
  IF TG_TABLE_NAME = 'general_cost_months' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'frozen' THEN
        RAISE EXCEPTION 'general_cost_month_frozen_immutable: %', OLD.year_month
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    -- Allow open → frozen transition (month close). Block all edits once frozen.
    IF TG_OP = 'UPDATE' AND OLD.status = 'frozen' THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
         OR NEW.year_month IS DISTINCT FROM OLD.year_month
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.pool_amount IS DISTINCT FROM OLD.pool_amount
         OR NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
         OR NEW.unallocatable_amount IS DISTINCT FROM OLD.unallocatable_amount
         OR NEW.status IS DISTINCT FROM OLD.status
         OR NEW.basis_mode IS DISTINCT FROM OLD.basis_mode
         OR NEW.computed_at IS DISTINCT FROM OLD.computed_at
         OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
         OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
      THEN
        RAISE EXCEPTION 'general_cost_month_frozen_immutable: %', OLD.year_month
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  -- Child tables: check OLD and NEW parent months separately on UPDATE.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT m.status, m.year_month INTO month_status, ym
    FROM public.general_cost_months m
    WHERE m.id = OLD.general_cost_month_id
      AND m.organization_id = OLD.organization_id;

    IF month_status = 'frozen' THEN
      RAISE EXCEPTION 'general_cost_month_frozen_immutable: child of %', ym
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT m.status, m.year_month INTO month_status, ym
    FROM public.general_cost_months m
    WHERE m.id = NEW.general_cost_month_id
      AND m.organization_id = NEW.organization_id;

    IF month_status = 'frozen' THEN
      RAISE EXCEPTION 'general_cost_month_frozen_immutable: child of %', ym
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION app.general_cost_month_frozen_guard() IS
  'Model A: general cost frozen at month close forever. Closed months never reopen; '
  'corrections via month_close_adjustments only. Blocks frozen→open and all economic '
  'edits while status=frozen.';

DROP TRIGGER IF EXISTS general_cost_months_frozen_guard ON public.general_cost_months;
CREATE TRIGGER general_cost_months_frozen_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.general_cost_months
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_month_frozen_guard();

DROP TRIGGER IF EXISTS general_cost_month_allocations_frozen_guard
  ON public.general_cost_month_allocations;
CREATE TRIGGER general_cost_month_allocations_frozen_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.general_cost_month_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_month_frozen_guard();

DROP TRIGGER IF EXISTS general_cost_month_sources_frozen_guard
  ON public.general_cost_month_sources;
CREATE TRIGGER general_cost_month_sources_frozen_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.general_cost_month_sources
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_month_frozen_guard();

-- Tie General Cost Month to Month Close: no new/open economic pool for closed periods.
CREATE OR REPLACE FUNCTION app.general_cost_month_closed_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'is_month_closed_unrestricted'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month) THEN
    RAISE EXCEPTION 'general_cost_month_closed_period: cannot create pool for closed month %',
      NEW.year_month
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE'
     AND app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month)
     AND (
       NEW.year_month IS DISTINCT FROM OLD.year_month
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.status = 'open'
     )
  THEN
    RAISE EXCEPTION 'general_cost_month_closed_period: cannot target closed month %',
      NEW.year_month
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS general_cost_months_closed_period_guard ON public.general_cost_months;
CREATE TRIGGER general_cost_months_closed_period_guard
  BEFORE INSERT OR UPDATE OF status, year_month, organization_id ON public.general_cost_months
  FOR EACH ROW
  EXECUTE FUNCTION app.general_cost_month_closed_period_guard();

-- ---------------------------------------------------------------------------
-- Inventory managerial cost layers (stock value ≠ operating Actual)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS cost_basis_amount numeric(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS cost_basis_currency char(3);

COMMENT ON COLUMN public.inventory_items.cost_basis_amount IS
  'Managerial remaining stock cost basis. Not Project Actual. Consume/write-off move cost.';

COMMENT ON COLUMN public.inventory_items.cost_basis_currency IS
  'Currency for cost_basis_amount. Zero amount may have NULL currency; positive amount requires currency.';

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_cost_basis_non_negative;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_cost_basis_non_negative
  CHECK (cost_basis_amount >= 0);

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_cost_basis_currency_shape;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_cost_basis_currency_shape
  CHECK (cost_basis_amount = 0 OR cost_basis_currency IS NOT NULL);

-- Trusted write latch: non-forgeable next_gen_latch (GUC alone is not authorization).
-- INSERT never invents economic stock value — even with the latch on.
-- Economic basis arrives only via opening/expense cost layers + trusted UPDATE.
CREATE OR REPLACE FUNCTION app.inventory_items_cost_basis_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Master row creation never claims stock value (trusted or not).
    NEW.cost_basis_amount := 0;
    NEW.cost_basis_currency := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: block changes to cost_basis_* unless secure latch is held
  IF NOT app.next_gen_latch_held('inventory_cost_basis') THEN
    IF NEW.cost_basis_amount IS DISTINCT FROM OLD.cost_basis_amount
       OR NEW.cost_basis_currency IS DISTINCT FROM OLD.cost_basis_currency THEN
      RAISE EXCEPTION 'inventory_items_cost_basis_trusted_write_required'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_cost_basis_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_cost_basis_guard
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION app.inventory_items_cost_basis_guard();

-- Trusted cost_basis writes must reconcile to sum(remaining_qty × unit_cost).
-- Unconditional: zero basis must also match zero remaining layer value.
CREATE OR REPLACE FUNCTION app.inventory_items_cost_basis_reconcile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_layer_sum numeric(18, 6);
  v_layer_currency char(3);
BEGIN
  IF TG_OP <> 'UPDATE' OR NOT app.next_gen_latch_held('inventory_cost_basis') THEN
    RETURN NEW;
  END IF;

  IF NEW.cost_basis_amount IS NOT DISTINCT FROM OLD.cost_basis_amount
     AND NEW.cost_basis_currency IS NOT DISTINCT FROM OLD.cost_basis_currency THEN
    RETURN NEW;
  END IF;

  -- Sum ALL remaining layer value (caller cannot filter by chosen currency).
  SELECT coalesce(sum(l.remaining_qty * l.unit_cost), 0)
  INTO v_layer_sum
  FROM public.inventory_cost_layers l
  WHERE l.inventory_item_id = NEW.id
    AND l.organization_id = NEW.organization_id;

  IF abs(NEW.cost_basis_amount - v_layer_sum) >= 0.000001 THEN
    RAISE EXCEPTION 'inventory_items_cost_basis_layer_mismatch: basis % vs layers %',
      NEW.cost_basis_amount, v_layer_sum
      USING ERRCODE = 'check_violation';
  END IF;

  -- When stock value remains, basis currency must match the item's canonical layer currency.
  IF v_layer_sum >= 0.000001 THEN
    SELECT l.currency INTO v_layer_currency
    FROM public.inventory_cost_layers l
    WHERE l.inventory_item_id = NEW.id
      AND l.organization_id = NEW.organization_id
      AND l.remaining_qty > 0
    ORDER BY l.created_at
    LIMIT 1;

    IF v_layer_currency IS NULL
       OR NEW.cost_basis_currency IS NULL
       OR upper(NEW.cost_basis_currency) <> upper(v_layer_currency)
    THEN
      RAISE EXCEPTION 'inventory_items_cost_basis_currency_mismatch: basis % vs layers %',
        NEW.cost_basis_currency, v_layer_currency
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_cost_basis_reconcile ON public.inventory_items;
CREATE TRIGGER inventory_items_cost_basis_reconcile
  AFTER UPDATE OF cost_basis_amount, cost_basis_currency ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION app.inventory_items_cost_basis_reconcile();

CREATE TABLE IF NOT EXISTS public.inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_expense_id uuid,
  source_ap_bill_id uuid,
  opening_reference text,
  received_on date NOT NULL,
  received_qty numeric(18, 6) NOT NULL,
  remaining_qty numeric(18, 6) NOT NULL,
  unit_cost numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_cost_layers_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT inventory_cost_layers_item_org_fk
    FOREIGN KEY (inventory_item_id, organization_id)
    REFERENCES public.inventory_items(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_layers_qty_non_negative
    CHECK (received_qty >= 0 AND remaining_qty >= 0 AND remaining_qty <= received_qty),
  CONSTRAINT inventory_cost_layers_unit_cost_non_negative
    CHECK (unit_cost >= 0),
  CONSTRAINT inventory_cost_layers_source_shape
    CHECK (
      (source_kind = 'expense' AND source_expense_id IS NOT NULL AND source_ap_bill_id IS NULL)
      OR (
        source_kind = 'opening_balance'
        AND source_expense_id IS NULL
        AND source_ap_bill_id IS NULL
        AND opening_reference IS NOT NULL
        AND length(trim(opening_reference)) > 0
      )
    )
);

-- Upgrade-safe: source_kind + opening_reference for existing installs
ALTER TABLE public.inventory_cost_layers
  ADD COLUMN IF NOT EXISTS source_kind text;

ALTER TABLE public.inventory_cost_layers
  ADD COLUMN IF NOT EXISTS opening_reference text;

UPDATE public.inventory_cost_layers
SET
  source_kind = CASE
    WHEN source_expense_id IS NOT NULL THEN 'expense'
    WHEN source_ap_bill_id IS NOT NULL THEN 'opening_balance'
    ELSE coalesce(source_kind, 'opening_balance')
  END,
  opening_reference = CASE
    WHEN source_expense_id IS NULL
      AND source_ap_bill_id IS NOT NULL
      AND (opening_reference IS NULL OR length(trim(opening_reference)) = 0)
    THEN 'legacy-ap-migration:' || id::text
    WHEN source_expense_id IS NULL
      AND source_ap_bill_id IS NULL
      AND (opening_reference IS NULL OR length(trim(opening_reference)) = 0)
    THEN 'legacy-migration:' || id::text
    ELSE opening_reference
  END,
  source_ap_bill_id = NULL
WHERE source_kind IS NULL OR source_kind = 'ap_bill';

ALTER TABLE public.inventory_cost_layers
  ALTER COLUMN source_kind SET NOT NULL;

-- Upgrade-safe: economic history must survive item row (delete item only after layers/consumptions gone)
ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_item_org_fk;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_item_org_fk
  FOREIGN KEY (inventory_item_id, organization_id)
  REFERENCES public.inventory_items(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_expense_org_fk;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_expense_org_fk
  FOREIGN KEY (source_expense_id, organization_id)
  REFERENCES public.expenses(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_ap_bill_org_fk;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_ap_bill_org_fk
  FOREIGN KEY (source_ap_bill_id, organization_id)
  REFERENCES public.ap_bills(id, organization_id)
  ON DELETE RESTRICT;

-- Upgrade-safe source shape if table existed without it
ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_shape;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_shape
  CHECK (
    (source_kind = 'expense' AND source_expense_id IS NOT NULL AND source_ap_bill_id IS NULL)
    OR (
      source_kind = 'opening_balance'
      AND source_expense_id IS NULL
      AND source_ap_bill_id IS NULL
      AND opening_reference IS NOT NULL
      AND length(trim(opening_reference)) > 0
    )
  );

COMMENT ON COLUMN public.inventory_cost_layers.source_ap_bill_id IS
  'Reserved — ap_bill FIFO layers disabled until AP line-level inventory attribution exists.';

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_opening_reference_uq
  ON public.inventory_cost_layers (organization_id, inventory_item_id, opening_reference)
  WHERE source_kind = 'opening_balance';

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_source_expense_uq
  ON public.inventory_cost_layers (organization_id, source_expense_id)
  WHERE source_expense_id IS NOT NULL;

DROP INDEX IF EXISTS inventory_cost_layers_source_ap_bill_uq;

CREATE INDEX IF NOT EXISTS inventory_cost_layers_item_idx
  ON public.inventory_cost_layers (inventory_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_id_org_item_uq
  ON public.inventory_cost_layers (id, organization_id, inventory_item_id);

-- All layers for one item share a single currency. Lock item row to serialize first-layer races.
CREATE OR REPLACE FUNCTION app.inventory_cost_layers_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected char(3);
BEGIN
  PERFORM 1
  FROM public.inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.organization_id = NEW.organization_id
  FOR UPDATE;

  SELECT coalesce(
    (
      SELECT l.currency
      FROM public.inventory_cost_layers l
      WHERE l.inventory_item_id = NEW.inventory_item_id
        AND l.organization_id = NEW.organization_id
        AND l.id IS DISTINCT FROM NEW.id
      ORDER BY l.created_at
      LIMIT 1
    ),
    (
      SELECT i.cost_basis_currency
      FROM public.inventory_items i
      WHERE i.id = NEW.inventory_item_id
        AND i.organization_id = NEW.organization_id
    )
  ) INTO v_expected;

  IF v_expected IS NOT NULL AND upper(NEW.currency) <> upper(v_expected) THEN
    RAISE EXCEPTION 'inventory_cost_layer_currency_mismatch: % vs expected %',
      NEW.currency, v_expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Expense-sourced layers must prove inventory stock purchase provenance.
CREATE OR REPLACE FUNCTION app.inventory_cost_layers_expense_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exp record;
BEGIN
  IF NEW.source_kind <> 'expense' OR NEW.source_expense_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    e.organization_id,
    e.status,
    e.archived_at,
    e.inventory_stock_purchase,
    e.inventory_item_id,
    e.inventory_purchase_qty,
    e.currency,
    e.net_amount
  INTO v_exp
  FROM public.expenses e
  WHERE e.id = NEW.source_expense_id;

  IF v_exp IS NULL
     OR v_exp.organization_id <> NEW.organization_id
     OR v_exp.status <> 'finalized'
     OR v_exp.archived_at IS NOT NULL
     OR v_exp.inventory_stock_purchase IS NOT TRUE
     OR v_exp.inventory_item_id IS DISTINCT FROM NEW.inventory_item_id
     OR upper(v_exp.currency) <> upper(NEW.currency)
     OR v_exp.inventory_purchase_qty IS DISTINCT FROM NEW.received_qty
     OR v_exp.net_amount IS NULL
     OR v_exp.net_amount::numeric <= 0
     OR abs((NEW.received_qty * NEW.unit_cost) - v_exp.net_amount::numeric) >= 0.000001
  THEN
    RAISE EXCEPTION 'inventory_cost_layer_expense_source_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_cost_layers_expense_source_guard
  ON public.inventory_cost_layers;
CREATE TRIGGER inventory_cost_layers_expense_source_guard
  BEFORE INSERT OR UPDATE OF source_kind, source_expense_id, inventory_item_id, organization_id,
    received_qty, unit_cost, currency
  ON public.inventory_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_cost_layers_expense_source_guard();

DROP TRIGGER IF EXISTS inventory_cost_layers_currency_guard
  ON public.inventory_cost_layers;
CREATE TRIGGER inventory_cost_layers_currency_guard
  BEFORE INSERT OR UPDATE OF currency, inventory_item_id, organization_id
  ON public.inventory_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_cost_layers_currency_guard();

CREATE TABLE IF NOT EXISTS public.inventory_cost_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL,
  inventory_cost_layer_id uuid NOT NULL,
  project_id uuid,
  movement_id uuid,
  material_usage_id uuid,
  quantity numeric(18, 6) NOT NULL,
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  kind text NOT NULL DEFAULT 'project_consume',
  occurred_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_cost_consumptions_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT inventory_cost_consumptions_item_org_fk
    FOREIGN KEY (inventory_item_id, organization_id)
    REFERENCES public.inventory_items(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_consumptions_layer_org_fk
    FOREIGN KEY (inventory_cost_layer_id, organization_id, inventory_item_id)
    REFERENCES public.inventory_cost_layers(id, organization_id, inventory_item_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_consumptions_project_org_fk
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_consumptions_kind_known
    CHECK (kind IN ('project_consume', 'writeoff', 'adjust')),
  CONSTRAINT inventory_cost_consumptions_qty_positive
    CHECK (quantity > 0),
  CONSTRAINT inventory_cost_consumptions_amount_non_negative
    CHECK (amount >= 0),
  CONSTRAINT inventory_cost_consumptions_project_shape
    CHECK (
      (kind = 'project_consume' AND project_id IS NOT NULL)
      OR (kind IN ('writeoff', 'adjust') AND project_id IS NULL)
    )
);

-- Upgrade-safe: consumption economic history survives item delete
ALTER TABLE public.inventory_cost_consumptions
  DROP CONSTRAINT IF EXISTS inventory_cost_consumptions_item_org_fk;

ALTER TABLE public.inventory_cost_consumptions
  ADD CONSTRAINT inventory_cost_consumptions_item_org_fk
  FOREIGN KEY (inventory_item_id, organization_id)
  REFERENCES public.inventory_items(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory_cost_consumptions
  DROP CONSTRAINT IF EXISTS inventory_cost_consumptions_project_shape;

ALTER TABLE public.inventory_cost_consumptions
  ADD CONSTRAINT inventory_cost_consumptions_project_shape
  CHECK (
    (kind = 'project_consume' AND project_id IS NOT NULL)
    OR (kind IN ('writeoff', 'adjust') AND project_id IS NULL)
  );

ALTER TABLE public.inventory_cost_consumptions
  DROP CONSTRAINT IF EXISTS inventory_cost_consumptions_movement_org_fk;

ALTER TABLE public.inventory_cost_consumptions
  ADD CONSTRAINT inventory_cost_consumptions_movement_org_fk
  FOREIGN KEY (movement_id, organization_id)
  REFERENCES public.inventory_movements(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory_cost_consumptions
  DROP CONSTRAINT IF EXISTS inventory_cost_consumptions_material_usage_org_fk;

ALTER TABLE public.inventory_cost_consumptions
  ADD CONSTRAINT inventory_cost_consumptions_material_usage_org_fk
  FOREIGN KEY (material_usage_id, organization_id)
  REFERENCES public.material_usage_records(id, organization_id)
  ON DELETE RESTRICT;

-- Upgrade-safe: composite layer FK includes inventory_item_id
ALTER TABLE public.inventory_cost_consumptions
  DROP CONSTRAINT IF EXISTS inventory_cost_consumptions_layer_org_fk;

ALTER TABLE public.inventory_cost_consumptions
  ADD CONSTRAINT inventory_cost_consumptions_layer_org_fk
  FOREIGN KEY (inventory_cost_layer_id, organization_id, inventory_item_id)
  REFERENCES public.inventory_cost_layers(id, organization_id, inventory_item_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_consumptions_movement_layer_uq
  ON public.inventory_cost_consumptions (organization_id, movement_id, inventory_cost_layer_id)
  WHERE movement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_consumptions_material_layer_uq
  ON public.inventory_cost_consumptions (organization_id, material_usage_id, inventory_cost_layer_id)
  WHERE material_usage_id IS NOT NULL;

-- Consumption currency and item must match referenced cost layer
CREATE OR REPLACE FUNCTION app.inventory_cost_consumptions_layer_match_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  layer_currency char(3);
  layer_item_id uuid;
BEGIN
  SELECT l.currency, l.inventory_item_id
  INTO layer_currency, layer_item_id
  FROM public.inventory_cost_layers l
  WHERE l.id = NEW.inventory_cost_layer_id
    AND l.organization_id = NEW.organization_id;

  IF layer_currency IS NULL THEN
    RAISE EXCEPTION 'inventory_cost_layer_missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF upper(NEW.currency) <> upper(layer_currency) THEN
    RAISE EXCEPTION 'inventory_cost_consumption_currency_mismatch: % vs layer %',
      NEW.currency, layer_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.inventory_item_id <> layer_item_id THEN
    RAISE EXCEPTION 'inventory_cost_consumption_item_mismatch: % vs layer %',
      NEW.inventory_item_id, layer_item_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_cost_consumptions_layer_match_guard
  ON public.inventory_cost_consumptions;
CREATE TRIGGER inventory_cost_consumptions_layer_match_guard
  BEFORE INSERT OR UPDATE OF currency, inventory_item_id, inventory_cost_layer_id, organization_id
  ON public.inventory_cost_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_cost_consumptions_layer_match_guard();

-- Movement / material-usage references must agree with consumption economics.
CREATE OR REPLACE FUNCTION app.inventory_cost_consumptions_source_provenance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mov_item uuid;
  v_mov_date date;
  v_mu_item uuid;
  v_mu_project uuid;
  v_mu_date date;
BEGIN
  IF NEW.movement_id IS NOT NULL THEN
    SELECT m.inventory_item_id, m.occurred_on
    INTO v_mov_item, v_mov_date
    FROM public.inventory_movements m
    WHERE m.id = NEW.movement_id
      AND m.organization_id = NEW.organization_id;

    IF v_mov_item IS NULL OR v_mov_item <> NEW.inventory_item_id THEN
      RAISE EXCEPTION 'inventory_cost_consumption_movement_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_mov_date IS NULL OR NEW.occurred_on IS DISTINCT FROM v_mov_date THEN
      RAISE EXCEPTION 'inventory_cost_consumption_movement_date_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.material_usage_id IS NOT NULL THEN
    SELECT mu.inventory_item_id, mu.project_id, mu.usage_date
    INTO v_mu_item, v_mu_project, v_mu_date
    FROM public.material_usage_records mu
    WHERE mu.id = NEW.material_usage_id
      AND mu.organization_id = NEW.organization_id;

    IF v_mu_item IS NULL OR v_mu_item <> NEW.inventory_item_id THEN
      RAISE EXCEPTION 'inventory_cost_consumption_material_item_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.kind = 'project_consume'
       AND (v_mu_project IS NULL OR v_mu_project IS DISTINCT FROM NEW.project_id)
    THEN
      RAISE EXCEPTION 'inventory_cost_consumption_material_project_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_mu_date IS NULL OR NEW.occurred_on IS DISTINCT FROM v_mu_date THEN
      RAISE EXCEPTION 'inventory_cost_consumption_material_date_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_cost_consumptions_source_provenance_guard
  ON public.inventory_cost_consumptions;
CREATE TRIGGER inventory_cost_consumptions_source_provenance_guard
  BEFORE INSERT OR UPDATE OF movement_id, material_usage_id, inventory_item_id, project_id, kind,
    organization_id, occurred_on
  ON public.inventory_cost_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION app.inventory_cost_consumptions_source_provenance_guard();

CREATE INDEX IF NOT EXISTS inventory_cost_consumptions_project_idx
  ON public.inventory_cost_consumptions (organization_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_cost_consumptions_org_date_idx
  ON public.inventory_cost_consumptions (organization_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Asset acquisition economic linkage (Actual stays on Expense/AP)
-- ---------------------------------------------------------------------------
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS acquisition_amount numeric(18, 6);

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS acquisition_currency char(3);

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS acquired_on date;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS source_expense_id uuid;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS source_ap_bill_id uuid;

COMMENT ON COLUMN public.assets.acquisition_amount IS
  'Display/trace acquisition amount. Does not create Actual — Expense/AP remains recognition source.';

-- Composite FK: ON DELETE RESTRICT (SET NULL on composite would null organization_id — invalid)
ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_source_expense_org_fk;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_source_expense_org_fk
  FOREIGN KEY (source_expense_id, organization_id)
  REFERENCES public.expenses(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_source_ap_bill_org_fk;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_source_ap_bill_org_fk
  FOREIGN KEY (source_ap_bill_id, organization_id)
  REFERENCES public.ap_bills(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_acquisition_shape;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_acquisition_shape
  CHECK (
    (
      acquisition_amount IS NULL
      AND acquisition_currency IS NULL
      AND acquired_on IS NULL
      AND source_expense_id IS NULL
      AND source_ap_bill_id IS NULL
    )
    OR (
      acquisition_amount IS NOT NULL
      AND acquisition_amount >= 0
      AND acquisition_currency IS NOT NULL
      AND acquired_on IS NOT NULL
      AND NOT (source_expense_id IS NOT NULL AND source_ap_bill_id IS NOT NULL)
    )
  );

-- ---------------------------------------------------------------------------
-- Schedule line closed-period guard (Model A: no mutations in closed months)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.expense_managerial_schedule_closed_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'is_month_closed_unrestricted'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF app.is_month_closed_unrestricted(OLD.organization_id, OLD.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', OLD.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF app.is_month_closed_unrestricted(OLD.organization_id, OLD.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', OLD.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', NEW.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month) THEN
    RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', NEW.year_month
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Schedule line currency must match parent expense (no FX engine).
CREATE OR REPLACE FUNCTION app.expense_managerial_schedule_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense_currency char(3);
BEGIN
  SELECT e.currency INTO v_expense_currency
  FROM public.expenses e
  WHERE e.id = NEW.expense_id
    AND e.organization_id = NEW.organization_id;

  IF v_expense_currency IS NULL THEN
    RAISE EXCEPTION 'expense_managerial_schedule_parent_missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF upper(NEW.currency) <> upper(v_expense_currency) THEN
    RAISE EXCEPTION 'expense_managerial_schedule_currency_mismatch: % vs expense %',
      NEW.currency, v_expense_currency
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_managerial_schedule_currency_guard
  ON public.expense_managerial_schedule_lines;
CREATE TRIGGER expense_managerial_schedule_currency_guard
  BEFORE INSERT OR UPDATE OF currency, expense_id, organization_id
  ON public.expense_managerial_schedule_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.expense_managerial_schedule_currency_guard();

DROP TRIGGER IF EXISTS expense_managerial_schedule_closed_guard
  ON public.expense_managerial_schedule_lines;
CREATE TRIGGER expense_managerial_schedule_closed_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_managerial_schedule_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.expense_managerial_schedule_closed_guard();

-- ---------------------------------------------------------------------------
-- RLS — house style (FORCE + permissions + derived select-only)
-- ---------------------------------------------------------------------------

-- Drop weak JWT policies from any prior local draft of 0069
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'expense_managerial_schedule_lines',
        'recurring_draft_amount_versions',
        'general_cost_months',
        'general_cost_month_allocations',
        'general_cost_month_sources',
        'inventory_cost_layers',
        'inventory_cost_consumptions'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Schedule lines: parent expense project scope (not org-wide via expenses.read alone).
SELECT app.install_org_parent_table_rls(
  'expense_managerial_schedule_lines',
  'expenses',
  'expense_id',
  'expenses.read',
  'expenses.finalize',
  'project_id'
);
DROP POLICY IF EXISTS expense_managerial_schedule_lines_tenant_insert
  ON public.expense_managerial_schedule_lines;
DROP POLICY IF EXISTS expense_managerial_schedule_lines_tenant_update
  ON public.expense_managerial_schedule_lines;
DROP POLICY IF EXISTS expense_managerial_schedule_lines_tenant_delete
  ON public.expense_managerial_schedule_lines;
REVOKE INSERT, UPDATE, DELETE ON public.expense_managerial_schedule_lines FROM authenticated;
GRANT SELECT ON public.expense_managerial_schedule_lines TO authenticated;

-- Amount versions: expense recurring drafts only — trusted service writes; select-only for authenticated.
ALTER TABLE public.recurring_draft_amount_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_draft_amount_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_draft_amount_versions_tenant_select
  ON public.recurring_draft_amount_versions;
CREATE POLICY recurring_draft_amount_versions_tenant_select
  ON public.recurring_draft_amount_versions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.read')
    AND EXISTS (
      SELECT 1
      FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND d.draft_kind = 'expense'
    )
  );

DROP POLICY IF EXISTS recurring_draft_amount_versions_tenant_insert
  ON public.recurring_draft_amount_versions;
DROP POLICY IF EXISTS recurring_draft_amount_versions_tenant_update
  ON public.recurring_draft_amount_versions;
DROP POLICY IF EXISTS recurring_draft_amount_versions_tenant_delete
  ON public.recurring_draft_amount_versions;
DROP POLICY IF EXISTS recurring_draft_amount_versions_service_all
  ON public.recurring_draft_amount_versions;
CREATE POLICY recurring_draft_amount_versions_service_all
  ON public.recurring_draft_amount_versions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON public.recurring_draft_amount_versions FROM authenticated;
GRANT SELECT ON public.recurring_draft_amount_versions TO authenticated;

-- General cost months: derived financial truth — select only
SELECT app.install_org_table_rls(
  'general_cost_months',
  'project_financials.read',
  'month_close.manage',
  NULL
);
DROP POLICY IF EXISTS general_cost_months_tenant_insert ON public.general_cost_months;
DROP POLICY IF EXISTS general_cost_months_tenant_update ON public.general_cost_months;
DROP POLICY IF EXISTS general_cost_months_tenant_delete ON public.general_cost_months;
REVOKE INSERT, UPDATE, DELETE ON public.general_cost_months FROM authenticated;
GRANT SELECT ON public.general_cost_months TO authenticated;

SELECT app.install_org_table_rls(
  'general_cost_month_allocations',
  'project_financials.read',
  'month_close.manage',
  'project_id'
);
DROP POLICY IF EXISTS general_cost_month_allocations_tenant_insert
  ON public.general_cost_month_allocations;
DROP POLICY IF EXISTS general_cost_month_allocations_tenant_update
  ON public.general_cost_month_allocations;
DROP POLICY IF EXISTS general_cost_month_allocations_tenant_delete
  ON public.general_cost_month_allocations;
REVOKE INSERT, UPDATE, DELETE ON public.general_cost_month_allocations FROM authenticated;
GRANT SELECT ON public.general_cost_month_allocations TO authenticated;

SELECT app.install_org_table_rls(
  'general_cost_month_sources',
  'project_financials.read',
  'month_close.manage',
  NULL
);
DROP POLICY IF EXISTS general_cost_month_sources_tenant_insert
  ON public.general_cost_month_sources;
DROP POLICY IF EXISTS general_cost_month_sources_tenant_update
  ON public.general_cost_month_sources;
DROP POLICY IF EXISTS general_cost_month_sources_tenant_delete
  ON public.general_cost_month_sources;
REVOKE INSERT, UPDATE, DELETE ON public.general_cost_month_sources FROM authenticated;
GRANT SELECT ON public.general_cost_month_sources TO authenticated;

-- Inventory cost: derived — assets.read select; writes via trusted service/app paths
SELECT app.install_org_table_rls(
  'inventory_cost_layers',
  'assets.read',
  'assets.manage',
  NULL
);
DROP POLICY IF EXISTS inventory_cost_layers_tenant_insert ON public.inventory_cost_layers;
DROP POLICY IF EXISTS inventory_cost_layers_tenant_update ON public.inventory_cost_layers;
DROP POLICY IF EXISTS inventory_cost_layers_tenant_delete ON public.inventory_cost_layers;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_cost_layers FROM authenticated;
GRANT SELECT ON public.inventory_cost_layers TO authenticated;

SELECT app.install_org_table_rls(
  'inventory_cost_consumptions',
  'assets.read',
  'assets.manage',
  'project_id'
);
DROP POLICY IF EXISTS inventory_cost_consumptions_tenant_insert
  ON public.inventory_cost_consumptions;
DROP POLICY IF EXISTS inventory_cost_consumptions_tenant_update
  ON public.inventory_cost_consumptions;
DROP POLICY IF EXISTS inventory_cost_consumptions_tenant_delete
  ON public.inventory_cost_consumptions;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_cost_consumptions FROM authenticated;
GRANT SELECT ON public.inventory_cost_consumptions TO authenticated;

-- Ensure FORCE RLS (install_org_table_rls already forces; assert for safety)
ALTER TABLE public.expense_managerial_schedule_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_draft_amount_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.general_cost_months FORCE ROW LEVEL SECURITY;
ALTER TABLE public.general_cost_month_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.general_cost_month_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_layers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_consumptions FORCE ROW LEVEL SECURITY;
