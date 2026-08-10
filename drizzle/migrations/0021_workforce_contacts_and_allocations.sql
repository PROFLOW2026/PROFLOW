-- 0021_workforce_contacts_and_allocations
-- Additive only. Does NOT edit 0000–0020.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.
--
-- Includes:
--   1) Project-specific contact (SAFE single-column FK — never composite SET NULL)
--   2) Temporal employee_project_assignments (replaces static project_team_members)
--   3) Compensation extensions on rate_versions + employee_month_costs
--   4) Labor monthly allocation runs/lines (Displacement model vs time snapshots)
--   5) ap_bill_project_allocations (slice recognized bill Actual; payment ≠ Actual)
--
-- Assignment ≠ Actual. Payment ≠ Actual. Optional advanced modules stay optional.

--------------------------------------------------------------------------------
-- Tenant identity anchors
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "client_contacts_id_organization_id_uq"
  ON "client_contacts" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "employees_id_organization_id_uq"
  ON "employees" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "projects_id_organization_id_uq"
  ON "projects" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ap_bills_id_organization_id_uq"
  ON "ap_bills" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "rate_versions_id_organization_id_uq"
  ON "rate_versions" ("id", "organization_id");

--------------------------------------------------------------------------------
-- 1) Project-specific contact (SAFE deletion)
-- Do NOT use composite (primary_contact_id, organization_id) ON DELETE SET NULL —
-- PostgreSQL would attempt to null ALL FK columns including organization_id.
--------------------------------------------------------------------------------

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "primary_contact_id" uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_primary_contact_org_fk'
  ) THEN
    ALTER TABLE "projects" DROP CONSTRAINT "projects_primary_contact_org_fk";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_primary_contact_id_fk'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_primary_contact_id_fk"
      FOREIGN KEY ("primary_contact_id")
      REFERENCES "client_contacts" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "projects_primary_contact_idx"
  ON "projects" ("primary_contact_id")
  WHERE "primary_contact_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION app.projects_primary_contact_client_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contact_client uuid;
  contact_org uuid;
BEGIN
  IF NEW.primary_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'projects_primary_contact_requires_client'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.client_id, c.organization_id INTO contact_client, contact_org
  FROM public.client_contacts c
  WHERE c.id = NEW.primary_contact_id;

  IF contact_client IS NULL THEN
    RAISE EXCEPTION 'projects_primary_contact_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF contact_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'projects_primary_contact_org_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF contact_client IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'projects_primary_contact_client_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_primary_contact_client_guard ON public.projects;
CREATE TRIGGER projects_primary_contact_client_guard
  BEFORE INSERT OR UPDATE OF primary_contact_id, client_id, organization_id
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION app.projects_primary_contact_client_guard();

-- Belt-and-suspenders: clear only the contact pointer when a contact is deleted
-- (FK already SET NULL on primary_contact_id alone).
CREATE OR REPLACE FUNCTION app.client_contacts_clear_project_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.projects
  SET primary_contact_id = NULL
  WHERE primary_contact_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS client_contacts_clear_project_refs ON public.client_contacts;
CREATE TRIGGER client_contacts_clear_project_refs
  BEFORE DELETE ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION app.client_contacts_clear_project_refs();

--------------------------------------------------------------------------------
-- 2) Temporal employee ↔ project assignments (≠ Actual)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "employee_project_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "role" text,
  "planned_allocation_percent" numeric(9, 6),
  "notes" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_project_assignments_range_valid"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "employee_project_assignments_status_known"
    CHECK ("status" IN ('active', 'completed', 'cancelled')),
  CONSTRAINT "employee_project_assignments_plan_pct_range"
    CHECK (
      "planned_allocation_percent" IS NULL
      OR ("planned_allocation_percent" >= 0 AND "planned_allocation_percent" <= 100)
    ),
  CONSTRAINT "employee_project_assignments_project_org_fk"
    FOREIGN KEY ("project_id", "organization_id")
    REFERENCES "projects" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "employee_project_assignments_employee_org_fk"
    FOREIGN KEY ("employee_id", "organization_id")
    REFERENCES "employees" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignments_id_organization_id_uq"
  ON "employee_project_assignments" ("id", "organization_id");
