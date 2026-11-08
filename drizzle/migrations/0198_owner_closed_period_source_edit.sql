-- 0198_owner_closed_period_source_edit.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without a separate Owner approval.
-- Next free number after 0197. The organization owner may edit source rows in a closed month.
-- A ready month is not closed. service_role with no current user is not an owner.
-- No existing business rows are updated.

CREATE OR REPLACE FUNCTION app.is_organization_owner(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_organization_id IS NOT NULL
    AND app.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.role_assignments assignment
      JOIN public.roles role
        ON role.id = assignment.role_id
       AND role.organization_id = assignment.organization_id
      JOIN public.organization_memberships membership
        ON membership.id = assignment.membership_id
       AND membership.organization_id = assignment.organization_id
      WHERE assignment.organization_id = p_organization_id
        AND assignment.user_id = app.current_user_id()
        AND assignment.project_id IS NULL
        AND membership.user_id = app.current_user_id()
        AND membership.status = 'active'
        AND COALESCE(role.template_key, role.key) = 'owner'
    );
$fn$;

REVOKE ALL ON FUNCTION app.is_organization_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_organization_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.is_organization_owner(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.closed_period_rewrite_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_date_col text := TG_ARGV[0];
  v_status_col text := COALESCE(NULLIF(TG_ARGV[1], ''), '-');
  v_draft_status text := COALESCE(NULLIF(TG_ARGV[2], ''), '-');
  v_extra text := COALESCE(NULLIF(TG_ARGV[3], ''), '-');
  v_old_date date;
  v_new_date date;
  v_old_status text;
  v_new_status text;
  v_old_j jsonb;
  v_new_j jsonb;
  v_col text;
  v_allow text[];
  v_old_closed boolean;
  v_new_closed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
  v_allow := ARRAY['updated_at', 'notes'];
  IF v_extra <> '-' THEN
    v_allow := v_allow || string_to_array(v_extra, ',');
  END IF;

  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT ($1).%I', v_date_col) USING OLD INTO v_old_date;
    v_old_date := COALESCE(v_old_date, CURRENT_DATE);
    IF v_status_col <> '-' THEN
      EXECUTE format('SELECT ($1).%I::text', v_status_col) USING OLD INTO v_old_status;
    END IF;
    IF v_old_status IS NOT NULL AND v_draft_status <> '-' AND v_old_status = v_draft_status THEN
      RETURN OLD;
    END IF;
    IF v_old_date IS NOT NULL
       AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(v_old_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot delete %.% in closed month %',
        TG_TABLE_NAME, OLD.id, to_char(v_old_date, 'YYYY-MM')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    EXECUTE format('SELECT ($1).%I', v_date_col) USING NEW INTO v_new_date;
    v_new_date := COALESCE(v_new_date, CURRENT_DATE);
    IF v_status_col <> '-' AND v_draft_status <> '-' THEN
      EXECUTE format('SELECT ($1).%I::text', v_status_col) USING NEW INTO v_new_status;
      -- Drafts are not economic; they may be created while dated in a closed month.
      IF v_new_status IS NOT NULL AND v_new_status = v_draft_status THEN
        RETURN NEW;
      END IF;
    END IF;
    IF v_new_date IS NOT NULL
       AND app.is_month_closed_unrestricted(NEW.organization_id, to_char(v_new_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot insert % into closed month %',
        TG_TABLE_NAME, to_char(v_new_date, 'YYYY-MM')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  EXECUTE format('SELECT ($1).%I', v_date_col) USING OLD INTO v_old_date;
  EXECUTE format('SELECT ($1).%I', v_date_col) USING NEW INTO v_new_date;
  v_old_date := COALESCE(v_old_date, (OLD.created_at AT TIME ZONE 'UTC')::date);
  v_new_date := COALESCE(v_new_date, (NEW.created_at AT TIME ZONE 'UTC')::date);
  IF v_status_col <> '-' THEN
    EXECUTE format('SELECT ($1).%I::text', v_status_col) USING OLD INTO v_old_status;
    EXECUTE format('SELECT ($1).%I::text', v_status_col) USING NEW INTO v_new_status;
  END IF;

  v_old_closed := v_old_date IS NOT NULL
    AND app.is_month_closed_unrestricted(OLD.organization_id, to_char(v_old_date, 'YYYY-MM'));
  v_new_closed := v_new_date IS NOT NULL
    AND app.is_month_closed_unrestricted(NEW.organization_id, to_char(v_new_date, 'YYYY-MM'));

  -- Draft rows may be edited / re-dated out of a closed month. They may not be
  -- finalized (leave draft) while still dated in a closed month.
  IF v_draft_status <> '-' AND v_old_status = v_draft_status THEN
    IF v_new_status IS DISTINCT FROM v_draft_status AND v_new_closed THEN
      RAISE EXCEPTION 'closed_period_immutable: cannot finalize % into closed month %',
        TG_TABLE_NAME, to_char(v_new_date, 'YYYY-MM')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_new_closed AND (v_old_date IS DISTINCT FROM v_new_date) THEN
    RAISE EXCEPTION 'closed_period_immutable: cannot move % into closed month %',
      TG_TABLE_NAME, to_char(v_new_date, 'YYYY-MM')
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT v_old_closed THEN
    RETURN NEW;
  END IF;

  v_old_j := to_jsonb(OLD);
  v_new_j := to_jsonb(NEW);
  FOREACH v_col IN ARRAY v_allow LOOP
    v_old_j := v_old_j - v_col;
    v_new_j := v_new_j - v_col;
  END LOOP;

  IF v_old_j IS DISTINCT FROM v_new_j THEN
    RAISE EXCEPTION 'closed_period_immutable: cannot rewrite % in closed month %',
      TG_TABLE_NAME, to_char(v_old_date, 'YYYY-MM')
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

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
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION app.expenses_economic_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  old_ym text;
  new_ym text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION app.assert_ap_bill_economic_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  old_ym text;
  new_ym text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION app.expense_managerial_schedule_closed_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'is_month_closed_unrestricted'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF app.is_month_closed_unrestricted(OLD.organization_id, OLD.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', OLD.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF app.is_month_closed_unrestricted(OLD.organization_id, OLD.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', OLD.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month) THEN
      RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', NEW.year_month
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF app.is_month_closed_unrestricted(NEW.organization_id, NEW.year_month) THEN
    RAISE EXCEPTION 'closed_period_immutable: expense_managerial_schedule_lines %', NEW.year_month
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.payment_economic_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.is_organization_owner(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
  ELSIF app.is_organization_owner(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION app.payment_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
      IF NOT app.is_organization_owner(NEW.organization_id) THEN
        RAISE EXCEPTION 'payment_lifecycle: cannot resurrect a voided payment'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'recorded' AND NEW.status = 'void')
       AND NOT (
         OLD.status = 'void'
         AND NEW.status IS DISTINCT FROM 'void'
         AND app.is_organization_owner(NEW.organization_id)
       ) THEN
      RAISE EXCEPTION 'payment_lifecycle: only recorded to void is allowed'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'void' AND NEW.voided_at IS NULL THEN
      RAISE EXCEPTION 'payment_lifecycle: void requires voided_at'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'void' AND NEW.status = 'void' AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
      RAISE EXCEPTION 'payment_lifecycle: voided_at is immutable after void'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.payment_lifecycle_guard() FROM PUBLIC;

