-- 0050_wave3_operations
-- Additive only. Does NOT modify 0000–0049.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Resource bookings + unavailability.
-- Project access grants + can_access_project (default mode remains all-projects).
-- Advanced daily logs lifecycle.
-- Safety / HSE.
-- Inventory reservations, counts, location kinds. Qty only — no costing.

--------------------------------------------------------------------------------
-- Resource scheduling
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.resource_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  project_id uuid,
  work_order_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  planned_hours numeric(18,6),
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'planned',
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_bookings_window_valid CHECK (end_at > start_at),
  CONSTRAINT resource_bookings_status_known CHECK (status IN ('planned', 'confirmed', 'cancelled')),
  CONSTRAINT resource_bookings_source_known
    CHECK (source IN ('manual', 'work_order', 'assignment', 'recurring'))
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_bookings_id_organization_id_uq
  ON public.resource_bookings (id, organization_id);
CREATE INDEX IF NOT EXISTS resource_bookings_employee_window_idx
  ON public.resource_bookings (organization_id, employee_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS resource_bookings_project_idx
  ON public.resource_bookings (organization_id, project_id, start_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_bookings_employee_org_fk') THEN
    ALTER TABLE public.resource_bookings
      ADD CONSTRAINT resource_bookings_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_bookings_project_org_fk') THEN
    ALTER TABLE public.resource_bookings
      ADD CONSTRAINT resource_bookings_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_bookings_work_order_org_fk') THEN
    ALTER TABLE public.resource_bookings
      ADD CONSTRAINT resource_bookings_work_order_org_fk
      FOREIGN KEY (work_order_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('resource_bookings', 'scheduling.read', 'scheduling.manage');

CREATE TABLE IF NOT EXISTS public.employee_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  kind text NOT NULL DEFAULT 'leave',
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_unavailability_date_order CHECK (end_date >= start_date),
  CONSTRAINT employee_unavailability_kind_known CHECK (kind IN ('leave', 'unavailable', 'holiday'))
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_unavailability_id_organization_id_uq
  ON public.employee_unavailability (id, organization_id);
CREATE INDEX IF NOT EXISTS employee_unavailability_employee_idx
  ON public.employee_unavailability (organization_id, employee_id, start_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_unavailability_employee_org_fk') THEN
    ALTER TABLE public.employee_unavailability
      ADD CONSTRAINT employee_unavailability_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('employee_unavailability', 'workforce.read', 'workforce.manage');

--------------------------------------------------------------------------------
-- Project-level access (default: all members keep seeing all projects)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  access_level text NOT NULL DEFAULT 'read',
  granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_access_grants_level_known CHECK (access_level IN ('read', 'manage'))
);

CREATE UNIQUE INDEX IF NOT EXISTS project_access_grants_id_organization_id_uq
  ON public.project_access_grants (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_access_grants_user_project_uq
  ON public.project_access_grants (organization_id, user_id, project_id);
CREATE INDEX IF NOT EXISTS project_access_grants_project_idx
  ON public.project_access_grants (organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_access_grants_project_org_fk') THEN
    ALTER TABLE public.project_access_grants
      ADD CONSTRAINT project_access_grants_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('project_access_grants', 'projects.read', 'members.manage');

CREATE OR REPLACE FUNCTION app.project_access_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        ELSE COALESCE(value->>'mode', 'all')
      END
      FROM public.organization_settings
      WHERE organization_id = p_organization_id AND key = 'project_access_mode'
      LIMIT 1
    ),
    'all'
  );
$fn$;

CREATE OR REPLACE FUNCTION app.can_access_project(p_organization_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_mode text;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN app.is_org_member(p_organization_id);
  END IF;
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;
  v_mode := app.project_access_mode(p_organization_id);
  IF v_mode IS NULL OR v_mode = 'all' THEN
    RETURN true;
  END IF;
  IF app.has_org_permission(p_organization_id, 'projects.access_all') THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_access_grants g
    WHERE g.organization_id = p_organization_id
      AND g.project_id = p_project_id
      AND g.user_id = app.current_user_id()
  ) THEN
    RETURN true;
  END IF;
  IF v_mode = 'selected' THEN
    RETURN false;
  END IF;
  -- assigned mode
  IF EXISTS (
    SELECT 1
    FROM public.employee_project_assignments a
    JOIN public.employees e ON e.id = a.employee_id AND e.organization_id = a.organization_id
    WHERE a.organization_id = p_organization_id
      AND a.project_id = p_project_id
      AND a.status = 'active'
      AND e.user_id = app.current_user_id()
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_assignments ra
    WHERE ra.organization_id = p_organization_id
      AND ra.user_id = app.current_user_id()
      AND ra.project_id = p_project_id
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.project_access_mode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_access_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_access_mode(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_access_project(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS projects_tenant_select ON public.projects;
CREATE POLICY projects_tenant_select ON public.projects
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.can_access_project(organization_id, id));

--------------------------------------------------------------------------------
-- Daily logs expansion
--------------------------------------------------------------------------------

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS work_performed text,
  ADD COLUMN IF NOT EXISTS delays text,
  ADD COLUMN IF NOT EXISTS incidents text,
  ADD COLUMN IF NOT EXISTS safety_notes text,
  ADD COLUMN IF NOT EXISTS visitor_notes text,
  ADD COLUMN IF NOT EXISTS manager_notes text,
  ADD COLUMN IF NOT EXISTS workers_on_site text,
  ADD COLUMN IF NOT EXISTS subcontractors_on_site text,
  ADD COLUMN IF NOT EXISTS equipment_on_site text,
  ADD COLUMN IF NOT EXISTS deliveries text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS correction_notes text;

ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_status_known;
ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_status_known
  CHECK (status IN ('draft', 'submitted', 'finalized'));

CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_id_organization_id_uq
  ON public.daily_logs (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_project_date_active_uq
  ON public.daily_logs (organization_id, project_id, log_date)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION app.daily_logs_finalized_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_old public.daily_logs%ROWTYPE;
  v_new public.daily_logs%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'finalized' AND current_user = 'authenticated' THEN
      RAISE EXCEPTION 'daily_logs: finalized log cannot be deleted'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF NEW.status IS DISTINCT FROM 'finalized' THEN
      RAISE EXCEPTION 'daily_logs: finalized log cannot revert; use a correction'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    v_old := OLD;
    v_new := NEW;
    v_old.updated_at := v_new.updated_at;
    v_old.correction_notes := v_new.correction_notes;
    IF v_new IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'daily_logs: finalized log is locked; append a correction'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.correction_notes IS DISTINCT FROM OLD.correction_notes THEN
      IF OLD.correction_notes IS NOT NULL
         AND (NEW.correction_notes IS NULL
              OR position(OLD.correction_notes IN NEW.correction_notes) <> 1) THEN
        RAISE EXCEPTION 'daily_logs: correction notes are append-only'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS daily_logs_finalized_lock ON public.daily_logs;
CREATE TRIGGER daily_logs_finalized_lock
  BEFORE UPDATE OR DELETE ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION app.daily_logs_finalized_lock();

REVOKE ALL ON FUNCTION app.daily_logs_finalized_lock() FROM PUBLIC;

--------------------------------------------------------------------------------
-- Safety / HSE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  record_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reporter_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'low',
  title text NOT NULL,
  description text NOT NULL,
  people_involved text,
  immediate_action text,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_records_type_known CHECK (record_type IN (
    'incident', 'near_miss', 'accident', 'hazard', 'observation', 'toolbox_talk', 'ppe_issue'
  )),
  CONSTRAINT safety_records_severity_known CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT safety_records_status_known CHECK (status IN ('open', 'in_progress', 'closed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS safety_records_id_organization_id_uq
  ON public.safety_records (id, organization_id);
CREATE INDEX IF NOT EXISTS safety_records_org_project_idx
  ON public.safety_records (organization_id, project_id, occurred_at);
CREATE INDEX IF NOT EXISTS safety_records_org_status_idx
  ON public.safety_records (organization_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_records_project_org_fk') THEN
    ALTER TABLE public.safety_records
      ADD CONSTRAINT safety_records_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (project_id);
  END IF;
END $$;

SELECT app.install_permissioned_rls('safety_records', 'safety.read', 'safety.manage');

CREATE TABLE IF NOT EXISTS public.safety_corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  safety_record_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_corrective_actions_status_known
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS safety_corrective_actions_id_organization_id_uq
  ON public.safety_corrective_actions (id, organization_id);
CREATE INDEX IF NOT EXISTS safety_corrective_actions_record_idx
  ON public.safety_corrective_actions (safety_record_id);
CREATE INDEX IF NOT EXISTS safety_corrective_actions_due_idx
  ON public.safety_corrective_actions (organization_id, status, due_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_corrective_actions_record_org_fk') THEN
    ALTER TABLE public.safety_corrective_actions
      ADD CONSTRAINT safety_corrective_actions_record_org_fk
      FOREIGN KEY (safety_record_id, organization_id)
      REFERENCES public.safety_records (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('safety_corrective_actions', 'safety.read', 'safety.manage');

CREATE TABLE IF NOT EXISTS public.safety_toolbox_talks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  safety_record_id uuid NOT NULL,
  topic text NOT NULL,
  talk_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS safety_toolbox_talks_id_organization_id_uq
  ON public.safety_toolbox_talks (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS safety_toolbox_talks_record_uq
  ON public.safety_toolbox_talks (safety_record_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_toolbox_talks_record_org_fk') THEN
    ALTER TABLE public.safety_toolbox_talks
      ADD CONSTRAINT safety_toolbox_talks_record_org_fk
      FOREIGN KEY (safety_record_id, organization_id)
      REFERENCES public.safety_records (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('safety_toolbox_talks', 'safety.read', 'safety.manage');

CREATE TABLE IF NOT EXISTS public.safety_toolbox_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  toolbox_talk_id uuid NOT NULL,
  employee_id uuid,
  attendee_name text NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS safety_toolbox_attendees_id_organization_id_uq
  ON public.safety_toolbox_attendees (id, organization_id);
CREATE INDEX IF NOT EXISTS safety_toolbox_attendees_talk_idx
  ON public.safety_toolbox_attendees (toolbox_talk_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_toolbox_attendees_talk_org_fk') THEN
    ALTER TABLE public.safety_toolbox_attendees
      ADD CONSTRAINT safety_toolbox_attendees_talk_org_fk
      FOREIGN KEY (toolbox_talk_id, organization_id)
      REFERENCES public.safety_toolbox_talks (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('safety_toolbox_attendees', 'safety.read', 'safety.manage');

--------------------------------------------------------------------------------
-- Inventory reservations / counts / location kinds (qty only)
--------------------------------------------------------------------------------

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS min_stock_level numeric(18,6);

UPDATE public.inventory_items
SET min_stock_level = reorder_level
WHERE min_stock_level IS NULL AND reorder_level IS NOT NULL;

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS location_kind text NOT NULL DEFAULT 'warehouse',
  ADD COLUMN IF NOT EXISTS project_id uuid;

ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_kind_known;
ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_kind_known
  CHECK (location_kind IN ('warehouse', 'site', 'vehicle'));

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL,
  project_id uuid,
  work_order_id uuid,
  quantity numeric(18,6) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reservations_qty_positive CHECK (quantity > 0),
  CONSTRAINT inventory_reservations_status_known
    CHECK (status IN ('active', 'released', 'consumed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_id_organization_id_uq
  ON public.inventory_reservations (id, organization_id);
CREATE INDEX IF NOT EXISTS inventory_reservations_item_idx
  ON public.inventory_reservations (organization_id, inventory_item_id, status);
CREATE INDEX IF NOT EXISTS inventory_reservations_project_idx
  ON public.inventory_reservations (organization_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_item_org_fk') THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_item_org_fk
      FOREIGN KEY (inventory_item_id, organization_id)
      REFERENCES public.inventory_items (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_project_org_fk') THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (project_id);
  END IF;
END $$;

SELECT app.install_permissioned_rls('inventory_reservations', 'assets.read', 'assets.manage');

CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  counted_on date NOT NULL,
  notes text,
  finalized_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_counts_status_known CHECK (status IN ('draft', 'finalizing', 'finalized', 'void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_id_organization_id_uq
  ON public.inventory_counts (id, organization_id);
CREATE INDEX IF NOT EXISTS inventory_counts_org_status_idx
  ON public.inventory_counts (organization_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_counts_location_org_fk') THEN
    ALTER TABLE public.inventory_counts
      ADD CONSTRAINT inventory_counts_location_org_fk
      FOREIGN KEY (location_id, organization_id)
      REFERENCES public.inventory_locations (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

SELECT app.install_permissioned_rls('inventory_counts', 'assets.read', 'assets.manage');

ALTER TABLE public.inventory_counts DROP CONSTRAINT IF EXISTS inventory_counts_status_known;
ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_status_known
  CHECK (status IN ('draft', 'finalizing', 'finalized', 'void'));

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  count_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  expected_quantity numeric(18,6) NOT NULL,
  counted_quantity numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_count_lines_id_organization_id_uq
  ON public.inventory_count_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_count_lines_count_item_uq
  ON public.inventory_count_lines (count_id, inventory_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_count_lines_count_org_fk') THEN
    ALTER TABLE public.inventory_count_lines
      ADD CONSTRAINT inventory_count_lines_count_org_fk
      FOREIGN KEY (count_id, organization_id)
      REFERENCES public.inventory_counts (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_count_lines_item_org_fk') THEN
    ALTER TABLE public.inventory_count_lines
      ADD CONSTRAINT inventory_count_lines_item_org_fk
      FOREIGN KEY (inventory_item_id, organization_id)
      REFERENCES public.inventory_items (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

SELECT app.install_permissioned_rls('inventory_count_lines', 'assets.read', 'assets.manage');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_locations_project_org_fk') THEN
    ALTER TABLE public.inventory_locations
      ADD CONSTRAINT inventory_locations_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (project_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_work_order_org_fk') THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_work_order_org_fk
      FOREIGN KEY (work_order_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (work_order_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_toolbox_attendees_employee_org_fk') THEN
    ALTER TABLE public.safety_toolbox_attendees
      ADD CONSTRAINT safety_toolbox_attendees_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (employee_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_submitted_by_fk') THEN
    ALTER TABLE public.daily_logs
      ADD CONSTRAINT daily_logs_submitted_by_fk
      FOREIGN KEY (submitted_by_user_id)
      REFERENCES public.profiles (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.inventory_reservations IS
  'Qty reservation only. available = on_hand - active reserved. Never Actual.';
COMMENT ON TABLE public.safety_records IS
  'Operational HSE. Corrective actions feed the notifications engine when overdue.';