CREATE INDEX IF NOT EXISTS "employee_project_assignments_org_idx"
  ON "employee_project_assignments" ("organization_id");
CREATE INDEX IF NOT EXISTS "employee_project_assignments_project_idx"
  ON "employee_project_assignments" ("project_id");
CREATE INDEX IF NOT EXISTS "employee_project_assignments_employee_idx"
  ON "employee_project_assignments" ("employee_id");
CREATE INDEX IF NOT EXISTS "employee_project_assignments_org_project_start_idx"
  ON "employee_project_assignments" ("organization_id", "project_id", "start_date");
CREATE INDEX IF NOT EXISTS "employee_project_assignments_org_employee_start_idx"
  ON "employee_project_assignments" ("organization_id", "employee_id", "start_date");

-- Non-cancelled spans for same employee+project must not overlap (concurrent
-- different projects remain allowed). Advisory lock for race safety; optional
-- gist exclusion when btree_gist is available.
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
      RAISE NOTICE 'btree_gist unavailable (%) — exclusion skipped; advisory+trigger enforce overlap',
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
-- 3) Compensation extensions (employer cost — not payroll net)
--------------------------------------------------------------------------------

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "employment_basis" text,
  ADD COLUMN IF NOT EXISTS "hire_date" date,
  ADD COLUMN IF NOT EXISTS "end_date" date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_basis_known'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_employment_basis_known"
      CHECK (
        "employment_basis" IS NULL
        OR "employment_basis" IN ('hourly', 'daily', 'monthly')
      );
  END IF;
END $$;

ALTER TABLE "rate_versions"
  ADD COLUMN IF NOT EXISTS "estimated_employer_cost" numeric(18, 6),
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL,
  ADD COLUMN IF NOT EXISTS "cost_quality" text DEFAULT 'estimated' NOT NULL,
  ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rate_versions_source_known'
  ) THEN
    ALTER TABLE "rate_versions"
      ADD CONSTRAINT "rate_versions_source_known"
      CHECK ("source" IN ('manual', 'import', 'adjustment', 'system_derived'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rate_versions_cost_quality_known'
  ) THEN
    ALTER TABLE "rate_versions"
      ADD CONSTRAINT "rate_versions_cost_quality_known"
      CHECK ("cost_quality" IN ('estimated', 'actual', 'mixed'));
  END IF;
END $$;

-- Calendar-month employer cost facts (optional advanced). Creating a row ≠ Actual.
-- Recognition into project Actual happens only via applied labor allocation (Displacement).
CREATE TABLE IF NOT EXISTS "employee_month_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL,
  "year_month" char(7) NOT NULL,
  "currency" char(3) NOT NULL,
  "estimated_amount" numeric(18, 6),
  "actual_amount" numeric(18, 6),
  "known_amount" numeric(18, 6) NOT NULL,
  "known_quality" text DEFAULT 'estimated' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "recognition_source" text DEFAULT 'time_snapshot' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "notes" text,
  "locked_at" timestamp with time zone,
  "adjusts_month_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_month_costs_year_month_shape"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "employee_month_costs_known_quality_known"
    CHECK ("known_quality" IN ('estimated', 'actual')),
  CONSTRAINT "employee_month_costs_source_known"
    CHECK ("source" IN ('manual', 'import', 'compensation_derived', 'adjustment')),
  CONSTRAINT "employee_month_costs_recognition_known"
    CHECK ("recognition_source" IN ('time_snapshot', 'monthly_allocated')),
  CONSTRAINT "employee_month_costs_status_known"
    CHECK ("status" IN ('draft', 'applied', 'closed', 'superseded')),
  CONSTRAINT "employee_month_costs_known_non_negative"
    CHECK ("known_amount" >= 0),
  CONSTRAINT "employee_month_costs_quality_amount_coherent"
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
    ),
  CONSTRAINT "employee_month_costs_employee_org_fk"
    FOREIGN KEY ("employee_id", "organization_id")
    REFERENCES "employees" ("id", "organization_id")
    ON DELETE CASCADE
);

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

-- One active month fact per employee-month; superseded rows may coexist for audit.
CREATE UNIQUE INDEX IF NOT EXISTS "employee_month_costs_active_org_employee_month_uq"
  ON "employee_month_costs" ("organization_id", "employee_id", "year_month")
  WHERE "status" IN ('draft', 'applied', 'closed');

