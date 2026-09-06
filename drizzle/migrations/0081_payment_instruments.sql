-- Saved organization payment instruments (credit cards) + expense linkage.
-- Owner applies manually — do not modify 0000–0080.

CREATE TABLE IF NOT EXISTS public.organization_payment_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  instrument_type text NOT NULL DEFAULT 'credit_card',
  display_name text,
  last_four text,
  monthly_debit_day integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_payment_instruments_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT organization_payment_instruments_type_known
    CHECK (instrument_type IN ('credit_card')),
  CONSTRAINT organization_payment_instruments_last_four_shape
    CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  CONSTRAINT organization_payment_instruments_debit_day_range
    CHECK (
      monthly_debit_day IS NULL
      OR (monthly_debit_day >= 1 AND monthly_debit_day <= 28)
    )
);

CREATE INDEX IF NOT EXISTS organization_payment_instruments_org_active_idx
  ON public.organization_payment_instruments (organization_id)
  WHERE is_active = true;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_instrument_id uuid;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payment_instrument_org_fk;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_instrument_org_fk
  FOREIGN KEY (payment_instrument_id, organization_id)
  REFERENCES public.organization_payment_instruments (id, organization_id)
  ON DELETE SET NULL (payment_instrument_id);

CREATE INDEX IF NOT EXISTS expenses_payment_instrument_idx
  ON public.expenses (organization_id, payment_instrument_id)
  WHERE payment_instrument_id IS NOT NULL;

ALTER TABLE public.recurring_financial_drafts
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_instrument_id uuid;

ALTER TABLE public.recurring_financial_drafts
  DROP CONSTRAINT IF EXISTS recurring_financial_drafts_payment_instrument_org_fk;
ALTER TABLE public.recurring_financial_drafts
  ADD CONSTRAINT recurring_financial_drafts_payment_instrument_org_fk
  FOREIGN KEY (payment_instrument_id, organization_id)
  REFERENCES public.organization_payment_instruments (id, organization_id)
  ON DELETE SET NULL (payment_instrument_id);

-- RLS (house style — org.read / settings.manage)
SELECT app.install_org_table_rls('organization_payment_instruments', 'org.read', 'settings.manage', NULL);
