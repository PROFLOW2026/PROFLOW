-- 0026_service_dispatch_recurrence
-- Work orders share projects economic entity via work_kind='work_order'.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.

CREATE TABLE IF NOT EXISTS public.project_service_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  category text,
  priority text NOT NULL DEFAULT 'normal',
  service_status text NOT NULL DEFAULT 'new',
  requested_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  site_address text,
  contact_name text,
  contact_phone text,
  checklist_template_id uuid,
  recurrence_definition_id uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT project_service_details_priority_known CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT project_service_details_status_known CHECK (service_status IN ('new','scheduled','in_progress','waiting','completed','cancelled')),
  CONSTRAINT project_service_details_schedule_range CHECK (
    scheduled_start_at IS NULL
    OR scheduled_end_at IS NULL
    OR scheduled_end_at >= scheduled_start_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_service_details_project_org_uq ON public.project_service_details (project_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_service_details_id_organization_id_uq ON public.project_service_details (id, organization_id);
CREATE INDEX IF NOT EXISTS project_service_details_org_schedule_idx ON public.project_service_details (organization_id, scheduled_start_at, service_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_service_details_project_org_fk') THEN
    ALTER TABLE public.project_service_details
      ADD CONSTRAINT project_service_details_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recurrence_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  client_id uuid,
  title text NOT NULL,
  site_address text,
  frequency text NOT NULL,
  interval_count integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  next_occurrence_date date,
  default_duration_minutes integer,
  default_pricing_mode text,
  default_price_amount numeric(18,6),
  currency char(3),
  default_checklist_template_id uuid,
  default_assignee_employee_id uuid,
  status text NOT NULL DEFAULT 'active',
  notes text,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT recurrence_definitions_frequency_known CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  CONSTRAINT recurrence_definitions_status_known CHECK (status IN ('active','paused','ended')),
  CONSTRAINT recurrence_definitions_interval_positive CHECK (interval_count >= 1),
  CONSTRAINT recurrence_definitions_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT recurrence_definitions_duration_positive CHECK (
    default_duration_minutes IS NULL OR default_duration_minutes > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS recurrence_definitions_id_organization_id_uq ON public.recurrence_definitions (id, organization_id);
CREATE INDEX IF NOT EXISTS recurrence_definitions_org_status_idx ON public.recurrence_definitions (organization_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_definitions_client_org_fk') THEN
    ALTER TABLE public.recurrence_definitions
      ADD CONSTRAINT recurrence_definitions_client_org_fk
      FOREIGN KEY (client_id, organization_id)
      REFERENCES public.clients (id, organization_id)
      ON DELETE SET NULL (client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_definitions_assignee_org_fk') THEN
    ALTER TABLE public.recurrence_definitions
      ADD CONSTRAINT recurrence_definitions_assignee_org_fk
      FOREIGN KEY (default_assignee_employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (default_assignee_employee_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_service_details_recurrence_org_fk') THEN
    ALTER TABLE public.project_service_details
      ADD CONSTRAINT project_service_details_recurrence_org_fk
      FOREIGN KEY (recurrence_definition_id, organization_id)
      REFERENCES public.recurrence_definitions (id, organization_id)
      ON DELETE SET NULL (recurrence_definition_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recurrence_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recurrence_definition_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  generated_project_id uuid,
  skipped_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT recurrence_occurrences_status_known CHECK (status IN ('planned','generated','skipped','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS recurrence_occurrences_def_date_uq ON public.recurrence_occurrences (organization_id, recurrence_definition_id, occurrence_date);
CREATE INDEX IF NOT EXISTS recurrence_occurrences_org_date_idx ON public.recurrence_occurrences (organization_id, occurrence_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_occurrences_def_org_fk') THEN
    ALTER TABLE public.recurrence_occurrences
      ADD CONSTRAINT recurrence_occurrences_def_org_fk
      FOREIGN KEY (recurrence_definition_id, organization_id)
      REFERENCES public.recurrence_definitions (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_occurrences_generated_project_org_fk') THEN
    ALTER TABLE public.recurrence_occurrences
      ADD CONSTRAINT recurrence_occurrences_generated_project_org_fk
      FOREIGN KEY (generated_project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (generated_project_id);
  END IF;
END $$;
ALTER TABLE public.project_service_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_service_details_tenant_select ON public.project_service_details
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.read'));

CREATE POLICY project_service_details_tenant_insert ON public.project_service_details
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'service.manage')
      OR app.has_org_permission(organization_id, 'dispatch.manage')
    )
  );

CREATE POLICY project_service_details_tenant_update ON public.project_service_details
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'service.manage')
      OR app.has_org_permission(organization_id, 'dispatch.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'service.manage')
      OR app.has_org_permission(organization_id, 'dispatch.manage')
    )
  );

CREATE POLICY project_service_details_tenant_delete ON public.project_service_details
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY project_service_details_service_all ON public.project_service_details
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.recurrence_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurrence_definitions_tenant_select ON public.recurrence_definitions
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.read'));

CREATE POLICY recurrence_definitions_tenant_insert ON public.recurrence_definitions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_definitions_tenant_update ON public.recurrence_definitions
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_definitions_tenant_delete ON public.recurrence_definitions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_definitions_service_all ON public.recurrence_definitions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
ALTER TABLE public.recurrence_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurrence_occurrences_tenant_select ON public.recurrence_occurrences
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.read'));

CREATE POLICY recurrence_occurrences_tenant_insert ON public.recurrence_occurrences
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_occurrences_tenant_update ON public.recurrence_occurrences
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_occurrences_tenant_delete ON public.recurrence_occurrences
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'service.manage'));

CREATE POLICY recurrence_occurrences_service_all ON public.recurrence_occurrences
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
