-- PRE-0021 Agent 1 integrity patch (DISPOSABLE / Lead merge candidate).
-- Apply AFTER current 0021_workforce_contacts_and_allocations.sql on throwaway DBs.
-- Lead should fold these snippets into 0021 (LEAD ONLY edits that file).
-- Does NOT create 0022. Does NOT touch 0000–0020.

--------------------------------------------------------------------------------
-- A) employee_month_costs immutability + correction pointer
--------------------------------------------------------------------------------

ALTER TABLE "employee_month_costs"
  ADD COLUMN IF NOT EXISTS "adjusts_month_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_month_costs_adjusts_month_fk'
  ) THEN
    ALTER TABLE "employee_month_costs"
      ADD CONSTRAINT "employee_month_costs_adjusts_month_fk"
      FOREIGN KEY ("adjusts_month_id")
      REFERENCES "employee_month_costs" ("id")
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.employee_month_costs_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('applied', 'closed') AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'employee_month_costs_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- Trigger-driven displacement / system updates may proceed.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('applied', 'closed') THEN
    IF NEW.status = OLD.status THEN
      IF NEW.known_amount IS DISTINCT FROM OLD.known_amount
        OR NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount
        OR NEW.actual_amount IS DISTINCT FROM OLD.actual_amount
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.year_month IS DISTINCT FROM OLD.year_month
        OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.known_quality IS DISTINCT FROM OLD.known_quality
        OR NEW.recognition_source IS DISTINCT FROM OLD.recognition_source
        OR NEW.adjusts_month_id IS DISTINCT FROM OLD.adjusts_month_id
      THEN
        RAISE EXCEPTION 'employee_month_costs_immutable'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NOT (
      (OLD.status = 'applied' AND NEW.status = 'superseded')
      OR (OLD.status = 'closed' AND NEW.status = 'superseded')
    ) THEN
      RAISE EXCEPTION 'employee_month_costs_applied_transition'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'employee_month_costs_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_month_costs_immutability_guard ON public.employee_month_costs;
CREATE TRIGGER employee_month_costs_immutability_guard
  BEFORE UPDATE OR DELETE ON public.employee_month_costs
  FOR EACH ROW
  EXECUTE FUNCTION app.employee_month_costs_immutability_guard();

--------------------------------------------------------------------------------
-- B) year_month real calendar + known_quality/amount coherence
--------------------------------------------------------------------------------

ALTER TABLE "employee_month_costs"
  DROP CONSTRAINT IF EXISTS "employee_month_costs_year_month_shape";
ALTER TABLE "employee_month_costs"
  ADD CONSTRAINT "employee_month_costs_year_month_shape"
  CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "employee_month_costs"
  DROP CONSTRAINT IF EXISTS "employee_month_costs_quality_amount_coherent";
ALTER TABLE "employee_month_costs"
  ADD CONSTRAINT "employee_month_costs_quality_amount_coherent"
  CHECK (
    (
      "known_quality" = 'estimated'
      AND ("estimated_amount" IS NULL OR "estimated_amount" = "known_amount")
    )
    OR (
      "known_quality" = 'actual'
      AND "actual_amount" IS NOT NULL
      AND "actual_amount" = "known_amount"
    )
  );

--------------------------------------------------------------------------------
-- C) Currency chain: month = run = lines; vendor alloc = bill
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.labor_allocation_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  month_currency char(3);
  run_currency char(3);
BEGIN
  IF TG_TABLE_NAME = 'labor_allocation_runs' THEN
    SELECT m.currency INTO month_currency
    FROM public.employee_month_costs m
    WHERE m.id = NEW.employee_month_cost_id
      AND m.organization_id = NEW.organization_id;

    IF month_currency IS NULL THEN
      RAISE EXCEPTION 'labor_allocation_runs_month_missing'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.currency IS DISTINCT FROM month_currency THEN
      RAISE EXCEPTION 'labor_allocation_currency_mismatch'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT r.currency INTO run_currency
  FROM public.labor_allocation_runs r
  WHERE r.id = NEW.labor_allocation_run_id
    AND r.organization_id = NEW.organization_id;

  IF run_currency IS NULL THEN
    RAISE EXCEPTION 'labor_allocation_run_lines_run_missing'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.currency IS DISTINCT FROM run_currency THEN
    RAISE EXCEPTION 'labor_allocation_currency_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_currency_guard ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_currency_guard
  BEFORE INSERT OR UPDATE OF currency, employee_month_cost_id, organization_id
  ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_currency_guard();

