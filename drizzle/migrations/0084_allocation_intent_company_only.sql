-- Allocation intent: explicit project / auto pool / company-only (Wave company-cost closure)

DO $$ BEGIN
  CREATE TYPE allocation_intent AS ENUM ('project_allocate', 'auto_pool', 'company_only');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Expenses: how general/overhead cost should be recognized at org vs project level
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS allocation_intent allocation_intent NOT NULL DEFAULT 'auto_pool';

-- Historical backfill (conservative: preserve existing auto-pool behavior).
-- Unmatched rows keep DEFAULT 'auto_pool' — never guess company_only.
UPDATE expenses e
SET allocation_intent = 'project_allocate'
WHERE e.project_id IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM expense_allocations a
     WHERE a.expense_id = e.id
       AND a.organization_id = e.organization_id
       AND a.project_id IS NOT NULL
   );

UPDATE expenses e
SET allocation_intent = 'company_only'
WHERE e.project_id IS NULL
  AND EXISTS (
    SELECT 1 FROM expense_allocations a
    WHERE a.expense_id = e.id
      AND a.organization_id = e.organization_id
      AND a.target_type = 'overhead'
  )
  AND NOT EXISTS (
    SELECT 1 FROM expense_allocations a
    WHERE a.expense_id = e.id
      AND a.organization_id = e.organization_id
      AND a.project_id IS NOT NULL
  );

-- Owner / manager compensation classification (workforce entity, not login role)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS compensation_class text NOT NULL DEFAULT 'standard';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS default_labor_allocation_intent allocation_intent NOT NULL DEFAULT 'auto_pool';

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_compensation_class_known;
ALTER TABLE employees
  ADD CONSTRAINT employees_compensation_class_known
  CHECK (compensation_class IN ('standard', 'owner_manager'));

-- Monthly labor runs: explicit company-only portion (excluded from GCM auto-pool)
ALTER TABLE labor_allocation_runs
  ADD COLUMN IF NOT EXISTS company_only_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE labor_allocation_runs DROP CONSTRAINT IF EXISTS labor_allocation_runs_amounts_non_negative;
ALTER TABLE labor_allocation_runs
  ADD CONSTRAINT labor_allocation_runs_amounts_non_negative
  CHECK (
    allocated_amount >= 0
    AND unallocated_amount >= 0
    AND company_only_amount >= 0
  );

-- AP bills: explicit intent for under-allocated remainder (default = auto_pool)
ALTER TABLE ap_bills
  ADD COLUMN IF NOT EXISTS remainder_allocation_intent allocation_intent NOT NULL DEFAULT 'auto_pool';

-- Historical AP under-alloc remainder behaved as auto-pool (GCM)
UPDATE ap_bills b
SET remainder_allocation_intent = 'auto_pool'
WHERE b.remainder_allocation_intent IS NULL
  AND b.status IN ('open', 'partially_matched', 'matched')
  AND EXISTS (
    SELECT 1 FROM ap_bill_project_allocations a
    WHERE a.ap_bill_id = b.id
      AND a.organization_id = b.organization_id
      AND a.status = 'applied'
      AND a.target_type = 'project'
  )
  AND (
    COALESCE(b.net_amount, b.total_amount)::numeric
    - COALESCE((
        SELECT SUM(a.amount::numeric)
        FROM ap_bill_project_allocations a
        WHERE a.ap_bill_id = b.id
          AND a.organization_id = b.organization_id
          AND a.status = 'applied'
          AND a.target_type = 'project'
      ), 0)
  ) > 0.01;

-- Extend general_cost_month_sources source_kind check (0069) for company-only atoms
ALTER TABLE general_cost_month_sources DROP CONSTRAINT IF EXISTS general_cost_month_sources_kind_known;
ALTER TABLE general_cost_month_sources
  ADD CONSTRAINT general_cost_month_sources_kind_known
  CHECK (source_kind IN (
    'expense_unallocated',
    'expense_company_only',
    'labor_monthly_unallocated',
    'labor_company_only',
    'labor_non_project',
    'ap_bill_remainder',
    'ap_bill_remainder_company_only',
    'ap_bill_null_project',
    'inventory_writeoff',
    'other'
  ));
