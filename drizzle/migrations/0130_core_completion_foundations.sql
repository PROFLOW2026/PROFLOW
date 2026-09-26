-- 0130: Core completion foundations (cash follow-up, progress weights, margin snapshots, PO cash date, per-entity storage folders).
-- Migration after 0129. Do not modify migrations 0000–0129.
-- Additive only. No backfill. No destructive change. Existing rows keep current behavior via defaults and nulls.
--
-- DO NOT APPLY without explicit Owner approval.

--------------------------------------------------------------------------------
-- 1. Collections follow-up on a billing record (operational, not financial truth)
--------------------------------------------------------------------------------

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS collection_contacted_at date,
  ADD COLUMN IF NOT EXISTS collection_next_follow_up_at date,
  ADD COLUMN IF NOT EXISTS collection_promise_to_pay_date date,
  ADD COLUMN IF NOT EXISTS collection_note text;

COMMENT ON COLUMN public.billing_records.collection_contacted_at IS
  'Last owner contact about this receivable. Does not change billed, paid, or outstanding.';
COMMENT ON COLUMN public.billing_records.collection_next_follow_up_at IS
  'Next collection follow-up date. Not a due date and not cash.';
COMMENT ON COLUMN public.billing_records.collection_promise_to_pay_date IS
  'Customer promised payment date. Does not move the invoice due date.';
COMMENT ON COLUMN public.billing_records.collection_note IS
  'Short collection note. Not a financial adjustment.';

--------------------------------------------------------------------------------
-- 2. Project progress source (manual stays the default)
--------------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS progress_source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_progress_source_known;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_progress_source_known CHECK (
    progress_source IN ('manual', 'tasks')
  );

COMMENT ON COLUMN public.projects.progress_source IS
  'manual = stored progress_percent. tasks = display percent derived from contributing tasks. Switching modes must not erase progress_percent.';

--------------------------------------------------------------------------------
-- 3. Tasks that optionally contribute to project progress
--------------------------------------------------------------------------------

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS contributes_to_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progress_weight numeric(8, 2);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_progress_weight_non_negative;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_progress_weight_non_negative CHECK (
    progress_weight IS NULL OR progress_weight >= 0
  );

COMMENT ON COLUMN public.tasks.contributes_to_progress IS
  'When true and the task has a project, done status counts toward derived project progress. Default false so existing tasks do not move progress.';
COMMENT ON COLUMN public.tasks.progress_weight IS
  'Relative weight among contributing tasks. Null is treated as 1 by the application. Not money.';

--------------------------------------------------------------------------------
-- 4. Optional expected cash date on a purchase order (commitments stay undated when null)
--------------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS expected_cash_date date;

COMMENT ON COLUMN public.purchase_orders.expected_cash_date IS
  'Optional expected cash-out date for the open commitment. Null must stay undated in cash forecast. Not an expense and not actual cost.';

--------------------------------------------------------------------------------
-- 5. Monthly margin snapshots (derived cache, not a second profit engine)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_margin_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  year_month text NOT NULL,
  currency char(3) NOT NULL,
  contract_value numeric(18, 6) NOT NULL,
  actual_cost numeric(18, 6) NOT NULL,
  forecast_cost numeric(18, 6) NOT NULL,
  actual_margin numeric(18, 6),
  forecast_margin numeric(18, 6),
  actual_margin_percent numeric(8, 4),
  forecast_margin_percent numeric(8, 4),
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_margin_snapshots_org_project_month_uq UNIQUE (organization_id, project_id, year_month),
  CONSTRAINT project_margin_snapshots_year_month_shape CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE INDEX IF NOT EXISTS project_margin_snapshots_org_month_idx
  ON public.project_margin_snapshots (organization_id, year_month);

COMMENT ON TABLE public.project_margin_snapshots IS
  'Monthly snapshot of already-composed project profit. Not a ledger. Do not use it as Actual or as cash.';

ALTER TABLE public.project_margin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_margin_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_margin_snapshots_select ON public.project_margin_snapshots;
CREATE POLICY project_margin_snapshots_select ON public.project_margin_snapshots
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_financials.read')
  );

DROP POLICY IF EXISTS project_margin_snapshots_insert ON public.project_margin_snapshots;
CREATE POLICY project_margin_snapshots_insert ON public.project_margin_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_financials.read')
  );

DROP POLICY IF EXISTS project_margin_snapshots_update ON public.project_margin_snapshots;
CREATE POLICY project_margin_snapshots_update ON public.project_margin_snapshots
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_financials.read')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_financials.read')
  );

DROP POLICY IF EXISTS project_margin_snapshots_service_all ON public.project_margin_snapshots;
CREATE POLICY project_margin_snapshots_service_all ON public.project_margin_snapshots
  AS PERMISSIVE
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_margin_snapshots TO authenticated;

--------------------------------------------------------------------------------
-- 6. Per-vendor and per-employee storage folders
--------------------------------------------------------------------------------

ALTER TABLE public.storage_folder_mappings
  DROP CONSTRAINT IF EXISTS storage_folder_mappings_semantic_known;

-- Collection follow-up is not money. Closed months may update these columns only.
DROP TRIGGER IF EXISTS billing_records_closed_period_guard ON public.billing_records;
CREATE TRIGGER billing_records_closed_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.closed_period_rewrite_guard(
    'issue_date',
    'status',
    'draft',
    'collection_contacted_at,collection_next_follow_up_at,collection_promise_to_pay_date,collection_note'
  );

ALTER TABLE public.storage_folder_mappings
  ADD CONSTRAINT storage_folder_mappings_semantic_known CHECK (
    semantic_folder_type IN (
      'organization_root',
      'clients_root',
      'client_root',
      'projects_root',
      'project_root',
      'quotes',
      'contracts',
      'billing',
      'vendor_invoices',
      'plans',
      'photos',
      'documents',
      'general_files',
      'vendors_root',
      'vendor_root',
      'employees_root',
      'employee_root',
      'organization_documents'
    )
  );
