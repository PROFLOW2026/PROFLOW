-- 0143: Enable closed-month DB trigger for expense_managerial_schedule_lines
--
-- Context: Migration 0141 created fn_block_closed_month_schedule_write and
-- trg_block_closed_month_schedule_write but left the trigger DISABLED pending
-- a code fix to replaceScheduleLines.
--
-- Fix applied in this wave (managerial-schedule.repository.ts):
--   replaceScheduleLines now queries closed months BEFORE deleting lines.
--   It only deletes/inserts lines for OPEN months. Lines in closed months are
--   left untouched, so the trigger will NEVER fire for legitimate rebuild ops.
--   Backdated expenses whose expenseDate falls in a closed month will have
--   their schedule lines placed in the earliest open month instead (filtered
--   at insert time). This matches the adjustment/reversal policy — historical
--   closed-period recognition is immutable.
--
-- The trigger is now safe to enable.

ALTER TABLE public.expense_managerial_schedule_lines
  ENABLE TRIGGER trg_block_closed_month_schedule_write;

-- Verify trigger is enabled (this will fail gracefully if the trigger
-- or table does not exist, making the migration idempotent on re-run).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname   = 'trg_block_closed_month_schedule_write'
      AND tgrelid  = 'expense_managerial_schedule_lines'::regclass
      AND tgenabled <> 'D'   -- 'D' = disabled; anything else means enabled
  ) THEN
    RAISE WARNING 'trigger trg_block_closed_month_schedule_write is still disabled or missing';
  END IF;
END $$;
