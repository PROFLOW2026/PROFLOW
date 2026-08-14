-- 0032_boq_progress_billing
-- Additive only. Does NOT edit 0000–0031 (APPLIED + IMMUTABLE).
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Optional BOQ / physical progress / progress billing vertical.
-- BOQ Progress ≠ Actual. Billing uses existing billing_records + retention.
-- External portal remains disabled / untouched.

--------------------------------------------------------------------------------
-- 1) Permissions
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('boq.read', 'commercial', 'View bill of quantities and progress'),
  ('boq.manage', 'commercial', 'Create and manage BOQ baselines and items'),
  ('boq.progress.submit', 'commercial', 'Submit BOQ measurement quantities'),
  ('boq.progress.approve', 'commercial', 'Approve BOQ progress batches'),
  ('boq.billing.create', 'billing', 'Create progress billing from approved BOQ progress')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'boq.read'),
    ('owner', 'boq.manage'),
    ('owner', 'boq.progress.submit'),
    ('owner', 'boq.progress.approve'),
    ('owner', 'boq.billing.create'),
    ('manager', 'boq.read'),
    ('manager', 'boq.manage'),
    ('manager', 'boq.progress.submit'),
    ('manager', 'boq.progress.approve'),
    ('manager', 'boq.billing.create'),
    ('finance', 'boq.read'),
    ('finance', 'boq.billing.create'),
    ('finance', 'boq.progress.approve'),
    ('worker', 'boq.read'),
    ('worker', 'boq.progress.submit')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 1b) Composite uniqueness prerequisites for same-org FKs
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS change_orders_id_organization_id_uq
  ON public.change_orders (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_engagements_id_organization_id_uq
  ON public.vendor_engagements (id, organization_id);

--------------------------------------------------------------------------------
-- 2) Core tables
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_boqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  title text,
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL,
  notes text,
  progress_mode text NOT NULL DEFAULT 'simple',
  activated_at timestamptz,
  activated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  superseded_by_boq_id uuid,
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT project_boqs_status_known CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  CONSTRAINT project_boqs_progress_mode_known CHECK (progress_mode IN ('simple', 'advanced'))
);

CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_id_organization_id_uq
  ON public.project_boqs (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_project_version_uq
  ON public.project_boqs (organization_id, project_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_one_active_per_project_uq
  ON public.project_boqs (organization_id, project_id)
  WHERE status = 'active' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS project_boqs_org_project_idx
  ON public.project_boqs (organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_boqs_project_org_fk') THEN
    ALTER TABLE public.project_boqs
      ADD CONSTRAINT project_boqs_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_boqs_supersede_org_fk') THEN
    ALTER TABLE public.project_boqs
      ADD CONSTRAINT project_boqs_supersede_org_fk
      FOREIGN KEY (superseded_by_boq_id, organization_id)
      REFERENCES public.project_boqs (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  boq_id uuid NOT NULL REFERENCES public.project_boqs (id) ON DELETE CASCADE,
  parent_id uuid,
  node_kind text NOT NULL,
  item_code text,
  description text NOT NULL,
  unit text,
  pricing_type text NOT NULL DEFAULT 'quantity_unit_price',
  original_quantity numeric(18,6) NOT NULL DEFAULT 0,
  original_unit_price numeric(18,6) NOT NULL DEFAULT 0,
  original_amount numeric(18,6) NOT NULL DEFAULT 0,
  current_quantity numeric(18,6) NOT NULL DEFAULT 0,
  current_unit_price numeric(18,6) NOT NULL DEFAULT 0,
  current_amount numeric(18,6) NOT NULL DEFAULT 0,
  opening_approved_quantity numeric(18,6) NOT NULL DEFAULT 0,
  opening_billed_quantity numeric(18,6) NOT NULL DEFAULT 0,
  work_package_id uuid REFERENCES public.work_packages (id) ON DELETE SET NULL,
  cost_category_id uuid REFERENCES public.cost_categories (id) ON DELETE SET NULL,
  budget_line_id uuid REFERENCES public.project_budget_lines (id) ON DELETE SET NULL,
  source_change_order_id uuid REFERENCES public.change_orders (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT boq_nodes_kind_known CHECK (node_kind IN ('chapter', 'item')),
  CONSTRAINT boq_nodes_pricing_known CHECK (pricing_type IN ('quantity_unit_price', 'lump_sum')),
  CONSTRAINT boq_nodes_status_known CHECK (status IN ('active', 'cancelled', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_nodes_id_organization_id_uq
  ON public.boq_nodes (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_nodes_boq_item_code_uq
  ON public.boq_nodes (boq_id, item_code)
  WHERE item_code IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS boq_nodes_boq_parent_idx ON public.boq_nodes (boq_id, parent_id);
CREATE INDEX IF NOT EXISTS boq_nodes_org_boq_idx ON public.boq_nodes (organization_id, boq_id);
CREATE INDEX IF NOT EXISTS boq_nodes_item_code_idx ON public.boq_nodes (organization_id, item_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_nodes_boq_org_fk') THEN
    ALTER TABLE public.boq_nodes
      ADD CONSTRAINT boq_nodes_boq_org_fk
      FOREIGN KEY (boq_id, organization_id)
      REFERENCES public.project_boqs (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_nodes_parent_org_fk') THEN
    ALTER TABLE public.boq_nodes
      ADD CONSTRAINT boq_nodes_parent_org_fk
      FOREIGN KEY (parent_id, organization_id)
      REFERENCES public.boq_nodes (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_change_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  boq_id uuid NOT NULL REFERENCES public.project_boqs (id) ON DELETE CASCADE,
  change_order_id uuid NOT NULL REFERENCES public.change_orders (id) ON DELETE RESTRICT,
  boq_node_id uuid REFERENCES public.boq_nodes (id) ON DELETE SET NULL,
  allocation_kind text NOT NULL,
  quantity_delta numeric(18,6) NOT NULL DEFAULT 0,
  unit_price_delta numeric(18,6) NOT NULL DEFAULT 0,
  amount_delta numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT boq_change_allocations_kind_known CHECK (allocation_kind IN (
    'quantity_change', 'unit_price_change', 'new_item', 'lump_sum', 'unallocated_contract'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_change_allocations_id_org_uq
  ON public.boq_change_allocations (id, organization_id);
CREATE INDEX IF NOT EXISTS boq_change_allocations_boq_idx ON public.boq_change_allocations (boq_id);
CREATE INDEX IF NOT EXISTS boq_change_allocations_co_idx ON public.boq_change_allocations (change_order_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_boq_org_fk') THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_boq_org_fk
      FOREIGN KEY (boq_id, organization_id)
      REFERENCES public.project_boqs (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_change_allocations_co_org_fk') THEN
    ALTER TABLE public.boq_change_allocations
      ADD CONSTRAINT boq_change_allocations_co_org_fk
      FOREIGN KEY (change_order_id, organization_id)
      REFERENCES public.change_orders (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_progress_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  boq_id uuid NOT NULL REFERENCES public.project_boqs (id) ON DELETE RESTRICT,
  certificate_number integer NOT NULL,
  period_label text NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  supersedes_batch_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT boq_progress_batches_status_known CHECK (
    status IN ('draft', 'approved', 'billed', 'superseded', 'voided')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_batches_id_org_uq
  ON public.boq_progress_batches (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_batches_boq_cert_uq
  ON public.boq_progress_batches (boq_id, certificate_number);
CREATE INDEX IF NOT EXISTS boq_progress_batches_project_idx
  ON public.boq_progress_batches (organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_batches_project_org_fk') THEN
    ALTER TABLE public.boq_progress_batches
      ADD CONSTRAINT boq_progress_batches_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_batches_boq_org_fk') THEN
    ALTER TABLE public.boq_progress_batches
      ADD CONSTRAINT boq_progress_batches_boq_org_fk
      FOREIGN KEY (boq_id, organization_id)
      REFERENCES public.project_boqs (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_batches_supersede_org_fk') THEN
    ALTER TABLE public.boq_progress_batches
      ADD CONSTRAINT boq_progress_batches_supersede_org_fk
      FOREIGN KEY (supersedes_batch_id, organization_id)
      REFERENCES public.boq_progress_batches (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_progress_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.boq_progress_batches (id) ON DELETE CASCADE,
  boq_node_id uuid NOT NULL REFERENCES public.boq_nodes (id) ON DELETE RESTRICT,
  previous_approved_quantity numeric(18,6) NOT NULL DEFAULT 0,
  measured_quantity numeric(18,6) NOT NULL DEFAULT 0,
  approved_quantity numeric(18,6) NOT NULL DEFAULT 0,
  unit_price_snapshot numeric(18,6) NOT NULL,
  period_amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_lines_id_org_uq
  ON public.boq_progress_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_lines_batch_node_uq
  ON public.boq_progress_lines (batch_id, boq_node_id);
CREATE INDEX IF NOT EXISTS boq_progress_lines_node_idx ON public.boq_progress_lines (boq_node_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_lines_batch_org_fk') THEN
    ALTER TABLE public.boq_progress_lines
      ADD CONSTRAINT boq_progress_lines_batch_org_fk
      FOREIGN KEY (batch_id, organization_id)
      REFERENCES public.boq_progress_batches (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_lines_node_org_fk') THEN
    ALTER TABLE public.boq_progress_lines
      ADD CONSTRAINT boq_progress_lines_node_org_fk
      FOREIGN KEY (boq_node_id, organization_id)
      REFERENCES public.boq_nodes (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_progress_billing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  progress_batch_id uuid NOT NULL REFERENCES public.boq_progress_batches (id) ON DELETE RESTRICT,
  billing_record_id uuid NOT NULL REFERENCES public.billing_records (id) ON DELETE RESTRICT,
  period_net_amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_billing_links_batch_uq
  ON public.boq_progress_billing_links (progress_batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_billing_links_billing_uq
  ON public.boq_progress_billing_links (billing_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_progress_billing_links_id_org_uq
  ON public.boq_progress_billing_links (id, organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_billing_links_batch_org_fk') THEN
    ALTER TABLE public.boq_progress_billing_links
      ADD CONSTRAINT boq_progress_billing_links_batch_org_fk
      FOREIGN KEY (progress_batch_id, organization_id)
      REFERENCES public.boq_progress_batches (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_progress_billing_links_billing_org_fk') THEN
    ALTER TABLE public.boq_progress_billing_links
      ADD CONSTRAINT boq_progress_billing_links_billing_org_fk
      FOREIGN KEY (billing_record_id, organization_id)
      REFERENCES public.billing_records (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 3) Subcontractor schedule / valuation (cost side foundation)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boq_subcontractor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  boq_id uuid NOT NULL REFERENCES public.project_boqs (id) ON DELETE RESTRICT,
  vendor_engagement_id uuid NOT NULL REFERENCES public.vendor_engagements (id) ON DELETE RESTRICT,
  title text,
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL,
  notes text,
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT boq_sub_schedules_status_known CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_schedules_id_org_uq
  ON public.boq_subcontractor_schedules (id, organization_id);
CREATE INDEX IF NOT EXISTS boq_sub_schedules_project_idx
  ON public.boq_subcontractor_schedules (organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedules_project_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_schedules
      ADD CONSTRAINT boq_sub_schedules_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedules_boq_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_schedules
      ADD CONSTRAINT boq_sub_schedules_boq_org_fk
      FOREIGN KEY (boq_id, organization_id)
      REFERENCES public.project_boqs (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedules_engagement_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_schedules
      ADD CONSTRAINT boq_sub_schedules_engagement_org_fk
      FOREIGN KEY (vendor_engagement_id, organization_id)
      REFERENCES public.vendor_engagements (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_subcontractor_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.boq_subcontractor_schedules (id) ON DELETE CASCADE,
  boq_node_id uuid NOT NULL REFERENCES public.boq_nodes (id) ON DELETE RESTRICT,
  unit text,
  agreed_quantity numeric(18,6) NOT NULL DEFAULT 0,
  unit_rate numeric(18,6) NOT NULL DEFAULT 0,
  amount numeric(18,6) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_schedule_lines_id_org_uq
  ON public.boq_subcontractor_schedule_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_schedule_lines_sched_node_uq
  ON public.boq_subcontractor_schedule_lines (schedule_id, boq_node_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_schedule_lines_sched_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_schedule_lines
      ADD CONSTRAINT boq_sub_schedule_lines_sched_org_fk
      FOREIGN KEY (schedule_id, organization_id)
      REFERENCES public.boq_subcontractor_schedules (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_subcontractor_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.boq_subcontractor_schedules (id) ON DELETE RESTRICT,
  period_label text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  proposed_vendor_bill_id uuid,
  notes text,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT boq_sub_valuations_status_known CHECK (
    status IN ('draft', 'approved', 'proposed_ap', 'voided')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_valuations_id_org_uq
  ON public.boq_subcontractor_valuations (id, organization_id);
CREATE INDEX IF NOT EXISTS boq_sub_valuations_schedule_idx
  ON public.boq_subcontractor_valuations (schedule_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_valuations_sched_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_valuations
      ADD CONSTRAINT boq_sub_valuations_sched_org_fk
      FOREIGN KEY (schedule_id, organization_id)
      REFERENCES public.boq_subcontractor_schedules (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_subcontractor_valuation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  valuation_id uuid NOT NULL REFERENCES public.boq_subcontractor_valuations (id) ON DELETE CASCADE,
  schedule_line_id uuid NOT NULL REFERENCES public.boq_subcontractor_schedule_lines (id) ON DELETE RESTRICT,
  previous_approved_quantity numeric(18,6) NOT NULL DEFAULT 0,
  approved_quantity numeric(18,6) NOT NULL DEFAULT 0,
  unit_rate_snapshot numeric(18,6) NOT NULL,
  period_amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_valuation_lines_id_org_uq
  ON public.boq_subcontractor_valuation_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS boq_sub_valuation_lines_val_line_uq
  ON public.boq_subcontractor_valuation_lines (valuation_id, schedule_line_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_sub_valuation_lines_val_org_fk') THEN
    ALTER TABLE public.boq_subcontractor_valuation_lines
      ADD CONSTRAINT boq_sub_valuation_lines_val_org_fk
      FOREIGN KEY (valuation_id, organization_id)
      REFERENCES public.boq_subcontractor_valuations (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 4) Baseline immutability guard (active BOQ originals)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.boq_nodes_protect_originals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  boq_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO boq_status
      FROM public.project_boqs
     WHERE id = NEW.boq_id
       AND organization_id = NEW.organization_id;
    IF boq_status IN ('active', 'superseded', 'archived') THEN
      IF NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
         OR NEW.original_unit_price IS DISTINCT FROM OLD.original_unit_price
         OR NEW.original_amount IS DISTINCT FROM OLD.original_amount THEN
        RAISE EXCEPTION 'boq_nodes: original values are immutable after BOQ activation'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_nodes_protect_originals_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_protect_originals_trg
  BEFORE UPDATE ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_protect_originals();

--------------------------------------------------------------------------------
-- 5) RLS + FORCE RLS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'project_boqs',
    'boq_nodes',
    'boq_change_allocations',
    'boq_progress_batches',
    'boq_progress_lines',
    'boq_progress_billing_links',
    'boq_subcontractor_schedules',
    'boq_subcontractor_schedule_lines',
    'boq_subcontractor_valuations',
    'boq_subcontractor_valuation_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END $$;

-- project_boqs
CREATE POLICY project_boqs_tenant_select ON public.project_boqs
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY project_boqs_tenant_insert ON public.project_boqs
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY project_boqs_tenant_update ON public.project_boqs
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY project_boqs_tenant_delete ON public.project_boqs
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY project_boqs_service_all ON public.project_boqs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boq_nodes
CREATE POLICY boq_nodes_tenant_select ON public.boq_nodes
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_nodes_tenant_insert ON public.boq_nodes
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_nodes_tenant_update ON public.boq_nodes
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  );
CREATE POLICY boq_nodes_tenant_delete ON public.boq_nodes
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_nodes_service_all ON public.boq_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boq_change_allocations
CREATE POLICY boq_change_allocations_tenant_select ON public.boq_change_allocations
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_change_allocations_tenant_insert ON public.boq_change_allocations
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_change_allocations_tenant_update ON public.boq_change_allocations
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_change_allocations_tenant_delete ON public.boq_change_allocations
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_change_allocations_service_all ON public.boq_change_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boq_progress_batches
CREATE POLICY boq_progress_batches_tenant_select ON public.boq_progress_batches
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_progress_batches_tenant_insert ON public.boq_progress_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  );
CREATE POLICY boq_progress_batches_tenant_update ON public.boq_progress_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
  );
CREATE POLICY boq_progress_batches_tenant_delete ON public.boq_progress_batches
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_progress_batches_service_all ON public.boq_progress_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boq_progress_lines
CREATE POLICY boq_progress_lines_tenant_select ON public.boq_progress_lines
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_progress_lines_tenant_insert ON public.boq_progress_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
    )
  );
CREATE POLICY boq_progress_lines_tenant_update ON public.boq_progress_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.manage')
      OR app.has_org_permission(organization_id, 'boq.progress.submit')
      OR app.has_org_permission(organization_id, 'boq.progress.approve')
    )
  );
CREATE POLICY boq_progress_lines_tenant_delete ON public.boq_progress_lines
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_progress_lines_service_all ON public.boq_progress_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boq_progress_billing_links
CREATE POLICY boq_progress_billing_links_tenant_select ON public.boq_progress_billing_links
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'boq.read')
      OR app.has_org_permission(organization_id, 'billing.read')
    )
  );
CREATE POLICY boq_progress_billing_links_tenant_insert ON public.boq_progress_billing_links
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'boq.billing.create')
  );
CREATE POLICY boq_progress_billing_links_tenant_update ON public.boq_progress_billing_links
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
CREATE POLICY boq_progress_billing_links_tenant_delete ON public.boq_progress_billing_links
  FOR DELETE TO authenticated
  USING (false);
CREATE POLICY boq_progress_billing_links_service_all ON public.boq_progress_billing_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontractor schedules / valuations (reuse boq.manage / boq.read)
CREATE POLICY boq_sub_schedules_tenant_select ON public.boq_subcontractor_schedules
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_sub_schedules_tenant_write ON public.boq_subcontractor_schedules
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_sub_schedules_service_all ON public.boq_subcontractor_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY boq_sub_schedule_lines_tenant_select ON public.boq_subcontractor_schedule_lines
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_sub_schedule_lines_tenant_write ON public.boq_subcontractor_schedule_lines
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_sub_schedule_lines_service_all ON public.boq_subcontractor_schedule_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY boq_sub_valuations_tenant_select ON public.boq_subcontractor_valuations
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_sub_valuations_tenant_write ON public.boq_subcontractor_valuations
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_sub_valuations_service_all ON public.boq_subcontractor_valuations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY boq_sub_valuation_lines_tenant_select ON public.boq_subcontractor_valuation_lines
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.read'));
CREATE POLICY boq_sub_valuation_lines_tenant_write ON public.boq_subcontractor_valuation_lines
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'boq.manage'));
CREATE POLICY boq_sub_valuation_lines_service_all ON public.boq_subcontractor_valuation_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);
