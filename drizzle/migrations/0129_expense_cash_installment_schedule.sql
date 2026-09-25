-- 0129: Persist an editable cash installment schedule on an expense.
-- Migration after 0128. Do not modify migrations 0000–0128.
--
-- PURPOSE
-- ───────
-- One expense can be paid in several cash installments (card, checks, transfer).
-- The lines are cash-out dates and amounts. They do not spread recognized NET.
-- Legacy rows stay null and keep equal-monthly derivation from installment_count.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cash_installment_schedule jsonb;

COMMENT ON COLUMN public.expenses.cash_installment_schedule IS
  'Cash installment lines {interval, lines[{dueDate, amount}]}. Null = legacy equal monthly cash schedule. Does not change recognized cost.';
