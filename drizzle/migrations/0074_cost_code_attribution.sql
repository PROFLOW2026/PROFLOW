-- 0074: Optional cost_code_id on expense and AP bill headers.
--
-- Attribution already lives on expense_allocations / ap_bill_lines (0060).
-- Header columns are nullable defaults so a header tag is not dropped when
-- the line/allocation is untagged. Owner must apply; this file is not applied
-- by the agent.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_cost_code_org_fk;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS expenses_cost_code_kind_trg ON public.expenses;
CREATE TRIGGER expenses_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.ap_bills
  DROP CONSTRAINT IF EXISTS ap_bills_cost_code_org_fk;
ALTER TABLE public.ap_bills
  ADD CONSTRAINT ap_bills_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS ap_bills_cost_code_kind_trg ON public.ap_bills;
CREATE TRIGGER ap_bills_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();
