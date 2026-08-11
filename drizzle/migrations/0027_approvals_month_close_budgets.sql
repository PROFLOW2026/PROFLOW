-- 0027_approvals_month_close_budgets
-- Optional operational close + lightweight approvals + budgets.
-- Actual/Forecast remain ONE financial engine. UNAPPLIED draft.

CREATE TABLE IF NOT EXISTS public.approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  entity_type text NOT NULL,
  threshold_amount numeric(18,6),
  currency char(3),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT approval_rules_entity_known CHECK (entity_type IN ('expense','vendor_bill','purchase_order','vendor_credit','time_correction','quote_discount','budget_revision'))
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_rules_id_organization_id_uq ON public.approval_rules (id, organization_id);
CREATE INDEX IF NOT EXISTS approval_rules_org_entity_idx ON public.approval_rules (organization_id, entity_type);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rule_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  amount numeric(18,6),
  currency char(3),
  status text NOT NULL DEFAULT 'submitted',
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT approval_requests_status_known CHECK (status IN ('submitted','approved','rejected','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_id_organization_id_uq ON public.approval_requests (id, organization_id);
CREATE INDEX IF NOT EXISTS approval_requests_org_status_idx ON public.approval_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS approval_requests_org_entity_idx ON public.approval_requests (organization_id, entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_one_submitted_per_entity_uq
  ON public.approval_requests (organization_id, entity_type, entity_id)
  WHERE status = 'submitted';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_rule_org_fk') THEN
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_rule_org_fk
      FOREIGN KEY (rule_id, organization_id)
      REFERENCES public.approval_rules (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.month_close_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  year_month text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  completeness_percent numeric(9,6),
  completeness_snapshot jsonb,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT month_close_periods_status_known CHECK (status IN ('open','ready','closed')),
  CONSTRAINT month_close_periods_ym_format CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT month_close_periods_completeness_range CHECK (
    completeness_percent IS NULL
    OR (completeness_percent >= 0 AND completeness_percent <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS month_close_periods_org_ym_uq ON public.month_close_periods (organization_id, year_month);
CREATE UNIQUE INDEX IF NOT EXISTS month_close_periods_id_organization_id_uq ON public.month_close_periods (id, organization_id);

CREATE TABLE IF NOT EXISTS public.month_close_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  adjustment_type text NOT NULL DEFAULT 'correction',
  reason text NOT NULL,
  entity_type text,
  entity_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT month_close_adjustments_type_known CHECK (adjustment_type IN ('correction','supersede','adjustment'))
);

CREATE INDEX IF NOT EXISTS month_close_adjustments_period_idx ON public.month_close_adjustments (period_id);
CREATE UNIQUE INDEX IF NOT EXISTS month_close_adjustments_id_organization_id_uq ON public.month_close_adjustments (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'month_close_adjustments_period_org_fk') THEN
    ALTER TABLE public.month_close_adjustments
      ADD CONSTRAINT month_close_adjustments_period_org_fk
      FOREIGN KEY (period_id, organization_id)
      REFERENCES public.month_close_periods (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Budget',
  status text NOT NULL DEFAULT 'active',
  currency char(3) NOT NULL,
  total_budget_amount numeric(18,6),
  current_revision_number integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT project_budgets_status_known CHECK (status IN ('draft','active','superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS project_budgets_id_organization_id_uq ON public.project_budgets (id, organization_id);
CREATE INDEX IF NOT EXISTS project_budgets_org_project_idx ON public.project_budgets (organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS work_packages_id_organization_id_uq
  ON public.work_packages (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budgets_project_org_fk') THEN
    ALTER TABLE public.project_budgets
      ADD CONSTRAINT project_budgets_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  budget_id uuid NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  line_type text NOT NULL DEFAULT 'total',
  category_key text,
  work_package_id uuid,
  discipline_key text,
  cost_code text,
  label text NOT NULL,
  budget_amount numeric(18,6) NOT NULL,
  etc_amount numeric(18,6),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT project_budget_lines_type_known CHECK (line_type IN ('total','category','work_package','discipline','cost_code'))
);

CREATE INDEX IF NOT EXISTS project_budget_lines_budget_rev_idx ON public.project_budget_lines (budget_id, revision_number);
CREATE UNIQUE INDEX IF NOT EXISTS project_budget_lines_id_organization_id_uq ON public.project_budget_lines (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budget_lines_budget_org_fk') THEN
    ALTER TABLE public.project_budget_lines
      ADD CONSTRAINT project_budget_lines_budget_org_fk
      FOREIGN KEY (budget_id, organization_id)
      REFERENCES public.project_budgets (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budget_lines_work_package_org_fk') THEN
    ALTER TABLE public.project_budget_lines
      ADD CONSTRAINT project_budget_lines_work_package_org_fk
      FOREIGN KEY (work_package_id, organization_id)
      REFERENCES public.work_packages (id, organization_id)
      ON DELETE SET NULL (work_package_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  budget_id uuid NOT NULL,
  revision_number integer NOT NULL,
  reason text NOT NULL,
  snapshot_total_amount numeric(18,6),
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_budget_revisions_budget_rev_uq ON public.project_budget_revisions (organization_id, budget_id, revision_number);
CREATE UNIQUE INDEX IF NOT EXISTS project_budget_revisions_id_organization_id_uq ON public.project_budget_revisions (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budget_revisions_budget_org_fk') THEN
    ALTER TABLE public.project_budget_revisions
      ADD CONSTRAINT project_budget_revisions_budget_org_fk
      FOREIGN KEY (budget_id, organization_id)
      REFERENCES public.project_budgets (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_rules_tenant_select ON public.approval_rules
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.read'));

CREATE POLICY approval_rules_tenant_insert ON public.approval_rules
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.manage'));

CREATE POLICY approval_rules_tenant_update ON public.approval_rules
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.manage'));

CREATE POLICY approval_rules_tenant_delete ON public.approval_rules
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.manage'));

CREATE POLICY approval_rules_service_all ON public.approval_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_tenant_select ON public.approval_requests
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'approvals.read'));

CREATE POLICY approval_requests_tenant_insert ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.is_org_member(organization_id));

CREATE POLICY approval_requests_tenant_update ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_org_permission(organization_id, 'approvals.decide')
    OR app.has_org_permission(organization_id, 'approvals.manage')
  ))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_org_permission(organization_id, 'approvals.decide')
    OR app.has_org_permission(organization_id, 'approvals.manage')
  ));

CREATE POLICY approval_requests_service_all ON public.approval_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.month_close_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY month_close_periods_tenant_select ON public.month_close_periods
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.read'));

CREATE POLICY month_close_periods_tenant_insert ON public.month_close_periods
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_periods_tenant_update ON public.month_close_periods
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_periods_tenant_delete ON public.month_close_periods
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_periods_service_all ON public.month_close_periods
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.month_close_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY month_close_adjustments_tenant_select ON public.month_close_adjustments
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.read'));

CREATE POLICY month_close_adjustments_tenant_insert ON public.month_close_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_adjustments_tenant_update ON public.month_close_adjustments
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_adjustments_tenant_delete ON public.month_close_adjustments
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

CREATE POLICY month_close_adjustments_service_all ON public.month_close_adjustments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_budgets_tenant_select ON public.project_budgets
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.read'));

CREATE POLICY project_budgets_tenant_insert ON public.project_budgets
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budgets_tenant_update ON public.project_budgets
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budgets_tenant_delete ON public.project_budgets
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budgets_service_all ON public.project_budgets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_budget_lines_tenant_select ON public.project_budget_lines
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.read'));

CREATE POLICY project_budget_lines_tenant_insert ON public.project_budget_lines
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_lines_tenant_update ON public.project_budget_lines
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_lines_tenant_delete ON public.project_budget_lines
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_lines_service_all ON public.project_budget_lines
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.project_budget_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_budget_revisions_tenant_select ON public.project_budget_revisions
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.read'));

CREATE POLICY project_budget_revisions_tenant_insert ON public.project_budget_revisions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_revisions_tenant_update ON public.project_budget_revisions
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_revisions_tenant_delete ON public.project_budget_revisions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

CREATE POLICY project_budget_revisions_service_all ON public.project_budget_revisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