CREATE UNIQUE INDEX IF NOT EXISTS "employee_month_costs_id_organization_id_uq"
  ON "employee_month_costs" ("id", "organization_id");
CREATE INDEX IF NOT EXISTS "employee_month_costs_org_month_idx"
  ON "employee_month_costs" ("organization_id", "year_month");

--------------------------------------------------------------------------------
-- 4) Labor monthly allocation (one economic cost; unallocated always visible)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "labor_allocation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "employee_month_cost_id" uuid NOT NULL,
  "method" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "currency" char(3) NOT NULL,
  "allocated_amount" numeric(18, 6) NOT NULL DEFAULT 0,
  "unallocated_amount" numeric(18, 6) NOT NULL DEFAULT 0,
  "explanation" text,
  "supersedes_run_id" uuid,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "labor_allocation_runs_method_known"
    CHECK ("method" IN ('hours', 'days', 'percent', 'fixed_amount', 'manual_override')),
  CONSTRAINT "labor_allocation_runs_status_known"
    CHECK ("status" IN ('draft', 'applied', 'superseded')),
  CONSTRAINT "labor_allocation_runs_amounts_non_negative"
    CHECK ("allocated_amount" >= 0 AND "unallocated_amount" >= 0),
  CONSTRAINT "labor_allocation_runs_month_org_fk"
    FOREIGN KEY ("employee_month_cost_id", "organization_id")
    REFERENCES "employee_month_costs" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "labor_allocation_runs_id_organization_id_uq"
  ON "labor_allocation_runs" ("id", "organization_id");
CREATE INDEX IF NOT EXISTS "labor_allocation_runs_month_idx"
  ON "labor_allocation_runs" ("employee_month_cost_id");

-- At most one applied run per employee-month.
CREATE UNIQUE INDEX IF NOT EXISTS "labor_allocation_runs_one_applied_per_month_uq"
  ON "labor_allocation_runs" ("employee_month_cost_id")
  WHERE "status" = 'applied';

CREATE TABLE IF NOT EXISTS "labor_allocation_run_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "labor_allocation_run_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "percent" numeric(9, 6),
  "basis_hours" numeric(18, 6),
  "basis_days" numeric(12, 4),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "labor_allocation_run_lines_amount_positive"
    CHECK ("amount" > 0),
  CONSTRAINT "labor_allocation_run_lines_percent_range"
    CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100)),
  CONSTRAINT "labor_allocation_run_lines_hours_non_negative"
    CHECK ("basis_hours" IS NULL OR "basis_hours" >= 0),
  CONSTRAINT "labor_allocation_run_lines_days_non_negative"
    CHECK ("basis_days" IS NULL OR "basis_days" >= 0),
  CONSTRAINT "labor_allocation_run_lines_run_org_fk"
    FOREIGN KEY ("labor_allocation_run_id", "organization_id")
    REFERENCES "labor_allocation_runs" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "labor_allocation_run_lines_project_org_fk"
    FOREIGN KEY ("project_id", "organization_id")
    REFERENCES "projects" ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "labor_allocation_run_lines_id_organization_id_uq"
  ON "labor_allocation_run_lines" ("id", "organization_id");
CREATE INDEX IF NOT EXISTS "labor_allocation_run_lines_run_idx"
  ON "labor_allocation_run_lines" ("labor_allocation_run_id");
CREATE INDEX IF NOT EXISTS "labor_allocation_run_lines_project_idx"
  ON "labor_allocation_run_lines" ("project_id");

CREATE OR REPLACE FUNCTION app.labor_allocation_runs_conservation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  known numeric(18, 6);
  line_sum numeric(18, 6);
