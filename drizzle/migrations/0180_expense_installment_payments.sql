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
  reverses_payment_id uuid,
  audit_event_id uuid REFERENCES public.audit_events(id) ON DELETE SET NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_installment_payments_expense_org_fk
    FOREIGN KEY (expense_id, organization_id)
    REFERENCES public.expenses(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT expense_installment_payments_index_range
    CHECK (installment_index IS NULL OR (installment_index >= 0 AND installment_index < 120)),
  CONSTRAINT expense_installment_payments_paid_requires_amounts
    CHECK (status <> 'paid' OR (actual_paid_at IS NOT NULL AND gross_paid > 0)),
  CONSTRAINT expense_installment_payments_gross_net_vat
    CHECK (round(gross_paid::numeric, 2) = round((net_paid + vat_paid)::numeric, 2))
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_installment_payments_id_org_uq
  ON public.expense_installment_payments (id, organization_id);

ALTER TABLE public.expense_installment_payments
  DROP CONSTRAINT IF EXISTS expense_installment_payments_reversal_org_fk;

ALTER TABLE public.expense_installment_payments
  ADD CONSTRAINT expense_installment_payments_reversal_org_fk
  FOREIGN KEY (reverses_payment_id, organization_id)
  REFERENCES public.expense_installment_payments (id, organization_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.expense_installment_payment_reversal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app
AS $$
DECLARE
  target record;
BEGIN
  IF NEW.reverses_payment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('voided', 'credited') THEN
    RAISE EXCEPTION 'reverses_payment_id requires status voided or credited';
  END IF;
  SELECT expense_id, organization_id, status, gross_paid
    INTO target
    FROM public.expense_installment_payments
   WHERE id = NEW.reverses_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverses_payment_id not found';
  END IF;
  IF target.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'reversal must stay within organization';
  END IF;
  IF target.expense_id IS DISTINCT FROM NEW.expense_id THEN
    RAISE EXCEPTION 'reversal must target same expense';
  END IF;
  IF target.status NOT IN ('paid', 'credited') THEN
    RAISE EXCEPTION 'cannot reverse a row that is not an active payment';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.expense_installment_payments p
     WHERE p.reverses_payment_id = NEW.reverses_payment_id
       AND p.organization_id = NEW.organization_id
       AND p.status = 'voided'
       AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'payment already voided';
  END IF;
  IF NEW.status = 'credited' THEN
    IF (
      SELECT COALESCE(SUM(p.gross_paid), 0)
        FROM public.expense_installment_payments p
       WHERE p.reverses_payment_id = NEW.reverses_payment_id
         AND p.organization_id = NEW.organization_id
         AND p.status IN ('credited', 'voided')
         AND p.id IS DISTINCT FROM NEW.id
    ) + NEW.gross_paid > target.gross_paid + 0.000001 THEN
      RAISE EXCEPTION 'cumulative credit exceeds original payment gross';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_installment_payment_reversal_guard_trg
  ON public.expense_installment_payments;

CREATE TRIGGER expense_installment_payment_reversal_guard_trg
  BEFORE INSERT OR UPDATE OF reverses_payment_id, status, expense_id, organization_id
  ON public.expense_installment_payments
  FOR EACH ROW
  EXECUTE FUNCTION app.expense_installment_payment_reversal_guard();

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