DROP TRIGGER IF EXISTS labor_allocation_run_lines_currency_guard ON public.labor_allocation_run_lines;
CREATE TRIGGER labor_allocation_run_lines_currency_guard
  BEFORE INSERT OR UPDATE OF currency, labor_allocation_run_id, organization_id
  ON public.labor_allocation_run_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_currency_guard();

--------------------------------------------------------------------------------
-- D) Labor line field ranges (amount>0 already in 0021; conservation already)
--------------------------------------------------------------------------------

ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_percent_range";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_percent_range"
  CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100));

ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_hours_non_negative";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_hours_non_negative"
  CHECK ("basis_hours" IS NULL OR "basis_hours" >= 0);

ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_days_non_negative";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_days_non_negative"
  CHECK ("basis_days" IS NULL OR "basis_days" >= 0);

--------------------------------------------------------------------------------
-- E/F/G) Vendor alloc lifecycle + NET cap + transaction-safe concurrency
--------------------------------------------------------------------------------

ALTER TABLE "ap_bill_project_allocations"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "supersedes_allocation_id" uuid,
  ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bill_project_allocations_status_known'
  ) THEN
    ALTER TABLE "ap_bill_project_allocations"
      ADD CONSTRAINT "ap_bill_project_allocations_status_known"
      CHECK ("status" IN ('draft', 'applied', 'superseded'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bill_project_allocations_supersedes_fk'
  ) THEN
    ALTER TABLE "ap_bill_project_allocations"
      ADD CONSTRAINT "ap_bill_project_allocations_supersedes_fk"
      FOREIGN KEY ("supersedes_allocation_id")
      REFERENCES "ap_bill_project_allocations" ("id")
      ON DELETE RESTRICT;
  END IF;
END $$;

DROP INDEX IF EXISTS "ap_bill_project_allocations_bill_project_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "ap_bill_project_allocations_bill_project_active_uq"
  ON "ap_bill_project_allocations" ("ap_bill_id", "project_id")
  WHERE "target_type" = 'project'
    AND "project_id" IS NOT NULL
    AND "status" IN ('draft', 'applied');

CREATE OR REPLACE FUNCTION app.ap_bill_project_allocations_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bill_total numeric(18, 6);
  bill_currency char(3);
  bill_status text;
  active_sum numeric(18, 6);
  row_amount numeric(18, 6);
  row_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('applied', 'superseded') AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'ap_bill_project_allocations_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'superseded' THEN
      RAISE EXCEPTION 'ap_bill_project_allocations_immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'applied' AND NEW.status = 'applied' THEN
      IF NEW.amount IS DISTINCT FROM OLD.amount
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.target_type IS DISTINCT FROM OLD.target_type
        OR NEW.method IS DISTINCT FROM OLD.method
        OR NEW.percent IS DISTINCT FROM OLD.percent
        OR NEW.basis_days IS DISTINCT FROM OLD.basis_days
        OR NEW.basis_value IS DISTINCT FROM OLD.basis_value
      THEN
        RAISE EXCEPTION 'ap_bill_project_allocations_immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF OLD.status = 'applied' AND NEW.status NOT IN ('applied', 'superseded') THEN
      RAISE EXCEPTION 'ap_bill_project_allocations_applied_transition'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Serialize allocators per bill (payment applications pattern).
  PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text || ':ap_bill:' || NEW.ap_bill_id::text));

  SELECT b.total_amount, b.currency, b.status
    INTO bill_total, bill_currency, bill_status
  FROM public.ap_bills b
  WHERE b.id = NEW.ap_bill_id
    AND b.organization_id = NEW.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_bill_project_allocations_bill_missing'
      USING ERRCODE = '23503';
  END IF;

  IF bill_status = 'void' AND NEW.status IN ('draft', 'applied') THEN
    RAISE EXCEPTION 'ap_bill_project_allocations_void_bill'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.currency IS DISTINCT FROM bill_currency THEN
    RAISE EXCEPTION 'ap_bill_project_allocations_currency_mismatch'
      USING ERRCODE = '23514';
  END IF;

  -- Applied rows only allowed on recognized bill statuses (NET authority).
  IF NEW.status = 'applied'
     AND bill_status NOT IN ('open', 'partially_matched', 'matched') THEN
    RAISE EXCEPTION 'ap_bill_project_allocations_bill_not_recognized'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'applied' AND NEW.applied_at IS NULL THEN
    NEW.applied_at := now();
  END IF;

  row_amount := NEW.amount;
  row_status := NEW.status;

  IF row_status IN ('draft', 'applied') THEN
    SELECT COALESCE(SUM(a.amount), 0) INTO active_sum
    FROM public.ap_bill_project_allocations a
    WHERE a.ap_bill_id = NEW.ap_bill_id
      AND a.organization_id = NEW.organization_id
      AND a.status IN ('draft', 'applied')
      AND a.id IS DISTINCT FROM NEW.id;

    -- Cap vs bill NET total_amount — NEVER vs payments.
    IF active_sum + row_amount > bill_total THEN
      RAISE EXCEPTION 'ap_bill_project_allocations_over_bill_net'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_bill_project_allocations_guard ON public.ap_bill_project_allocations;