BEGIN
  IF NEW.status <> 'applied' THEN
    RETURN NEW;
  END IF;

  SELECT m.known_amount INTO known
  FROM public.employee_month_costs m
  WHERE m.id = NEW.employee_month_cost_id
    AND m.organization_id = NEW.organization_id;

  IF known IS NULL THEN
    RAISE EXCEPTION 'labor_allocation_runs_month_missing'
      USING ERRCODE = '23503';
  END IF;

  IF (NEW.allocated_amount + NEW.unallocated_amount) <> known THEN
    RAISE EXCEPTION 'labor_allocation_runs_conservation_failed'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(l.amount), 0) INTO line_sum
  FROM public.labor_allocation_run_lines l
  WHERE l.labor_allocation_run_id = NEW.id
    AND l.organization_id = NEW.organization_id;

  IF line_sum <> NEW.allocated_amount THEN
    RAISE EXCEPTION 'labor_allocation_runs_lines_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_conservation_guard ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_conservation_guard
  BEFORE INSERT OR UPDATE OF status, allocated_amount, unallocated_amount, employee_month_cost_id
  ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_runs_conservation_guard();

-- Displacement: applying a run flips the month to MONTHLY_ALLOCATED atomically.
CREATE OR REPLACE FUNCTION app.labor_allocation_runs_displacement_apply()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'applied' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'applied') THEN
    UPDATE public.employee_month_costs
    SET
      recognition_source = 'monthly_allocated',
      status = CASE
        WHEN status = 'closed' THEN 'closed'
        ELSE 'applied'
      END,
      updated_at = now()
    WHERE id = NEW.employee_month_cost_id
      AND organization_id = NEW.organization_id;
  END IF;

  IF NEW.status = 'superseded' AND OLD.status = 'applied' THEN
    -- Closed months must be superseded at month level first (avoid closed+time_snapshot).
    IF EXISTS (
      SELECT 1 FROM public.employee_month_costs m
      WHERE m.id = NEW.employee_month_cost_id
        AND m.organization_id = NEW.organization_id
        AND m.status = 'closed'
    ) THEN
      RAISE EXCEPTION 'labor_allocation_runs_month_closed'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.employee_month_costs
    SET
      recognition_source = 'time_snapshot',
      status = 'draft',
      updated_at = now()
    WHERE id = NEW.employee_month_cost_id
      AND organization_id = NEW.organization_id
      AND recognition_source = 'monthly_allocated';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_displacement_apply ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_displacement_apply
  AFTER INSERT OR UPDATE OF status
  ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_runs_displacement_apply();

-- Applied/closed months must use monthly_allocated recognition.
ALTER TABLE "employee_month_costs"
  DROP CONSTRAINT IF EXISTS "employee_month_costs_displacement_coupling";
ALTER TABLE "employee_month_costs"
  ADD CONSTRAINT "employee_month_costs_displacement_coupling"
  CHECK (
    ("status" NOT IN ('applied', 'closed'))
    OR ("recognition_source" = 'monthly_allocated')
  );

-- One project line per run.
CREATE UNIQUE INDEX IF NOT EXISTS "labor_allocation_run_lines_run_project_uq"
  ON "labor_allocation_run_lines" ("labor_allocation_run_id", "project_id");

-- One active (draft|applied) run per month (0018-style).
CREATE UNIQUE INDEX IF NOT EXISTS "labor_allocation_runs_one_active_per_month_uq"
  ON "labor_allocation_runs" ("employee_month_cost_id")
  WHERE "status" IN ('draft', 'applied');

-- Applied labor runs/lines are immutable (mutate via supersede).
CREATE OR REPLACE FUNCTION app.labor_allocation_runs_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('applied', 'superseded') THEN
      RAISE EXCEPTION 'labor_allocation_runs_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'applied' AND NEW.status = 'applied' THEN
    IF NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
      OR NEW.unallocated_amount IS DISTINCT FROM OLD.unallocated_amount
      OR NEW.method IS DISTINCT FROM OLD.method
      OR NEW.employee_month_cost_id IS DISTINCT FROM OLD.employee_month_cost_id
      OR NEW.currency IS DISTINCT FROM OLD.currency
    THEN
      RAISE EXCEPTION 'labor_allocation_runs_immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'applied' AND NEW.status NOT IN ('applied', 'superseded') THEN
    RAISE EXCEPTION 'labor_allocation_runs_applied_transition'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'labor_allocation_runs_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_immutability_guard ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_immutability_guard
  BEFORE UPDATE OR DELETE ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_runs_immutability_guard();

