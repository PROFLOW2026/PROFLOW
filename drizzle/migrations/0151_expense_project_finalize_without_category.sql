-- 0151: Allow finalizing project-attributed expenses without a cost category.
-- Project routing (single project or multi-project allocation lines) is sufficient;
-- category remains optional for classification/reporting only.
-- PREPARED ONLY — Owner applies via npm run db:migrate after review.

CREATE OR REPLACE FUNCTION app.expense_has_project_attribution(
  p_expense_id uuid,
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    p_project_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.expense_allocations ea
      WHERE ea.expense_id = p_expense_id
        AND ea.organization_id = p_organization_id
        AND ea.target_type = 'project'
        AND ea.project_id IS NOT NULL
    );
$fn$;

CREATE OR REPLACE FUNCTION app.assert_expense_recognition_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.status = 'finalized'
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'finalized')
     ) THEN
    IF app.next_gen_latch_held('expense_correction')
       AND NEW.voids_expense_id IS NOT NULL THEN
      PERFORM app.validate_expense_reversal_correlation(NEW);
      RETURN NEW;
    END IF;

    IF NEW.cost_category_id IS NULL
       AND app.expense_has_project_attribution(NEW.id, NEW.organization_id, NEW.project_id) THEN
      RETURN NEW;
    END IF;

    IF NEW.classification_status IS DISTINCT FROM 'classified'
       OR NEW.cost_category_id IS NULL THEN
      RAISE EXCEPTION 'finalized expense requires classified transaction category'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
