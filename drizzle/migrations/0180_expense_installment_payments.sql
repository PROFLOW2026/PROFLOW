-- 0180: Per-installment payment ledger (PREPARED ONLY — Owner approval before apply).
-- Supports partial payments, multiple rows per installment, void/credit linkage, audit idempotency.

CREATE TABLE IF NOT EXISTS public.expense_installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL,
  installment_index integer,
  payment_sequence integer NOT NULL DEFAULT 1,
  due_date date,
  actual_paid_at date,
  gross_paid numeric(18, 6) NOT NULL CHECK (gross_paid > 0),
  net_paid numeric(18, 6) NOT NULL CHECK (net_paid >= 0),
  vat_paid numeric(18, 6) NOT NULL DEFAULT 0 CHECK (vat_paid >= 0),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'voided', 'credited')),
  payment_reference text,
  reverses_payment_id uuid REFERENCES public.expense_installment_payments(id) ON DELETE RESTRICT,
  audit_event_id uuid REFERENCES public.audit_events(id) ON DELETE SET NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_installment_payments_expense_org_fk
    FOREIGN KEY (expense_id, organization_id)
    REFERENCES public.expenses(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT expense_installment_payments_index_range
    CHECK (installment_index IS NULL OR (installment_index >= 0 AND installment_index < 120)),
  CONSTRAINT expense_installment_payments_paid_requires_amounts
    CHECK (status <> 'paid' OR (actual_paid_at IS NOT NULL AND gross_paid > 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_installment_payments_audit_uq
  ON public.expense_installment_payments (organization_id, audit_event_id)
  WHERE audit_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_installment_payments_idempotency_uq
  ON public.expense_installment_payments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_installment_payments_org_paid_idx
  ON public.expense_installment_payments (organization_id, actual_paid_at)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS expense_installment_payments_expense_idx
  ON public.expense_installment_payments (expense_id, installment_index);

COMMENT ON TABLE public.expense_installment_payments IS
  'Append-style installment payment facts. Multiple partial rows per installment allowed; void/credit via status + reverses_payment_id.';

ALTER TABLE public.expense_installment_payments ENABLE ROW LEVEL SECURITY;

SELECT app.install_org_parent_table_rls(
  'expense_installment_payments',
  'expenses',
  'expense_id',
  'financials.read',
  'financials.write'
);