CREATE OR REPLACE FUNCTION app.labor_allocation_run_lines_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_status text;
BEGIN
  SELECT r.status INTO run_status
  FROM public.labor_allocation_runs r
  WHERE r.id = COALESCE(NEW.labor_allocation_run_id, OLD.labor_allocation_run_id);

  IF run_status IN ('applied', 'superseded') THEN
    RAISE EXCEPTION 'labor_allocation_run_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_run_lines_immutability_guard ON public.labor_allocation_run_lines;
CREATE TRIGGER labor_allocation_run_lines_immutability_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.labor_allocation_run_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_run_lines_immutability_guard();

--------------------------------------------------------------------------------
-- 5) Vendor bill multi-project allocations (slice recognized Actual; payment ≠ Actual)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ap_bill_project_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ap_bill_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "project_id" uuid,
  "method" text NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "percent" numeric(9, 6),
  "basis_days" numeric(12, 4),
  "basis_value" numeric(18, 6),
  "notes" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "supersedes_allocation_id" uuid,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_bill_project_allocations_target_known"
    CHECK ("target_type" IN ('project', 'overhead')),
  CONSTRAINT "ap_bill_project_allocations_target_shape"
    CHECK (
      ("target_type" = 'project' AND "project_id" IS NOT NULL)
      OR ("target_type" = 'overhead' AND "project_id" IS NULL)
    ),
  CONSTRAINT "ap_bill_project_allocations_method_known"
    CHECK ("method" IN ('manual_amount', 'manual_percent', 'active_days', 'equal_split')),
  CONSTRAINT "ap_bill_project_allocations_amount_positive"
    CHECK ("amount" > 0),
  CONSTRAINT "ap_bill_project_allocations_status_known"
    CHECK ("status" IN ('draft', 'applied', 'superseded')),
  CONSTRAINT "ap_bill_project_allocations_percent_range"
    CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100)),
  CONSTRAINT "ap_bill_project_allocations_bill_org_fk"
    FOREIGN KEY ("ap_bill_id", "organization_id")
    REFERENCES "ap_bills" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "ap_bill_project_allocations_project_org_fk"
    FOREIGN KEY ("project_id", "organization_id")
    REFERENCES "projects" ("id", "organization_id")
    ON DELETE RESTRICT
);

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

CREATE UNIQUE INDEX IF NOT EXISTS "ap_bill_project_allocations_id_organization_id_uq"
  ON "ap_bill_project_allocations" ("id", "organization_id");
CREATE INDEX IF NOT EXISTS "ap_bill_project_allocations_bill_idx"
  ON "ap_bill_project_allocations" ("ap_bill_id");
CREATE INDEX IF NOT EXISTS "ap_bill_project_allocations_project_idx"
  ON "ap_bill_project_allocations" ("project_id");
DROP INDEX IF EXISTS "ap_bill_project_allocations_bill_project_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "ap_bill_project_allocations_bill_project_active_uq"
  ON "ap_bill_project_allocations" ("ap_bill_id", "project_id")
  WHERE "target_type" = 'project'
    AND "project_id" IS NOT NULL
    AND "status" IN ('draft', 'applied');

--------------------------------------------------------------------------------
-- Integrity hardening (Agent 1 A–I) — immutability, currency, vendor, contact UPDATE
--------------------------------------------------------------------------------

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
        OR NEW.source IS DISTINCT FROM OLD.source
        OR NEW.recognition_source IS DISTINCT FROM OLD.recognition_source
        OR NEW.adjusts_month_id IS DISTINCT FROM OLD.adjusts_month_id
      THEN
        RAISE EXCEPTION 'employee_month_costs_immutable'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NOT (
      (OLD.status = 'applied' AND NEW.status IN ('closed', 'superseded'))
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

-- Applied/closed + monthly_allocated requires an applied labor run (no orphan Actual).
CREATE OR REPLACE FUNCTION app.employee_month_costs_applied_requires_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('applied', 'closed')
     AND NEW.recognition_source = 'monthly_allocated' THEN
    -- Explicit adjustment/superseding facts may reference a prior month row.
    IF NEW.adjusts_month_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.employee_month_costs prior
         WHERE prior.id = NEW.adjusts_month_id
           AND prior.organization_id = NEW.organization_id
       ) THEN
      RETURN NEW;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.labor_allocation_runs r
      WHERE r.employee_month_cost_id = NEW.id
        AND r.organization_id = NEW.organization_id
        AND r.status = 'applied'
    ) THEN
      RAISE EXCEPTION 'employee_month_costs_applied_requires_run'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_month_costs_applied_requires_run ON public.employee_month_costs;