CREATE TRIGGER ap_bill_project_allocations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_bill_project_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_bill_project_allocations_guard();

ALTER TABLE "ap_bill_project_allocations"
  DROP CONSTRAINT IF EXISTS "ap_bill_project_allocations_percent_range";
ALTER TABLE "ap_bill_project_allocations"
  ADD CONSTRAINT "ap_bill_project_allocations_percent_range"
  CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100));

--------------------------------------------------------------------------------
-- H) Assignment overlap: advisory lock + exclusion when btree_gist exists
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.employee_project_assignments_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Concurrency-safe critical section per employee+project (works without gist).
  PERFORM pg_advisory_xact_lock(
    hashtext(
      NEW.organization_id::text || ':' || NEW.employee_id::text || ':' || NEW.project_id::text
    )
  );

  SELECT a.id INTO conflict_id
  FROM public.employee_project_assignments a
  WHERE a.organization_id = NEW.organization_id
    AND a.employee_id = NEW.employee_id
    AND a.project_id = NEW.project_id
    AND a.status <> 'cancelled'
    AND a.id IS DISTINCT FROM NEW.id
    AND daterange(a.start_date, COALESCE(a.end_date, 'infinity'::date), '[]')
      && daterange(NEW.start_date, COALESCE(NEW.end_date, 'infinity'::date), '[]')
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'employee_project_assignments_overlap'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_project_assignments_no_overlap ON public.employee_project_assignments;
CREATE TRIGGER employee_project_assignments_no_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, status, employee_id, project_id, organization_id
  ON public.employee_project_assignments
  FOR EACH ROW
  EXECUTE FUNCTION app.employee_project_assignments_no_overlap();

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'btree_gist unavailable (%) — exclusion constraint skipped; advisory+trigger enforce overlap',
        SQLERRM;
      RETURN;
  END;

  ALTER TABLE public.employee_project_assignments
    DROP CONSTRAINT IF EXISTS employee_project_assignments_no_overlap_excl;

  ALTER TABLE public.employee_project_assignments
    ADD CONSTRAINT employee_project_assignments_no_overlap_excl
    EXCLUDE USING gist (
      organization_id WITH =,
      employee_id WITH =,
      project_id WITH =,
      daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]') WITH &&
    )
    WHERE (status <> 'cancelled');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'assignment exclusion constraint not created (%) — advisory+trigger remain',
      SQLERRM;
END $$;

--------------------------------------------------------------------------------
-- I) Contact UPDATE integrity — cannot move client/org leaving invalid pointers
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.client_contacts_project_pointer_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bad_project uuid;
BEGIN
  IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO bad_project
  FROM public.projects p
  WHERE p.primary_contact_id = NEW.id
    AND (
      p.client_id IS DISTINCT FROM NEW.client_id
      OR p.organization_id IS DISTINCT FROM NEW.organization_id
    )
  LIMIT 1;

  IF bad_project IS NOT NULL THEN
    RAISE EXCEPTION 'client_contacts_would_invalidate_project_pointer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_contacts_project_pointer_guard ON public.client_contacts;
CREATE TRIGGER client_contacts_project_pointer_guard
  BEFORE UPDATE OF client_id, organization_id
  ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION app.client_contacts_project_pointer_guard();
