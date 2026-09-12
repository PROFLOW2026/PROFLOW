-- 0084 added company_only_amount; conservation guard must include it.

CREATE OR REPLACE FUNCTION app.labor_allocation_runs_conservation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  known numeric(18, 6);
  line_sum numeric(18, 6);
BEGIN
  IF NEW.status <> 'applied' THEN
    RETURN NEW;
  END IF;

  SELECT m.known_amount INTO known
  FROM public.employee_month_costs m
  WHERE m.id = NEW.employee_month_cost_id
    AND m.organization_id = NEW.organization_id;

  IF known IS NULL THEN
    RAISE EXCEPTION 'labor_allocation_runs_month_missing'
      USING ERRCODE = '23503';
  END IF;

  IF (NEW.allocated_amount + NEW.unallocated_amount + NEW.company_only_amount) <> known THEN
    RAISE EXCEPTION 'labor_allocation_runs_conservation_failed'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(l.amount), 0) INTO line_sum
  FROM public.labor_allocation_run_lines l
  WHERE l.labor_allocation_run_id = NEW.id
    AND l.organization_id = NEW.organization_id;

  IF line_sum <> NEW.allocated_amount THEN
    RAISE EXCEPTION 'labor_allocation_runs_lines_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_conservation_guard ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_conservation_guard
  BEFORE INSERT OR UPDATE OF status, allocated_amount, unallocated_amount, company_only_amount, employee_month_cost_id
  ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_runs_conservation_guard();
