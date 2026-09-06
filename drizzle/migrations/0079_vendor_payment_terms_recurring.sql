-- Vendor payment behavior overrides + installment auto-pay + extended confirmation sources.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payment_confirmation_override text NOT NULL DEFAULT 'org_default',
  ADD COLUMN IF NOT EXISTS recurring_payment_day integer;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_payment_confirmation_override_known;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_payment_confirmation_override_known
  CHECK (payment_confirmation_override IN ('org_default', 'automatic'));

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_recurring_payment_day_range;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_recurring_payment_day_range
  CHECK (
    recurring_payment_day IS NULL
    OR (recurring_payment_day >= 1 AND recurring_payment_day <= 28)
  );

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS automatic_installment_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installments_paid_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_installments_paid_count_range;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_installments_paid_count_range
  CHECK (
    installments_paid_count >= 0
    AND installments_paid_count <= installment_count
  );

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_confirmation_source_known;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_confirmation_source_known
  CHECK (
    payment_confirmation_source IS NULL
    OR payment_confirmation_source IN (
      'manual',
      'automatic_policy',
      'automatic_recurring_policy',
      'automatic_installment_policy'
    )
  );
