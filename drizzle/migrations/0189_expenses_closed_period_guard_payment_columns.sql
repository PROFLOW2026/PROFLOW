-- 0189: Closed-period recognition guards on payment columns (§9.6 / F13).
-- Pending journal (Gate B). Replaces expenses trigger binding only; 0037 closed-month functions unchanged.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_after_period_close boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION app.expenses_closed_period_guard_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_expense_old_closed boolean;
  v_expense_new_closed boolean;
  v_old_paid_closed boolean;
  v_new_paid_closed boolean;
  v_payment_changed boolean;
  v_non_payment_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN
      RETURN OLD;
    END IF;
    IF app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.expense_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot delete expense in closed month %',
        to_char(OLD.expense_date, 'YYYY-MM')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    IF app.is_month_closed_unrestricted(NEW.organization_id, to_char(NEW.expense_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot insert expense into closed month %',
        to_char(NEW.expense_date, 'YYYY-MM')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.paid_after_period_close IS DISTINCT FROM OLD.paid_after_period_close
     AND NOT (
       OLD.paid_at IS NULL
       AND NEW.paid_at IS NOT NULL
       AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.expense_date, 'YYYY-MM'))
       AND NEW.paid_after_period_close = true
     )
  THEN
    RAISE EXCEPTION 'closed_period_immutable: paid_after_period_close is system-managed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.paid_at IS NULL
     AND NEW.paid_at IS NOT NULL
     AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.expense_date, 'YYYY-MM'))
  THEN
    NEW.paid_after_period_close := true;
  END IF;

  v_payment_changed :=
       NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.paid_gross_amount IS DISTINCT FROM OLD.paid_gross_amount
    OR NEW.installments_paid_count IS DISTINCT FROM OLD.installments_paid_count
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.payment_confirmation_source IS DISTINCT FROM OLD.payment_confirmation_source;

  v_non_payment_changed :=
       NEW.expense_date IS DISTINCT FROM OLD.expense_date
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
    OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
    OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.currency IS DISTINCT FROM OLD.currency;

  v_expense_old_closed := app.is_month_closed_unrestricted(
    OLD.organization_id, to_char(OLD.expense_date, 'YYYY-MM'));
  v_expense_new_closed := app.is_month_closed_unrestricted(
    NEW.organization_id, to_char(NEW.expense_date, 'YYYY-MM'));

  IF v_non_payment_changed AND (v_expense_old_closed OR v_expense_new_closed) THEN
    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'closed_period_immutable: cannot rewrite expense fields in closed expense month'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF v_payment_changed THEN
    v_old_paid_closed := OLD.paid_at IS NOT NULL
      AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.paid_at, 'YYYY-MM'));
    v_new_paid_closed := NEW.paid_at IS NOT NULL
      AND app.is_month_closed_unrestricted(NEW.organization_id, to_char(NEW.paid_at, 'YYYY-MM'));
    IF v_old_paid_closed OR v_new_paid_closed THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot add or remove recognition in closed payment month'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.expenses_closed_period_guard_v2() FROM PUBLIC;

DROP TRIGGER IF EXISTS expenses_closed_period_guard ON public.expenses;
CREATE TRIGGER expenses_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.expenses_closed_period_guard_v2();

CREATE OR REPLACE FUNCTION app.expense_installment_payments_closed_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_old_closed boolean;
  v_new_closed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.actual_paid_at IS NOT NULL
       AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.actual_paid_at, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot delete installment payment in closed month'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.actual_paid_at IS NOT NULL
       AND app.is_month_closed_unrestricted(NEW.organization_id, to_char(NEW.actual_paid_at, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot insert installment payment into closed month'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_old_closed := OLD.actual_paid_at IS NOT NULL
    AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(OLD.actual_paid_at, 'YYYY-MM'));
  v_new_closed := NEW.actual_paid_at IS NOT NULL
    AND app.is_month_closed_unrestricted(NEW.organization_id, to_char(NEW.actual_paid_at, 'YYYY-MM'));
  IF v_old_closed OR v_new_closed THEN
    RAISE EXCEPTION 'closed_period_immutable: cannot change installment payment affecting closed month'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.expense_installment_payments_closed_period_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS expense_installment_payments_closed_period_guard ON public.expense_installment_payments;
CREATE TRIGGER expense_installment_payments_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_installment_payments
  FOR EACH ROW
  EXECUTE FUNCTION app.expense_installment_payments_closed_period_guard();

CREATE OR REPLACE FUNCTION app.ap_po_matches_closed_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_bill_date date;
  v_expense_date date;
  v_org uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.organization_id;
    SELECT bill_date INTO v_bill_date FROM public.ap_bills WHERE id = OLD.ap_bill_id;
    IF v_bill_date IS NOT NULL
       AND app.is_month_closed_unrestricted(v_org, to_char(v_bill_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot delete AP match in closed bill month'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.expense_id IS NOT NULL THEN
      SELECT expense_date INTO v_expense_date FROM public.expenses WHERE id = OLD.expense_id;
      IF v_expense_date IS NOT NULL
         AND app.is_month_closed_unrestricted(v_org, to_char(v_expense_date, 'YYYY-MM')) THEN
        RAISE EXCEPTION 'closed_period_immutable: cannot delete AP match in closed expense month'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  v_org := NEW.organization_id;
  SELECT bill_date INTO v_bill_date FROM public.ap_bills WHERE id = NEW.ap_bill_id;
  IF v_bill_date IS NOT NULL
     AND app.is_month_closed_unrestricted(v_org, to_char(v_bill_date, 'YYYY-MM')) THEN
    RAISE EXCEPTION 'closed_period_immutable: cannot write AP match in closed bill month'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.expense_id IS NOT NULL THEN
    SELECT expense_date INTO v_expense_date FROM public.expenses WHERE id = NEW.expense_id;
    IF v_expense_date IS NOT NULL
       AND app.is_month_closed_unrestricted(v_org, to_char(v_expense_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot write AP match in closed expense month'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.matched_amount IS DISTINCT FROM NEW.matched_amount)
  THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.ap_po_matches_closed_period_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS ap_po_matches_closed_period_guard ON public.ap_po_matches;
CREATE TRIGGER ap_po_matches_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_po_matches
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_po_matches_closed_period_guard();
