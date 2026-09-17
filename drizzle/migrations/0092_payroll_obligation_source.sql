-- 0092_payroll_obligation_source
-- Track provenance of payroll obligation rows; Owner must apply.

ALTER TABLE public.employee_payroll_payments
  ADD COLUMN IF NOT EXISTS obligation_source text;

ALTER TABLE public.employee_payroll_payments DROP CONSTRAINT IF EXISTS employee_payroll_payments_obligation_source_known;
ALTER TABLE public.employee_payroll_payments ADD CONSTRAINT employee_payroll_payments_obligation_source_known
  CHECK (
    obligation_source IS NULL
    OR obligation_source IN ('period_accrual', 'manual_correction', 'recompute_legacy', 'migration_unknown')
  );

UPDATE public.employee_payroll_payments
SET obligation_source = 'migration_unknown'
WHERE obligation_source IS NULL;
