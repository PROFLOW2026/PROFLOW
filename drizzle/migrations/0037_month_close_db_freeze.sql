-- 0037_month_close_db_freeze
-- Additive only. Does NOT modify 0000–0035 file contents.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Database freeze for CLOSED months. Application guards are not sufficient.
-- Direct SQL / RLS paths must not rewrite economic truth in a closed month.
--
-- Allowed:
--   - INSERT of draft expense / AP / billing rows even when dated in a closed
--     month (not economic until they leave draft)
--   - INSERT of month_close_adjustments (canonical closed-period correction)
--   - INSERT of new non-draft rows dated in an OPEN month
--   - notes / updated_at on frozen rows (not archived_at — archive changes compose)
--   - payment recorded → void (status + voided_at only) as cash reversal
-- Forbidden:
--   - INSERT of non-draft economic rows into a closed year-month
--   - INSERT of payments / AP payments into a closed year-month (no draft)
--   - rewriting amounts/dates of non-draft rows in a closed month
--   - DELETE of non-draft closed-month rows
--   - void → recorded (or any other payment lifecycle resurrection)
--   - archived_at on/off for recognized economic rows in a closed month
--
-- Draft INSERT in a closed month is allowed for expense / AP / billing / vendor credits
-- (not economic until they leave draft). The trigger implements that.
--
-- VAT is not invented. Portal stays off.

--------------------------------------------------------------------------------
-- 1) Membership-free closed check (triggers must not no-op for service_role)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.is_month_closed_unrestricted(
  p_organization_id uuid,
  p_year_month text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.month_close_periods p
    WHERE p.organization_id = p_organization_id
      AND p.year_month = p_year_month
      AND p.status = 'closed'
  );
$fn$;

REVOKE ALL ON FUNCTION app.is_month_closed_unrestricted(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_month_closed_unrestricted(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.is_month_closed_unrestricted(uuid, text) TO service_role;

--------------------------------------------------------------------------------
-- 2) Generic closed-period rewrite guard
-- TG_ARGV[0] = date column
-- TG_ARGV[1] = status column or '-'
-- TG_ARGV[2] = draft status value or '-'
-- TG_ARGV[3] = extra allowlisted columns, comma-separated, or '-'
--------------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION app.closed_period_rewrite_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS expenses_closed_period_guard ON public.expenses;
CREATE TRIGGER expenses_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('expense_date', 'status', 'draft', '-');

DROP TRIGGER IF EXISTS ap_bills_closed_period_guard ON public.ap_bills;
CREATE TRIGGER ap_bills_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('bill_date', 'status', 'draft', '-');

DROP TRIGGER IF EXISTS billing_records_closed_period_guard ON public.billing_records;
CREATE TRIGGER billing_records_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('issue_date', 'status', 'draft', '-');

DROP TRIGGER IF EXISTS payments_closed_period_guard ON public.payments;
CREATE TRIGGER payments_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('payment_date', '-', '-', 'status,voided_at');

DROP TRIGGER IF EXISTS ap_payments_closed_period_guard ON public.ap_payments;
CREATE TRIGGER ap_payments_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_payments
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('payment_date', '-', '-', 'status,voided_at');

DROP TRIGGER IF EXISTS time_entries_closed_period_guard ON public.time_entries;
CREATE TRIGGER time_entries_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('work_date', '-', '-', 'description');

DROP TRIGGER IF EXISTS contract_value_events_closed_period_guard ON public.contract_value_events;
CREATE TRIGGER contract_value_events_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.contract_value_events
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('effective_date', '-', '-', '-');

DROP TRIGGER IF EXISTS ap_vendor_credits_closed_period_guard ON public.ap_vendor_credits;
CREATE TRIGGER ap_vendor_credits_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard('credit_date', 'status', 'draft', '-');

-- Payments have no draft. recorded → void is the only economic transition.
-- void → recorded is resurrection and is never allowed.
CREATE OR REPLACE FUNCTION app.payment_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
      RAISE EXCEPTION 'payment_lifecycle: cannot resurrect a voided payment'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'recorded' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'payment_lifecycle: only recorded → void is allowed'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'void' AND NEW.voided_at IS NULL THEN
      RAISE EXCEPTION 'payment_lifecycle: void requires voided_at'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'void' AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
      RAISE EXCEPTION 'payment_lifecycle: voided_at is immutable after void'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS payments_lifecycle_guard ON public.payments;
CREATE TRIGGER payments_lifecycle_guard
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_lifecycle_guard();

DROP TRIGGER IF EXISTS ap_payments_lifecycle_guard ON public.ap_payments;
CREATE TRIGGER ap_payments_lifecycle_guard
  BEFORE UPDATE ON public.ap_payments
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_lifecycle_guard();

REVOKE ALL ON FUNCTION app.payment_lifecycle_guard() FROM PUBLIC;

