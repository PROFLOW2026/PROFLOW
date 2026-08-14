-- 0039_ar_split_payment_applications
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- One customer payment may be allocated across multiple finalized invoices,
-- mirroring AP payment applications. Existing 1-invoice payments keep
-- billing_record_id and get a backfilled application row.
-- Outstanding = finalized billing − Σ(applications of non-void payments).
-- Retention is unchanged (cash timing, not a calculator rewrite).

ALTER TABLE public.payments
  ALTER COLUMN billing_record_id DROP NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_id uuid;

UPDATE public.payments p
SET client_id = COALESCE(b.client_id, proj.client_id)
FROM public.billing_records b
LEFT JOIN public.projects proj ON proj.id = b.project_id
WHERE p.billing_record_id = b.id
  AND p.client_id IS NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_client_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_client_org_fk'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_client_org_fk
      FOREIGN KEY (client_id, organization_id)
      REFERENCES public.clients (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_split_requires_client'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_split_requires_client CHECK (
        billing_record_id IS NOT NULL OR client_id IS NOT NULL
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  billing_record_id uuid NOT NULL,
  applied_amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_applications_amount_positive CHECK (applied_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_applications_id_organization_id_uq
  ON public.payment_applications (id, organization_id);
CREATE INDEX IF NOT EXISTS payment_applications_payment_bill_idx
  ON public.payment_applications (payment_id, billing_record_id);
CREATE INDEX IF NOT EXISTS payment_applications_payment_idx
  ON public.payment_applications (payment_id);
CREATE INDEX IF NOT EXISTS payment_applications_bill_idx
  ON public.payment_applications (billing_record_id);
CREATE INDEX IF NOT EXISTS payment_applications_org_idx
  ON public.payment_applications (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS payments_id_organization_id_uq
  ON public.payments (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_applications_payment_org_fk'
  ) THEN
    ALTER TABLE public.payment_applications
      ADD CONSTRAINT payment_applications_payment_org_fk
      FOREIGN KEY (payment_id, organization_id)
      REFERENCES public.payments (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_applications_bill_org_fk'
  ) THEN
    ALTER TABLE public.payment_applications
      ADD CONSTRAINT payment_applications_bill_org_fk
      FOREIGN KEY (billing_record_id, organization_id)
      REFERENCES public.billing_records (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill 1:1 applications from existing payments.
INSERT INTO public.payment_applications (
  organization_id, payment_id, billing_record_id, applied_amount, currency
)
SELECT p.organization_id, p.id, p.billing_record_id, p.amount, p.currency
FROM public.payments p
WHERE p.billing_record_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_applications a
    WHERE a.payment_id = p.id AND a.billing_record_id = p.billing_record_id
  );

CREATE OR REPLACE FUNCTION app.payment_applications_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_bill public.billing_records%ROWTYPE;
  v_applied numeric(18,6);
  v_bill_applied numeric(18,6);
  v_invoice_client uuid;
  v_held numeric(18,6);
  v_collectible numeric(18,6);
BEGIN
  IF NEW.applied_amount IS NULL OR NEW.applied_amount <= 0 THEN
    RAISE EXCEPTION 'payment_applications: applied amount must be positive'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock payment first, then the invoice (deterministic: one bill per insert).
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = NEW.payment_id AND organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_applications: payment must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_payment.status IS DISTINCT FROM 'recorded' THEN
    RAISE EXCEPTION 'payment_applications: payment must be recorded and not void'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_payment.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'payment_applications: currency must match payment'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT * INTO v_bill
  FROM public.billing_records
  WHERE id = NEW.billing_record_id AND organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_applications: billing record must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_bill.status IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'payment_applications: billing record must be finalized'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_bill.kind IS NOT DISTINCT FROM 'credit_note' THEN
    RAISE EXCEPTION 'payment_applications: credit notes are not payable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_bill.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'payment_applications: currency must match billing record'
      USING ERRCODE = 'restrict_violation';
  END IF;

  v_invoice_client := v_bill.client_id;
  IF v_invoice_client IS NULL AND v_bill.project_id IS NOT NULL THEN
    SELECT client_id INTO v_invoice_client
    FROM public.projects
    WHERE id = v_bill.project_id;
  END IF;

  IF v_payment.billing_record_id IS NULL AND v_payment.client_id IS NULL THEN
    RAISE EXCEPTION 'payment_applications: split payment requires client_id'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_payment.client_id IS NOT NULL
     AND v_invoice_client IS DISTINCT FROM v_payment.client_id THEN
    RAISE EXCEPTION 'payment_applications: invoice client must match payment client'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT COALESCE(SUM(applied_amount), 0) INTO v_applied
  FROM public.payment_applications
  WHERE payment_id = NEW.payment_id AND organization_id = NEW.organization_id;
  IF v_applied + NEW.applied_amount > v_payment.amount THEN
    RAISE EXCEPTION 'payment_applications: applied sum exceeds payment amount'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT COALESCE(SUM(a.applied_amount), 0) INTO v_bill_applied
  FROM public.payment_applications a
  JOIN public.payments p ON p.id = a.payment_id AND p.organization_id = a.organization_id
  WHERE a.billing_record_id = NEW.billing_record_id
    AND a.organization_id = NEW.organization_id
    AND p.status = 'recorded';

  v_held := COALESCE(v_bill.retention_held_remaining, 0);
  v_collectible := v_bill.total_amount - v_held;
  IF v_bill_applied + NEW.applied_amount > v_collectible THEN
    RAISE EXCEPTION 'payment_applications: applied sum exceeds collectible (total - held retention)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS payment_applications_allocation_guard ON public.payment_applications;
CREATE TRIGGER payment_applications_allocation_guard
  BEFORE INSERT ON public.payment_applications
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_applications_allocation_guard();

CREATE OR REPLACE FUNCTION app.payment_applications_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'payment_applications: deletes are forbidden'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payment_applications: updates are forbidden'
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS payment_applications_immutable_guard ON public.payment_applications;
CREATE TRIGGER payment_applications_immutable_guard
  BEFORE UPDATE OR DELETE ON public.payment_applications
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_applications_immutable_guard();

-- 1-invoice compatibility: inserting a payment with billing_record_id creates
-- the application automatically. Split payments leave billing_record_id null.
CREATE OR REPLACE FUNCTION app.payments_legacy_application_default()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.billing_record_id IS NOT NULL THEN
    INSERT INTO public.payment_applications (
      organization_id, payment_id, billing_record_id, applied_amount, currency
    ) VALUES (
      NEW.organization_id, NEW.id, NEW.billing_record_id, NEW.amount, NEW.currency
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS payments_legacy_application_default ON public.payments;
CREATE TRIGGER payments_legacy_application_default
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION app.payments_legacy_application_default();

ALTER TABLE public.payment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_applications_tenant_select ON public.payment_applications;
CREATE POLICY payment_applications_tenant_select ON public.payment_applications
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'billing.read'));

DROP POLICY IF EXISTS payment_applications_tenant_insert ON public.payment_applications;
CREATE POLICY payment_applications_tenant_insert ON public.payment_applications
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'billing.manage'));

