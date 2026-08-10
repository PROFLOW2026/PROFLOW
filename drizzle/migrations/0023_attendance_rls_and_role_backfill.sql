-- 0023_attendance_rls_and_role_backfill
-- Additive / idempotent hardening on top of 0022.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.
--
-- Fixes:
--   1) attendance.self RLS scoped to linked employee (not org-wide)
--   2) org-wide attendance SELECT via attendance.read/manage only
--      (NOT workforce.read — Worker has attendance.self only, no workforce.read)
--   3) role_permissions backfill for attendance.* on template roles

--------------------------------------------------------------------------------
-- Helper: linked employee for current auth user in org
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.linked_employee_id(org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.organization_id = org_id
    AND e.user_id = app.current_user_id()
    AND e.archived_at IS NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.linked_employee_id(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.linked_employee_id(uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Existing orgs: backfill attendance permissions onto template roles
--------------------------------------------------------------------------------

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'attendance.read'),
    ('owner', 'attendance.manage'),
    ('owner', 'attendance.self'),
    ('manager', 'attendance.read'),
    ('manager', 'attendance.manage'),
    ('manager', 'attendance.self'),
    ('worker', 'attendance.self'),
    ('finance', 'attendance.read')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- Attendance days RLS — manage/read org-wide; self = linked employee only
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS attendance_days_tenant_select ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_insert ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_update ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_delete ON public.attendance_days;

CREATE POLICY attendance_days_tenant_select ON public.attendance_days
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_any_org_permission(
        organization_id,
        VARIADIC ARRAY['attendance.read', 'attendance.manage']::text[]
      )
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND employee_id = app.linked_employee_id(organization_id)
      )
    )
  );

CREATE POLICY attendance_days_tenant_insert ON public.attendance_days
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND employee_id = app.linked_employee_id(organization_id)
      )
    )
  );

CREATE POLICY attendance_days_tenant_update ON public.attendance_days
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND employee_id = app.linked_employee_id(organization_id)
      )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND employee_id = app.linked_employee_id(organization_id)
      )
    )
  );

CREATE POLICY attendance_days_tenant_delete ON public.attendance_days
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'attendance.manage')
  );

--------------------------------------------------------------------------------
-- Attendance events RLS — scoped via parent day employee_id
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS attendance_events_tenant_select ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_insert ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_update ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_delete ON public.attendance_events;

CREATE POLICY attendance_events_tenant_select ON public.attendance_events
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_any_org_permission(
        organization_id,
        VARIADIC ARRAY['attendance.read', 'attendance.manage']::text[]
      )
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND EXISTS (
          SELECT 1
          FROM public.attendance_days d
          WHERE d.id = attendance_day_id
            AND d.organization_id = organization_id
            AND d.employee_id = app.linked_employee_id(organization_id)
        )
      )
    )
  );

CREATE POLICY attendance_events_tenant_insert ON public.attendance_events
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND EXISTS (
          SELECT 1
          FROM public.attendance_days d
          WHERE d.id = attendance_day_id
            AND d.organization_id = organization_id
            AND d.employee_id = app.linked_employee_id(organization_id)
        )
      )
    )
  );

CREATE POLICY attendance_events_tenant_update ON public.attendance_events
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND EXISTS (
          SELECT 1
          FROM public.attendance_days d
          WHERE d.id = attendance_day_id
            AND d.organization_id = organization_id
            AND d.employee_id = app.linked_employee_id(organization_id)
        )
      )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'attendance.manage')
      OR (
        app.has_org_permission(organization_id, 'attendance.self')
        AND EXISTS (
          SELECT 1
          FROM public.attendance_days d
          WHERE d.id = attendance_day_id
            AND d.organization_id = organization_id
            AND d.employee_id = app.linked_employee_id(organization_id)
        )
      )
    )
  );

CREATE POLICY attendance_events_tenant_delete ON public.attendance_events
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'attendance.manage')
  );
