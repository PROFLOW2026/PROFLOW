-- Migration 0141: FX/Multi-Currency Expenses, Cost-Code Mapping, Closed-Month DB Protection
-- Domain: Expenses, Cost Allocation, FX, Budget Lines, Month Close
-- Author: expenses-ops-finance remediation agent
-- DO NOT EXECUTE without explicit Owner approval (see projectflow-release-preflight.mdc).

-- ============================================================
-- SECTION 1: FX expense columns (Task 1 — Option B)
-- ============================================================
-- Adds exchange_rate_to_base and ils_equivalent_net_amount to expense_records.
-- Both columns are NULLABLE so existing rows are unaffected.
-- Application layer populates these at expense entry time when the operator
-- enters an exchange rate for a non-base-currency expense.
-- Aggregation engine (cost-aggregation.ts) uses ils_equivalent_net_amount when
-- present; otherwise the expense remains in foreign_currency_expenses_excluded
-- partial coverage (Option C behaviour preserved for unrated FX expenses).
-- ============================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS ils_equivalent_net_amount NUMERIC(18, 6);

-- Self-consistency constraint: if ILS equivalent is stored, a rate must be too.
ALTER TABLE expenses
  ADD CONSTRAINT expenses_ils_equivalent_requires_rate
    CHECK (
      ils_equivalent_net_amount IS NULL
      OR exchange_rate_to_base IS NOT NULL
    );

-- Optional: positive rate when recorded
ALTER TABLE expenses
  ADD CONSTRAINT expenses_exchange_rate_positive
    CHECK (exchange_rate_to_base IS NULL OR exchange_rate_to_base > 0);

-- Optional: non-negative ILS equivalent
ALTER TABLE expenses
  ADD CONSTRAINT expenses_ils_equivalent_non_negative
    CHECK (ils_equivalent_net_amount IS NULL OR ils_equivalent_net_amount >= 0);

-- Index: find FX expenses that still need a rate (actionable attention list).
CREATE INDEX IF NOT EXISTS expenses_fx_without_rate_idx
  ON expenses (organization_id, expense_date)
  WHERE currency <> 'ILS'
    AND exchange_rate_to_base IS NULL
    AND status = 'finalized'
    AND archived_at IS NULL;


-- ============================================================
-- SECTION 2: Cost-code carrier on expense_allocations (Task 2)
-- ============================================================
-- cost_code_id already exists on expenses (header, migration 0074) and on
-- expense_allocations (line-level, migration 0074).
-- Verified via schema inspection: no new column is needed.
-- The application layer (map-line-actuals.ts, financials expenses.repository.ts)
-- has been updated in this wave to wire the mapping end-to-end.
-- This section is intentionally a no-op at the SQL level.

-- Verify that the column exists (will error if it doesn't, surfacing a mismatch):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_allocations'
      AND column_name = 'cost_code_id'
  ) THEN
    RAISE EXCEPTION 'cost_code_id missing from expense_allocations — check migration 0074';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses'
      AND column_name = 'cost_code_id'
  ) THEN
    RAISE EXCEPTION 'cost_code_id missing from expenses — check migration 0074';
  END IF;
END $$;


-- ============================================================
-- SECTION 3: Closed-Month DB Protection (Task 3)
--
-- ⚠️  REVIEW BEFORE APPLYING ⚠️
--
-- This trigger blocks INSERT/UPDATE on expense_managerial_schedule_lines
-- when the target year_month is a closed month_close_period for the same org.
-- It does NOT block the expense row itself — finalized expenses can still be
-- voided or adjusted (those create NEW rows via voidsExpenseId / adjustsExpenseId,
-- which land in the current open period, not the historical closed one).
--
-- Remaining risks to review before enabling:
--  1. Economic adjustment flows: month_close_adjustments are the correct
--     vehicle for closed-period corrections — verify no app path writes
--     schedule lines to past closed months as part of an adjustment.
--  2. Rebuild jobs: `rebuild-expense-managerial-schedules.ts` regenerates
--     all schedule lines for an expense; if the expense spans a closed month
--     this trigger will fire and block the rebuild. The rebuild must be
--     updated to skip (or soft-delete and re-insert) closed-month lines.
--  3. Back-dated expenses: an expense created today with expenseDate in a
--     past closed month will attempt to write schedule lines in that month.
--     Decide whether to allow this (the line date matches expenseDate, not
--     creation date) or redirect to an adjustment.
--
-- RECOMMENDATION: enable after items 1–3 are confirmed safe. The function
-- below is idempotent (CREATE OR REPLACE) and the trigger is DISABLED by
-- default — enable per-org after audit:
--   ALTER TABLE expense_managerial_schedule_lines ENABLE TRIGGER trg_block_closed_month_schedule_write;
--
-- ============================================================

CREATE OR REPLACE FUNCTION fn_block_closed_month_schedule_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM month_close_periods
  WHERE organization_id = NEW.organization_id
    AND year_month = NEW.year_month
  LIMIT 1;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION
      'Cannot write expense schedule line for closed period % (org %)',
      NEW.year_month, NEW.organization_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger is created but DISABLED by default (safe — must be explicitly enabled).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_block_closed_month_schedule_write'
      AND tgrelid = 'expense_managerial_schedule_lines'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_block_closed_month_schedule_write
        BEFORE INSERT OR UPDATE ON expense_managerial_schedule_lines
        FOR EACH ROW
        EXECUTE FUNCTION fn_block_closed_month_schedule_write()
    ';
    -- Start DISABLED — enable after Owner review (see notes above).
    EXECUTE 'ALTER TABLE expense_managerial_schedule_lines DISABLE TRIGGER trg_block_closed_month_schedule_write';
  END IF;
END $$;
