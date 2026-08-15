-- 0047_notifications_and_timesheets
-- Additive only. Does NOT modify 0000–0046.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Central in-app notifications (no email/push delivery).
-- Timesheet approval lifecycle. Approved time only contributes to Actual.
-- Existing recorded time entries are grandfathered as approved.

--------------------------------------------------------------------------------
-- Notifications
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type text NOT NULL,
  domain text NOT NULL,
  entity_type text,
  entity_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  deep_link text,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_severity_known CHECK (severity IN ('info', 'warning', 'urgent'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_id_organization_id_uq
  ON public.notifications (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_recipient_dedupe_uq
  ON public.notifications (organization_id, recipient_user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (organization_id, recipient_user_id, created_at)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_org_type_idx
  ON public.notifications (organization_id, type, created_at);

CREATE OR REPLACE FUNCTION app.emit_notification(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_type text,
  p_domain text,
  p_title text,
  p_body text,
  p_dedupe_key text,
  p_severity text DEFAULT 'info',
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_deep_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'emit_notification: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('info', 'warning', 'urgent') THEN
    RAISE EXCEPTION 'emit_notification: invalid severity'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.notifications (
    organization_id, recipient_user_id, type, domain, entity_type, entity_id,
    title, body, severity, deep_link, dedupe_key, metadata, expires_at
  ) VALUES (
    p_organization_id, p_recipient_user_id, p_type, p_domain, p_entity_type, p_entity_id,
    p_title, p_body, p_severity, p_deep_link, p_dedupe_key, p_metadata, p_expires_at
  )
  ON CONFLICT (organization_id, recipient_user_id, dedupe_key)
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    severity = EXCLUDED.severity,
    deep_link = EXCLUDED.deep_link,
    metadata = EXCLUDED.metadata,
    expires_at = EXCLUDED.expires_at,
    resolved_at = NULL,
    dismissed_at = NULL,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.emit_notification(
  uuid, uuid, text, text, text, text, text, text, text, uuid, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.emit_notification(
  uuid, uuid, text, text, text, text, text, text, text, uuid, text, jsonb, timestamptz
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.resolve_notifications(
  p_organization_id uuid,
  p_type text,
  p_entity_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'resolve_notifications: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.notifications
  SET resolved_at = now(), updated_at = now()
  WHERE organization_id = p_organization_id
    AND type = p_type
    AND entity_id = p_entity_id
    AND resolved_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION app.resolve_notifications(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_notifications(uuid, text, uuid) TO authenticated, service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_tenant_select ON public.notifications;
CREATE POLICY notifications_tenant_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'notifications.read')
    AND recipient_user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS notifications_tenant_update ON public.notifications;
CREATE POLICY notifications_tenant_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND recipient_user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND recipient_user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS notifications_service_all ON public.notifications;
CREATE POLICY notifications_service_all ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, DELETE ON public.notifications FROM authenticated;

--------------------------------------------------------------------------------
-- Timesheets
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  decided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  manager_note text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheets_status_known CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
  CONSTRAINT timesheets_period_order CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS timesheets_id_organization_id_uq
  ON public.timesheets (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS timesheets_org_employee_period_uq
  ON public.timesheets (organization_id, employee_id, period_start)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS timesheets_org_status_idx
  ON public.timesheets (organization_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheets_employee_org_fk') THEN
    ALTER TABLE public.timesheets
      ADD CONSTRAINT timesheets_employee_org_fk
      FOREIGN KEY (employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('timesheets', 'workforce.read', 'time.manage');

DROP POLICY IF EXISTS timesheets_tenant_update ON public.timesheets;
CREATE POLICY timesheets_tenant_update ON public.timesheets
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'time.manage')
      OR app.has_org_permission(organization_id, 'time.approve')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'time.manage')
      OR app.has_org_permission(organization_id, 'time.approve')
    )
  );

--------------------------------------------------------------------------------
-- Time entry approval columns
--------------------------------------------------------------------------------

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS timesheet_id uuid,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_note text;

UPDATE public.time_entries
SET approval_status = 'approved'
WHERE status = 'recorded' AND (approval_status IS NULL OR approval_status = 'draft');

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_approval_status_known;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_approval_status_known
  CHECK (approval_status IN ('draft', 'submitted', 'approved', 'returned'));

CREATE INDEX IF NOT EXISTS time_entries_org_approval_idx
  ON public.time_entries (organization_id, approval_status);
CREATE INDEX IF NOT EXISTS time_entries_timesheet_idx
  ON public.time_entries (timesheet_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_timesheet_org_fk') THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_timesheet_org_fk
      FOREIGN KEY (timesheet_id, organization_id)
      REFERENCES public.timesheets (id, organization_id)
      ON DELETE SET NULL (timesheet_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.time_entries_approval_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status = 'approved' AND OLD.status = 'recorded' THEN
    IF NEW.status = 'void' AND NEW.approval_status = OLD.approval_status THEN
      RETURN NEW;
    END IF;
    IF NEW.hours IS DISTINCT FROM OLD.hours
       OR NEW.cost_amount IS DISTINCT FROM OLD.cost_amount
       OR NEW.work_date IS DISTINCT FROM OLD.work_date
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'time_entries: approved time is locked; use a correction'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS time_entries_approval_lock ON public.time_entries;
CREATE TRIGGER time_entries_approval_lock
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION app.time_entries_approval_lock();

REVOKE ALL ON FUNCTION app.time_entries_approval_lock() FROM PUBLIC;

COMMENT ON COLUMN public.time_entries.approval_status IS
  'draft/submitted/returned do not create Actual. approved + recorded does. Grandfathered history is approved.';
