-- 0072: Allow finalized recurring expenses when auto_finalize_expense is enabled.
--
-- 0030 introduced app.recurring_financial_draft_runs_guard(), requiring every entity
-- linked through recurring_financial_draft_runs to remain draft at INSERT time.
-- 0069 added recurring_financial_drafts.auto_finalize_expense for expense templates
-- that finalize into Actual when the operational month is open.
--
-- Application flow (generate.ts): create draft expense → finalizeExpense → insert run.
-- The unconditional draft-only guard rejected finalized expenses on run INSERT.
--
-- This migration narrows the guard: vendor bills and billing records stay draft-only;
-- expenses may be finalized only when the parent template has auto_finalize_expense.

CREATE OR REPLACE FUNCTION app.recurring_financial_draft_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  draft_status text;
  draft_kind text;
  draft_auto_finalize boolean;
  entity_status text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'recurring_financial_draft_runs' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generation history is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT app.is_org_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT d.status, d.draft_kind, d.auto_finalize_expense
    INTO draft_status, draft_kind, draft_auto_finalize
    FROM public.recurring_financial_drafts d
   WHERE d.id = NEW.draft_id
     AND d.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: draft not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF draft_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: draft must be active to generate'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF draft_kind IS DISTINCT FROM NEW.generated_entity_type THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity type must match draft kind'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.generated_entity_type = 'expense' THEN
    SELECT e.status INTO entity_status
      FROM public.expenses e
     WHERE e.id = NEW.generated_entity_id
       AND e.organization_id = NEW.organization_id
     FOR UPDATE;
  ELSIF NEW.generated_entity_type = 'vendor_bill' THEN
    SELECT b.status INTO entity_status
      FROM public.ap_bills b
     WHERE b.id = NEW.generated_entity_id
       AND b.organization_id = NEW.organization_id
     FOR UPDATE;
  ELSIF NEW.generated_entity_type = 'billing_record' THEN
    SELECT r.status INTO entity_status
      FROM public.billing_records r
     WHERE r.id = NEW.generated_entity_id
       AND r.organization_id = NEW.organization_id
     FOR UPDATE;
  END IF;

  IF entity_status IS NULL THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity must exist in the same organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF entity_status IS DISTINCT FROM 'draft' THEN
    IF entity_status = 'finalized'
       AND NEW.generated_entity_type = 'expense'
       AND COALESCE(draft_auto_finalize, false) = true THEN
      -- Automatic recurring expense: run may link to finalized Actual.
      NULL;
    ELSE
      RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity must remain draft'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.recurring_financial_draft_runs_guard() IS
  'Guards recurring generation history. Vendor bills and billing records remain draft-only at link time. Expenses may be finalized when auto_finalize_expense is true on the parent template.';
