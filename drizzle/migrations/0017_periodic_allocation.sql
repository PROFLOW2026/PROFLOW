-- Wave 3 Agent 2: periodic overhead / annual cost proration.
-- Adds schedule mode on expenses and slice metadata on allocation_runs so
-- annual/custom NET can be split into monthly windows with frozen history.

--------------------------------------------------------------------------------
-- Enum
--------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."allocation_schedule_mode" AS ENUM(
    'one_time',
    'monthly',
    'annual',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--------------------------------------------------------------------------------
-- Expense schedule mode
--------------------------------------------------------------------------------

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "allocation_schedule_mode" "allocation_schedule_mode";

--------------------------------------------------------------------------------
-- Allocation run slice metadata
--------------------------------------------------------------------------------

ALTER TABLE "allocation_runs"
  ADD COLUMN IF NOT EXISTS "schedule_mode" "allocation_schedule_mode",
  ADD COLUMN IF NOT EXISTS "slice_index" integer,
  ADD COLUMN IF NOT EXISTS "source_period_start" date,
  ADD COLUMN IF NOT EXISTS "source_period_end" date;

ALTER TABLE "allocation_runs"
  DROP CONSTRAINT IF EXISTS "allocation_runs_source_period_order";

ALTER TABLE "allocation_runs"
  ADD CONSTRAINT "allocation_runs_source_period_order" CHECK (
    "source_period_start" IS NULL
    OR "source_period_end" IS NULL
    OR "source_period_start" <= "source_period_end"
  );

CREATE INDEX IF NOT EXISTS "allocation_runs_expense_slice_idx"
  ON "allocation_runs" ("expense_id", "slice_index");
