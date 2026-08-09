-- Allocation run integrity hardening (post 0014–0017).
-- Does NOT alter 0014–0017. Adds:
--   1) Composite tenant FKs (run/expense/project org must match)
--   2) At most one draft|applied run per expense + economic slice
--   3) At most one line per (run, project)
--   4) Applied/superseded snapshot immutability (status→superseded only)
--   5) Periodic field consistency CHECK

--------------------------------------------------------------------------------
-- Tenant identity anchors for composite FKs
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "expenses_id_organization_id_uq"
  ON "expenses" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "projects_id_organization_id_uq"
  ON "projects" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "allocation_runs_id_organization_id_uq"
  ON "allocation_runs" ("id", "organization_id");

--------------------------------------------------------------------------------
-- Relational tenant consistency
--------------------------------------------------------------------------------

ALTER TABLE "allocation_runs"
  DROP CONSTRAINT IF EXISTS "allocation_runs_expense_org_fk";

ALTER TABLE "allocation_runs"
  ADD CONSTRAINT "allocation_runs_expense_org_fk"
  FOREIGN KEY ("expense_id", "organization_id")
  REFERENCES "expenses" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "allocation_run_lines_run_org_fk";

ALTER TABLE "allocation_run_lines"
  ADD CONSTRAINT "allocation_run_lines_run_org_fk"
  FOREIGN KEY ("run_id", "organization_id")
  REFERENCES "allocation_runs" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "allocation_run_lines_project_org_fk";

ALTER TABLE "allocation_run_lines"
  ADD CONSTRAINT "allocation_run_lines_project_org_fk"
  FOREIGN KEY ("project_id", "organization_id")
  REFERENCES "projects" ("id", "organization_id")
  ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- No double-allocation: one active (draft|applied) run per expense slice
-- COALESCE(slice_index, -1) covers legacy one_time rows with null slice_index.
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "allocation_runs_expense_slice_active_uq"
  ON "allocation_runs" ("expense_id", (COALESCE("slice_index", -1)))
  WHERE "status" IN ('draft', 'applied');

--------------------------------------------------------------------------------
-- One project line per run
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "allocation_run_lines_run_project_uq"
  ON "allocation_run_lines" ("run_id", "project_id");

--------------------------------------------------------------------------------
-- Periodic metadata validity when schedule_mode is set
--------------------------------------------------------------------------------

ALTER TABLE "allocation_runs"
  DROP CONSTRAINT IF EXISTS "allocation_runs_periodic_fields_consistent";

ALTER TABLE "allocation_runs"
  ADD CONSTRAINT "allocation_runs_periodic_fields_consistent" CHECK (
    "schedule_mode" IS NULL
    OR (
      "slice_index" IS NOT NULL
      AND "slice_index" >= 0
      AND "source_period_start" IS NOT NULL
      AND "source_period_end" IS NOT NULL
      AND "source_period_start" <= "source_period_end"
      AND "period_start" >= "source_period_start"
      AND "period_end" <= "source_period_end"
    )
  );

--------------------------------------------------------------------------------
-- Immutability guards
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.allocation_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Allow FK cascade from parent expense (depth > 1); block direct deletes.
    IF OLD.status IN ('applied', 'superseded') AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'allocation_runs: applied/superseded rows cannot be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'allocation_runs: superseded rows are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status = 'applied' THEN
    IF NEW.status IS DISTINCT FROM 'superseded' THEN
      RAISE EXCEPTION 'allocation_runs: applied rows may only transition to superseded'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.expense_id IS DISTINCT FROM OLD.expense_id
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.source_net_amount IS DISTINCT FROM OLD.source_net_amount
       OR NEW.allocatable_net_amount IS DISTINCT FROM OLD.allocatable_net_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.amount_basis IS DISTINCT FROM OLD.amount_basis
       OR NEW.explanation IS DISTINCT FROM OLD.explanation
       OR NEW.run_at IS DISTINCT FROM OLD.run_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.schedule_mode IS DISTINCT FROM OLD.schedule_mode
       OR NEW.slice_index IS DISTINCT FROM OLD.slice_index
       OR NEW.source_period_start IS DISTINCT FROM OLD.source_period_start
       OR NEW.source_period_end IS DISTINCT FROM OLD.source_period_end
    THEN
      RAISE EXCEPTION 'allocation_runs: applied snapshot columns are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_runs_guard ON public.allocation_runs;
CREATE TRIGGER allocation_runs_guard
  BEFORE UPDATE OR DELETE ON public.allocation_runs
  FOR EACH ROW EXECUTE FUNCTION app.allocation_runs_guard();

CREATE OR REPLACE FUNCTION app.allocation_run_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_status public.allocation_run_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO run_status FROM public.allocation_runs WHERE id = NEW.run_id;
    IF run_status IN ('applied', 'superseded') THEN
      RAISE EXCEPTION 'allocation_run_lines: cannot add lines to applied/superseded runs'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT status INTO run_status FROM public.allocation_runs WHERE id = OLD.run_id;
    IF FOUND AND run_status IN ('applied', 'superseded') AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'allocation_run_lines: cannot delete lines of applied/superseded runs'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO run_status FROM public.allocation_runs WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  IF run_status IN ('applied', 'superseded') THEN
    RAISE EXCEPTION 'allocation_run_lines: lines of applied/superseded runs are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_run_lines_guard ON public.allocation_run_lines;
CREATE TRIGGER allocation_run_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.allocation_run_lines
  FOR EACH ROW EXECUTE FUNCTION app.allocation_run_lines_guard();