CREATE TRIGGER employee_month_costs_applied_requires_run
  BEFORE INSERT OR UPDATE OF status, recognition_source
  ON public.employee_month_costs
  FOR EACH ROW
  EXECUTE FUNCTION app.employee_month_costs_applied_requires_run();

-- Harden year_month / coherence if an older draft table shape existed.
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

--------------------------------------------------------------------------------
-- Permissions: employer-cost keys (membership alone must NOT expose compensation)
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('workforce.cost.read', 'workforce', 'View employer cost and compensation history'),
  ('workforce.cost.manage', 'workforce', 'Manage employer cost and compensation history')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Existing orgs: backfill template roles (new orgs also get these via ROLE_TEMPLATES).
INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'workforce.cost.read'),
    ('owner', 'workforce.cost.manage'),
    ('manager', 'workforce.cost.read'),
    ('finance', 'workforce.cost.read'),
    ('finance', 'workforce.cost.manage')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- RLS (permission-aware — NOT membership-only on cost tables)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.has_any_org_permission(org_id uuid, VARIADIC required_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_assignments ra
    INNER JOIN public.role_permissions rp ON rp.role_id = ra.role_id
    WHERE ra.organization_id = org_id
      AND ra.user_id = app.current_user_id()
      AND rp.permission_key = ANY (required_permissions)
  );
$$;

REVOKE ALL ON FUNCTION app.has_any_org_permission(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION app.has_any_org_permission(uuid, text[]) TO authenticated, service_role;

-- Assignments / team roster (not money)
ALTER TABLE public.employee_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_project_assignments_tenant_select ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_insert ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_update ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_delete ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_service_all ON public.employee_project_assignments;

CREATE POLICY employee_project_assignments_tenant_select ON public.employee_project_assignments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['workforce.read', 'projects.read', 'time.manage']::text[]
    )
  );

CREATE POLICY employee_project_assignments_tenant_insert ON public.employee_project_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_tenant_update ON public.employee_project_assignments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_tenant_delete ON public.employee_project_assignments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_service_all ON public.employee_project_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Compensation / employer cost (workforce.cost.*)
DO $$
DECLARE
  cost_table text;
  cost_tables text[] := ARRAY[
    'employee_month_costs',
    'labor_allocation_runs',
    'labor_allocation_run_lines',
    'rate_versions',
    'labor_cost_components'
  ];
BEGIN
  FOREACH cost_table IN ARRAY cost_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cost_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', cost_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cost_table || '_tenant_select', cost_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cost_table || '_tenant_insert', cost_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cost_table || '_tenant_update', cost_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cost_table || '_tenant_delete', cost_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cost_table || '_service_all', cost_table);

    EXECUTE format(
      $policy$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, 'workforce.cost.read')
      )
      $policy$,
      cost_table || '_tenant_select', cost_table);

    EXECUTE format(
      $policy$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, 'workforce.cost.manage')
      )
      $policy$,
      cost_table || '_tenant_insert', cost_table);

    EXECUTE format(
      $policy$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, 'workforce.cost.manage')
      )
      WITH CHECK (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, 'workforce.cost.manage')
      )
      $policy$,
      cost_table || '_tenant_update', cost_table);

    EXECUTE format(
      $policy$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, 'workforce.cost.manage')
      )
      $policy$,
      cost_table || '_tenant_delete', cost_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      cost_table || '_service_all', cost_table);
  END LOOP;
END $$;

-- Vendor bill project allocations (AP)
ALTER TABLE public.ap_bill_project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_bill_project_allocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_select ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_insert ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_update ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_delete ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_service_all ON public.ap_bill_project_allocations;

CREATE POLICY ap_bill_project_allocations_tenant_select ON public.ap_bill_project_allocations
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

CREATE POLICY ap_bill_project_allocations_tenant_insert ON public.ap_bill_project_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_tenant_update ON public.ap_bill_project_allocations
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_tenant_delete ON public.ap_bill_project_allocations
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_service_all ON public.ap_bill_project_allocations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
