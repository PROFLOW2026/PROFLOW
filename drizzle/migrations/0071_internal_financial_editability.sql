-- 0071: Internal management editability (open periods only).
-- Relaxes 0070 accounting-style immutability while preserving economic integrity.
-- Does NOT modify 0070; replaces guard functions only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.internal_financial_month_editable(
  p_organization_id uuid,
  p_year_month text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT app.is_month_closed(p_organization_id, p_year_month);
$$;

CREATE OR REPLACE FUNCTION app.internal_financial_edit_latch_held()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT app.next_gen_latch_held('internal_financial_edit');
$$;

CREATE OR REPLACE FUNCTION app.ap_bill_restore_latch_held()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT app.next_gen_latch_held('ap_bill_restore');
$$;

COMMENT ON FUNCTION app.internal_financial_month_editable(uuid, text) IS
  'True when the org month is open for direct internal financial corrections.';

-- ---------------------------------------------------------------------------
-- Expenses: allow direct correction in open months (trusted latch required)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.expenses_economic_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  old_ym text;
  new_ym text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF app.next_gen_latch_held('expense_classification_remediation') THEN
      IF OLD.classification_status IS DISTINCT FROM 'needs_classification' THEN
        RAISE EXCEPTION 'classification_remediation_only_for_needs_classification'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.installment_count IS DISTINCT FROM OLD.installment_count
         OR NEW.installment_start_date IS DISTINCT FROM OLD.installment_start_date
         OR NEW.inventory_stock_purchase IS DISTINCT FROM OLD.inventory_stock_purchase
         OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
         OR NEW.inventory_purchase_qty IS DISTINCT FROM OLD.inventory_purchase_qty
         OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
         OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
         OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
         OR NEW.status IS DISTINCT FROM OLD.status
      THEN
        RAISE EXCEPTION 'classification_remediation_scope_violation'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF app.internal_financial_edit_latch_held() THEN
      old_ym := to_char(OLD.expense_date, 'YYYY-MM');
      new_ym := to_char(NEW.expense_date, 'YYYY-MM');
      IF NOT app.internal_financial_month_editable(OLD.organization_id, old_ym) THEN
        RAISE EXCEPTION 'expense_edit_closed_month'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF new_ym IS DISTINCT FROM old_ym
         AND NOT app.internal_financial_month_editable(OLD.organization_id, new_ym) THEN
        RAISE EXCEPTION 'expense_edit_closed_month'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'finalized' THEN
        RAISE EXCEPTION 'expense_edit_status_locked'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.installment_count IS DISTINCT FROM OLD.installment_count
       OR NEW.installment_start_date IS DISTINCT FROM OLD.installment_start_date
       OR NEW.inventory_stock_purchase IS DISTINCT FROM OLD.inventory_stock_purchase
       OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
       OR NEW.inventory_purchase_qty IS DISTINCT FROM OLD.inventory_purchase_qty
       OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
       OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
    THEN
      RAISE EXCEPTION 'expenses_economic_settings_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.currency IS DISTINCT FROM OLD.currency
     AND EXISTS (
       SELECT 1
       FROM public.expense_managerial_schedule_lines s
       WHERE s.expense_id = OLD.id
         AND s.organization_id = OLD.organization_id
         AND s.status IN ('scheduled', 'recognized')
     )
     AND NOT app.internal_financial_edit_latch_held()
  THEN
    RAISE EXCEPTION 'expense_currency_schedule_locked'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- AP recognition gate: allow controlled restore from void in open months
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_ap_bill_recognition_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  bill_ym text;
BEGIN
  IF TG_OP = 'INSERT'
     AND app.is_ap_bill_recognized_status(NEW.status) THEN
    RAISE EXCEPTION 'AP bills must be created as draft before recognition'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'void'
     AND NEW.status IS DISTINCT FROM 'void' THEN
    bill_ym := to_char(COALESCE(NEW.bill_date, OLD.bill_date, CURRENT_DATE), 'YYYY-MM');
    IF app.ap_bill_restore_latch_held()
       AND app.is_ap_bill_recognized_status(NEW.status)
       AND app.internal_financial_month_editable(NEW.organization_id, bill_ym) THEN
      PERFORM app.validate_ap_bill_recognition_atoms(NEW.id, NEW.organization_id);
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'void AP bills are terminal'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'void'
     AND OLD.status IS DISTINCT FROM 'void' THEN
    IF NOT app.next_gen_latch_held('ap_bill_void') THEN
      RAISE EXCEPTION 'ap_bill_void_trusted_path_required'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT app.is_ap_bill_recognized_status(OLD.status)
     AND app.is_ap_bill_recognized_status(NEW.status) THEN
    PERFORM app.validate_ap_bill_recognition_atoms(NEW.id, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- AP lines: editable in open months with internal_financial_edit latch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_ap_bill_line_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  parent_status text;
  bill_id uuid;
  org_id uuid;
  bill_date date;
  bill_ym text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    bill_id := OLD.ap_bill_id;
    org_id := OLD.organization_id;
  ELSE
    bill_id := NEW.ap_bill_id;
    org_id := NEW.organization_id;
  END IF;

  SELECT b.status, b.bill_date
  INTO parent_status, bill_date
  FROM public.ap_bills b
  WHERE b.id = bill_id AND b.organization_id = org_id
  FOR UPDATE;

  IF NOT app.is_ap_bill_recognized_status(parent_status) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  bill_ym := to_char(COALESCE(bill_date, CURRENT_DATE), 'YYYY-MM');

  IF app.internal_financial_edit_latch_held()
     AND app.internal_financial_month_editable(org_id, bill_ym) THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.classification_status IS DISTINCT FROM 'classified'
         OR NEW.cost_category_id IS NULL THEN
        RAISE EXCEPTION 'recognized AP line requires classified category'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF app.next_gen_latch_held('ap_line_classification_remediation') THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION 'ap_line_remediation_update_only' USING ERRCODE = '23514';
    END IF;
    IF OLD.classification_status IS DISTINCT FROM 'needs_classification' THEN
      RAISE EXCEPTION 'ap_line_remediation_only_for_needs_classification'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_amount IS DISTINCT FROM OLD.unit_amount
       OR NEW.line_total IS DISTINCT FROM OLD.line_total
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
       OR NEW.economic_target_type IS DISTINCT FROM OLD.economic_target_type
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
    THEN
      RAISE EXCEPTION 'ap_line_remediation_scope_violation'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'recognized AP bill lines cannot be inserted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'recognized AP bill lines cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_amount IS DISTINCT FROM OLD.unit_amount
       OR NEW.line_total IS DISTINCT FROM OLD.line_total
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
       OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.economic_target_type IS DISTINCT FROM OLD.economic_target_type
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
    THEN
      RAISE EXCEPTION 'recognized AP bill line economics are immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- AP parent bill economics: editable in open months with latch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_ap_bill_economic_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  old_ym text;
  new_ym text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NOT app.is_ap_bill_recognized_status(OLD.status) AND OLD.status IS DISTINCT FROM 'void' THEN
    RETURN NEW;
  END IF;

  old_ym := to_char(COALESCE(OLD.bill_date, OLD.created_at::date), 'YYYY-MM');
  new_ym := to_char(COALESCE(NEW.bill_date, NEW.created_at::date), 'YYYY-MM');

  IF app.next_gen_latch_held('ap_bill_void')
     AND NEW.status = 'void'
     AND OLD.status IS DISTINCT FROM 'void' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
       OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.amount_includes_tax IS DISTINCT FROM OLD.amount_includes_tax
       OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
       OR NEW.tax_basis IS DISTINCT FROM OLD.tax_basis
       OR NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
    THEN
      RAISE EXCEPTION 'ap_bill_void_scope_violation'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF app.ap_bill_restore_latch_held()
     AND OLD.status = 'void'
     AND app.is_ap_bill_recognized_status(NEW.status) THEN
    IF NOT app.internal_financial_month_editable(OLD.organization_id, new_ym) THEN
      RAISE EXCEPTION 'ap_bill_restore_closed_month' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF app.internal_financial_edit_latch_held()
     AND app.is_ap_bill_recognized_status(OLD.status)
     AND app.internal_financial_month_editable(OLD.organization_id, old_ym) THEN
    IF new_ym IS DISTINCT FROM old_ym
       AND NOT app.internal_financial_month_editable(OLD.organization_id, new_ym) THEN
      RAISE EXCEPTION 'ap_bill_edit_closed_month' USING ERRCODE = '23514';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT app.is_ap_bill_recognized_status(NEW.status) THEN
      RAISE EXCEPTION 'ap_bill_edit_status_locked' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'void' THEN
    RETURN NEW;
  END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
     OR NEW.amount_includes_tax IS DISTINCT FROM OLD.amount_includes_tax
     OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
     OR NEW.tax_basis IS DISTINCT FROM OLD.tax_basis
     OR NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  THEN
    RAISE EXCEPTION 'recognized AP bill economics are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Post line mutations: defer reconciliation to transaction commit (atomic multi-line edit).
CREATE OR REPLACE FUNCTION app.assert_ap_bill_lines_reconcile_after_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  bill_id uuid;
  org_id uuid;
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    bill_id := OLD.ap_bill_id;
    org_id := OLD.organization_id;
  ELSE
    bill_id := NEW.ap_bill_id;
    org_id := NEW.organization_id;
  END IF;

  SELECT status INTO parent_status
  FROM public.ap_bills
  WHERE id = bill_id AND organization_id = org_id;

  IF app.is_ap_bill_recognized_status(parent_status)
     AND app.internal_financial_edit_latch_held() THEN
    PERFORM app.validate_ap_bill_recognition_atoms(bill_id, org_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bill_lines_reconcile_after_mutation ON public.ap_bill_lines;
CREATE CONSTRAINT TRIGGER ap_bill_lines_reconcile_after_mutation
  AFTER INSERT OR UPDATE OR DELETE ON public.ap_bill_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ap_bill_lines_reconcile_after_mutation();

-- Owner-selected VAT mode on expenses (not inferred from category).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vat_mode text;

ALTER TABLE public.expenses
  ALTER COLUMN vat_mode SET DEFAULT 'inclusive';

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_vat_mode_known;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_vat_mode_known
  CHECK (vat_mode IS NULL OR vat_mode IN ('inclusive', 'exclusive', 'zero'));

COMMENT ON COLUMN public.expenses.vat_mode IS
  'Owner VAT entry mode: inclusive, exclusive, or zero. New rows default inclusive; historical NULL preserved.';