DROP POLICY IF EXISTS payment_applications_service_all ON public.payment_applications;
CREATE POLICY payment_applications_service_all ON public.payment_applications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION app.payment_applications_allocation_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.payment_applications_immutable_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.payments_legacy_application_default() FROM PUBLIC;

--------------------------------------------------------------------------------
-- Recorded payment economic identity is immutable (AR and AP).
-- Correction path: recorded → void, then a replacement payment.
-- Metadata (method / reference / notes) may still change.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.payment_economic_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'payment_economic_immutable: amount, currency, payment_date, and organization_id cannot change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_TABLE_NAME = 'payments' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.billing_record_id IS DISTINCT FROM OLD.billing_record_id THEN
      RAISE EXCEPTION 'payment_economic_immutable: client_id and billing_record_id cannot change'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'ap_payments' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
      RAISE EXCEPTION 'payment_economic_immutable: vendor_id cannot change'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS payments_economic_immutability_guard ON public.payments;
CREATE TRIGGER payments_economic_immutability_guard
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_economic_immutability_guard();

DROP TRIGGER IF EXISTS ap_payments_economic_immutability_guard ON public.ap_payments;
CREATE TRIGGER ap_payments_economic_immutability_guard
  BEFORE UPDATE ON public.ap_payments
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_economic_immutability_guard();

REVOKE ALL ON FUNCTION app.payment_economic_immutability_guard() FROM PUBLIC;
