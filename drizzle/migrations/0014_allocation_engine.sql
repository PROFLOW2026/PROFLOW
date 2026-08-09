-- Wave 2 Agent 1: automatic shared / overhead allocation engine.
-- Extends allocation methods, period fields, category policy, and run snapshots
-- so historical allocations stay frozen when contracts/hours later change.

--------------------------------------------------------------------------------
-- Enum extensions
--------------------------------------------------------------------------------

ALTER TYPE "public"."allocation_method" ADD VALUE IF NOT EXISTS 'contract_weight';
ALTER TYPE "public"."allocation_method" ADD VALUE IF NOT EXISTS 'labor_hours_weight';
ALTER TYPE "public"."allocation_method" ADD VALUE IF NOT EXISTS 'direct_cost_weight';
ALTER TYPE "public"."allocation_method" ADD VALUE IF NOT EXISTS 'equal_split';

DO $$ BEGIN
  CREATE TYPE "public"."allocation_run_status" AS ENUM('draft', 'applied', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--------------------------------------------------------------------------------
-- Expense period + driver
--------------------------------------------------------------------------------

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "allocation_period_start" date,
  ADD COLUMN IF NOT EXISTS "allocation_period_end" date,
  ADD COLUMN IF NOT EXISTS "allocation_driver_method" "allocation_method";

ALTER TABLE "expenses"
  DROP CONSTRAINT IF EXISTS "expenses_allocation_period_order";

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_allocation_period_order" CHECK (
    "allocation_period_start" IS NULL
    OR "allocation_period_end" IS NULL
    OR "allocation_period_start" <= "allocation_period_end"
  );

--------------------------------------------------------------------------------
-- Category default allocation policy (configurable — not hardcoded examples)
--------------------------------------------------------------------------------

ALTER TABLE "cost_categories"
  ADD COLUMN IF NOT EXISTS "default_allocation_method" "allocation_method";

--------------------------------------------------------------------------------
-- Allocation line amount basis (gross = legacy manual; net = auto engine)
--------------------------------------------------------------------------------

ALTER TABLE "expense_allocations"
  ADD COLUMN IF NOT EXISTS "amount_basis" text DEFAULT 'gross' NOT NULL;

ALTER TABLE "expense_allocations"
  DROP CONSTRAINT IF EXISTS "expense_allocations_amount_basis_known";

ALTER TABLE "expense_allocations"
  ADD CONSTRAINT "expense_allocations_amount_basis_known" CHECK (
    "amount_basis" IN ('gross', 'net')
  );

ALTER TABLE "expense_allocations"
  DROP CONSTRAINT IF EXISTS "expense_allocations_percent_method";

ALTER TABLE "expense_allocations"
  ADD CONSTRAINT "expense_allocations_percent_method" CHECK (
    "method" = 'manual_amount' OR "percent" IS NOT NULL
  );

--------------------------------------------------------------------------------
-- Allocation runs / snapshots (history)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "allocation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "expense_id" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
  "method" "allocation_method" NOT NULL,
  "status" "allocation_run_status" DEFAULT 'draft' NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "source_net_amount" numeric(18, 6) NOT NULL,
  "allocatable_net_amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "amount_basis" text DEFAULT 'net' NOT NULL,
  "explanation" jsonb NOT NULL,
  "run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "allocation_runs_period_order" CHECK ("period_start" <= "period_end"),
  CONSTRAINT "allocation_runs_amount_basis_known" CHECK ("amount_basis" IN ('gross', 'net'))
);

CREATE INDEX IF NOT EXISTS "allocation_runs_expense_idx" ON "allocation_runs" ("expense_id");
CREATE INDEX IF NOT EXISTS "allocation_runs_org_idx" ON "allocation_runs" ("organization_id");
CREATE INDEX IF NOT EXISTS "allocation_runs_org_status_idx" ON "allocation_runs" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "allocation_run_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "allocation_runs"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "basis_value" numeric(18, 6) NOT NULL,
  "basis_unit" text NOT NULL,
  "weight_percent" numeric(9, 4) NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "explanation" jsonb,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "allocation_run_lines_basis_unit_known" CHECK (
    "basis_unit" IN ('money', 'hours', 'count')
  )
);

CREATE INDEX IF NOT EXISTS "allocation_run_lines_run_idx" ON "allocation_run_lines" ("run_id");
CREATE INDEX IF NOT EXISTS "allocation_run_lines_project_idx" ON "allocation_run_lines" ("project_id");
CREATE INDEX IF NOT EXISTS "allocation_run_lines_org_idx" ON "allocation_run_lines" ("organization_id");

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'allocation_runs',
    'allocation_run_lines'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_select', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_update', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_delete', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_service_all', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_select', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_update', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_delete', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tenant_table || '_service_all', tenant_table);
  END LOOP;
END $$;
