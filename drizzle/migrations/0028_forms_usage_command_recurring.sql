-- 0028_forms_usage_command_recurring
-- Field forms, operational usage (NOT Actual), command center state, recurring DRAFTS only.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.

CREATE TABLE IF NOT EXISTS public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  schema_json jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS form_templates_id_organization_id_uq ON public.form_templates (id, organization_id);
CREATE INDEX IF NOT EXISTS form_templates_org_enabled_idx ON public.form_templates (organization_id, enabled);

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  answers_json jsonb,
  acknowledgement_name text,
  acknowledgement_at timestamptz,
  acknowledgement_note text,
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_employee_id uuid,
  submitted_at timestamptz,
  offline_client_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT form_submissions_status_known CHECK (status IN ('draft','submitted','void')),
  CONSTRAINT form_submissions_owner_known CHECK (owner_type IN ('project','job','work_order','planning_task','maintenance','field_log'))
);

CREATE UNIQUE INDEX IF NOT EXISTS material_items_id_organization_id_uq
  ON public.material_items (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_id_organization_id_uq
  ON public.inventory_items (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS assets_id_organization_id_uq
  ON public.assets (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_records_id_organization_id_uq
  ON public.maintenance_records (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS planning_work_items_id_organization_id_uq
  ON public.planning_work_items (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_id_organization_id_uq ON public.form_submissions (id, organization_id);
CREATE INDEX IF NOT EXISTS form_submissions_org_owner_idx ON public.form_submissions (organization_id, owner_type, owner_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_template_org_fk') THEN
    ALTER TABLE public.form_submissions
      ADD CONSTRAINT form_submissions_template_org_fk
      FOREIGN KEY (template_id, organization_id)
      REFERENCES public.form_templates (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.material_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  material_id uuid,
  inventory_item_id uuid,
  description text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  unit text,
  usage_date date NOT NULL,
  employee_id uuid,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT material_usage_records_quantity_nonzero CHECK (quantity <> 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS material_usage_records_id_organization_id_uq ON public.material_usage_records (id, organization_id);
CREATE INDEX IF NOT EXISTS material_usage_records_org_project_idx ON public.material_usage_records (organization_id, project_id);
CREATE INDEX IF NOT EXISTS material_usage_records_org_date_idx ON public.material_usage_records (organization_id, usage_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_usage_records_project_org_fk') THEN
    ALTER TABLE public.material_usage_records
      ADD CONSTRAINT material_usage_records_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_usage_records_material_org_fk') THEN
    ALTER TABLE public.material_usage_records
      ADD CONSTRAINT material_usage_records_material_org_fk
      FOREIGN KEY (material_id, organization_id)
      REFERENCES public.material_items (id, organization_id)
      ON DELETE SET NULL (material_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_usage_records_inventory_org_fk') THEN
    ALTER TABLE public.material_usage_records
      ADD CONSTRAINT material_usage_records_inventory_org_fk
      FOREIGN KEY (inventory_item_id, organization_id)
      REFERENCES public.inventory_items (id, organization_id)
      ON DELETE SET NULL (inventory_item_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_usage_records_employee_org_fk') THEN
    ALTER TABLE public.material_usage_records
      ADD CONSTRAINT material_usage_records_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (employee_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.equipment_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  usage_date date NOT NULL,
  end_date date,
  hours numeric(18,6),
  days numeric(18,6),
  mileage numeric(18,6),
  employee_id uuid,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT equipment_usage_records_date_range CHECK (end_date IS NULL OR end_date >= usage_date),
  CONSTRAINT equipment_usage_records_hours_non_negative CHECK (hours IS NULL OR hours >= 0),
  CONSTRAINT equipment_usage_records_days_non_negative CHECK (days IS NULL OR days >= 0),
  CONSTRAINT equipment_usage_records_mileage_non_negative CHECK (mileage IS NULL OR mileage >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_usage_records_id_organization_id_uq ON public.equipment_usage_records (id, organization_id);
CREATE INDEX IF NOT EXISTS equipment_usage_records_org_project_idx ON public.equipment_usage_records (organization_id, project_id);
CREATE INDEX IF NOT EXISTS equipment_usage_records_org_asset_idx ON public.equipment_usage_records (organization_id, asset_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_usage_records_project_org_fk') THEN
    ALTER TABLE public.equipment_usage_records
      ADD CONSTRAINT equipment_usage_records_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_usage_records_asset_org_fk') THEN
    ALTER TABLE public.equipment_usage_records
      ADD CONSTRAINT equipment_usage_records_asset_org_fk
      FOREIGN KEY (asset_id, organization_id)
      REFERENCES public.assets (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_usage_records_employee_org_fk') THEN
    ALTER TABLE public.equipment_usage_records
      ADD CONSTRAINT equipment_usage_records_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (employee_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.command_center_item_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  snoozed_until timestamptz,
  note text,
  updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT command_center_item_states_state_known CHECK (state IN ('active','handled','dismissed','snoozed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS command_center_item_states_org_key_uq ON public.command_center_item_states (organization_id, item_key);
CREATE UNIQUE INDEX IF NOT EXISTS command_center_item_states_id_organization_id_uq ON public.command_center_item_states (id, organization_id);

CREATE TABLE IF NOT EXISTS public.recurring_financial_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  draft_kind text NOT NULL,
  title text NOT NULL,
  frequency text NOT NULL,
  interval_count integer NOT NULL DEFAULT 1,
  next_run_date date NOT NULL,
  end_date date,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_generated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT recurring_financial_drafts_kind_known CHECK (draft_kind IN ('expense','vendor_bill','billing_record')),
  CONSTRAINT recurring_financial_drafts_frequency_known CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  CONSTRAINT recurring_financial_drafts_status_known CHECK (status IN ('active','paused','ended')),
  CONSTRAINT recurring_financial_drafts_interval_positive CHECK (interval_count >= 1),
  CONSTRAINT recurring_financial_drafts_date_range CHECK (end_date IS NULL OR end_date >= next_run_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_financial_drafts_id_organization_id_uq ON public.recurring_financial_drafts (id, organization_id);
CREATE INDEX IF NOT EXISTS recurring_financial_drafts_org_next_idx ON public.recurring_financial_drafts (organization_id, next_run_date);
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_templates_tenant_select ON public.form_templates
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.read'));

CREATE POLICY form_templates_tenant_insert ON public.form_templates
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.manage'));

CREATE POLICY form_templates_tenant_update ON public.form_templates
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.manage'));

CREATE POLICY form_templates_tenant_delete ON public.form_templates
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.manage'));

CREATE POLICY form_templates_service_all ON public.form_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_submissions_tenant_select ON public.form_submissions
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.read'));

CREATE POLICY form_submissions_tenant_insert ON public.form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'forms.submit')
      OR app.has_org_permission(organization_id, 'forms.manage')
    )
  );

CREATE POLICY form_submissions_tenant_update ON public.form_submissions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'forms.submit')
      OR app.has_org_permission(organization_id, 'forms.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'forms.submit')
      OR app.has_org_permission(organization_id, 'forms.manage')
    )
  );

CREATE POLICY form_submissions_tenant_delete ON public.form_submissions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'forms.manage'));

CREATE POLICY form_submissions_service_all ON public.form_submissions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.material_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY material_usage_records_tenant_select ON public.material_usage_records
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'materials.read'));

CREATE POLICY material_usage_records_tenant_insert ON public.material_usage_records
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'materials.manage'));

CREATE POLICY material_usage_records_tenant_update ON public.material_usage_records
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'materials.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'materials.manage'));

CREATE POLICY material_usage_records_tenant_delete ON public.material_usage_records
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'materials.manage'));

CREATE POLICY material_usage_records_service_all ON public.material_usage_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.equipment_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_usage_records_tenant_select ON public.equipment_usage_records
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.read'));

CREATE POLICY equipment_usage_records_tenant_insert ON public.equipment_usage_records
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'));

CREATE POLICY equipment_usage_records_tenant_update ON public.equipment_usage_records
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'));

CREATE POLICY equipment_usage_records_tenant_delete ON public.equipment_usage_records
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'assets.manage'));

CREATE POLICY equipment_usage_records_service_all ON public.equipment_usage_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.command_center_item_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY command_center_item_states_tenant_select ON public.command_center_item_states
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'command_center.read'));

CREATE POLICY command_center_item_states_tenant_insert ON public.command_center_item_states
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'command_center.read'));

CREATE POLICY command_center_item_states_tenant_update ON public.command_center_item_states
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'command_center.read'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'command_center.read'));

CREATE POLICY command_center_item_states_tenant_delete ON public.command_center_item_states
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'command_center.read'));

CREATE POLICY command_center_item_states_service_all ON public.command_center_item_states
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.recurring_financial_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_financial_drafts_tenant_select ON public.recurring_financial_drafts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'expenses.read')
      OR app.has_org_permission(organization_id, 'billing.read')
      OR app.has_org_permission(organization_id, 'ap.read')
    )
  );

CREATE POLICY recurring_financial_drafts_tenant_insert ON public.recurring_financial_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'expenses.finalize')
      OR app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'ap.manage')
    )
  );

CREATE POLICY recurring_financial_drafts_tenant_update ON public.recurring_financial_drafts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'expenses.finalize')
      OR app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'ap.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'expenses.finalize')
      OR app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'ap.manage')
    )
  );

CREATE POLICY recurring_financial_drafts_tenant_delete ON public.recurring_financial_drafts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'expenses.finalize')
      OR app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'ap.manage')
    )
  );

CREATE POLICY recurring_financial_drafts_service_all ON public.recurring_financial_drafts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
