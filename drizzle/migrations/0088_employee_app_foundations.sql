-- 0088_employee_app_foundations
-- Additive only. Does NOT modify 0000–0087.
-- UNAPPLIED — Owner applies manually before production use.
--
-- Employee App: accounts, permission grants, document category grants, audit,
-- minimal `employee` role template backfill.

--------------------------------------------------------------------------------
-- Enums
--------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.employee_app_status AS ENUM (
    'inactive',
    'invited',
    'active',
    'suspended',
    'blocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_scope AS ENUM (
    'self_only',
    'assigned_only',
    'granted_projects',
    'all_organization'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_app_audit_action AS ENUM (
    'activated',
    'suspended',
    'resumed',
    'blocked',
    'unblocked',
    'pin_reset',
    'temp_pin_generated',
    'sessions_revoked',
    'permission_changed',
    'scope_changed',
    'document_category_changed',
    'app_access_disabled',
    'login_failed',
    'login_success',
    'first_login_completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

--------------------------------------------------------------------------------
-- Employee app accounts
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_app_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.employee_app_status NOT NULL DEFAULT 'inactive',
  username text NOT NULL,
  username_normalized text NOT NULL,
  auth_email text NOT NULL,
  pin_must_change boolean NOT NULL DEFAULT true,
  temporary_pin_expires_at timestamptz,
  first_login_at timestamptz,
  last_login_at timestamptz,
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  disabled_at timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_app_accounts_org_employee_uq UNIQUE (organization_id, employee_id),
  CONSTRAINT employee_app_accounts_org_user_uq UNIQUE (organization_id, user_id),
  CONSTRAINT employee_app_accounts_org_username_uq UNIQUE (organization_id, username_normalized),
  CONSTRAINT employee_app_accounts_auth_email_uq UNIQUE (auth_email)
);

CREATE INDEX IF NOT EXISTS employee_app_accounts_org_idx
  ON public.employee_app_accounts (organization_id);

CREATE INDEX IF NOT EXISTS employee_app_accounts_status_idx
  ON public.employee_app_accounts (organization_id, status);

--------------------------------------------------------------------------------
-- Employee permission grants
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions (key) ON DELETE CASCADE,
  scope public.permission_scope NOT NULL DEFAULT 'self_only',
  granted boolean NOT NULL DEFAULT true,
  granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_permission_grants_employee_permission_uq
    UNIQUE (organization_id, employee_id, permission_key)
);

CREATE INDEX IF NOT EXISTS employee_permission_grants_employee_idx
  ON public.employee_permission_grants (organization_id, employee_id);

--------------------------------------------------------------------------------
-- Employee document category grants
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_document_category_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  category text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_document_category_grants_uq
    UNIQUE (organization_id, employee_id, category)
);

CREATE INDEX IF NOT EXISTS employee_document_category_grants_employee_idx
  ON public.employee_document_category_grants (organization_id, employee_id);

--------------------------------------------------------------------------------
-- Employee app audit events
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_app_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action public.employee_app_audit_action NOT NULL,
  detail text,
  detail_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_app_audit_events_employee_idx
  ON public.employee_app_audit_events (organization_id, employee_id, created_at DESC);

--------------------------------------------------------------------------------
-- Minimal employee role template — backfill existing orgs
--------------------------------------------------------------------------------

INSERT INTO public.roles (organization_id, key, template_key, name, description, rank, is_protected)
SELECT
  o.id,
  'employee',
  'employee',
  'Employee',
  'Minimal Employee App access — attendance only by default.',
  5,
  false
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.organization_id = o.id AND r.key = 'employee'
);

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('employee', 'org.read'),
    ('employee', 'attendance.self')
) AS p(role_key, permission_key)
WHERE r.key = p.role_key
  AND r.template_key = 'employee'
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- RLS — owner/admin (workforce.manage) mutates; employees read own row/grants only.
-- Login lifecycle writes use getAdminDb() (postgres bypass). No generic member DML.
--------------------------------------------------------------------------------

ALTER TABLE public.employee_app_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_app_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_permission_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_document_category_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_document_category_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_app_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_app_audit_events FORCE ROW LEVEL SECURITY;

-- employee_app_accounts
DROP POLICY IF EXISTS employee_app_accounts_org_member ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_self_select ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_manage_select ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_manage_insert ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_manage_update ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_manage_delete ON public.employee_app_accounts;
DROP POLICY IF EXISTS employee_app_accounts_service_all ON public.employee_app_accounts;

CREATE POLICY employee_app_accounts_self_select ON public.employee_app_accounts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

CREATE POLICY employee_app_accounts_manage_select ON public.employee_app_accounts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_app_accounts_manage_insert ON public.employee_app_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_app_accounts_manage_update ON public.employee_app_accounts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_app_accounts_manage_delete ON public.employee_app_accounts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_app_accounts_service_all ON public.employee_app_accounts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- employee_permission_grants
DROP POLICY IF EXISTS employee_permission_grants_org_member ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_self_select ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_manage_select ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_manage_insert ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_manage_update ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_manage_delete ON public.employee_permission_grants;
DROP POLICY IF EXISTS employee_permission_grants_service_all ON public.employee_permission_grants;

CREATE POLICY employee_permission_grants_self_select ON public.employee_permission_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND employee_id = app.linked_employee_id(organization_id)
  );

CREATE POLICY employee_permission_grants_manage_select ON public.employee_permission_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_permission_grants_manage_insert ON public.employee_permission_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_permission_grants_manage_update ON public.employee_permission_grants
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_permission_grants_manage_delete ON public.employee_permission_grants
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_permission_grants_service_all ON public.employee_permission_grants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- employee_document_category_grants
DROP POLICY IF EXISTS employee_document_category_grants_org_member ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_self_select ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_manage_select ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_manage_insert ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_manage_update ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_manage_delete ON public.employee_document_category_grants;
DROP POLICY IF EXISTS employee_document_category_grants_service_all ON public.employee_document_category_grants;

CREATE POLICY employee_document_category_grants_self_select ON public.employee_document_category_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND employee_id = app.linked_employee_id(organization_id)
  );

CREATE POLICY employee_document_category_grants_manage_select ON public.employee_document_category_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_document_category_grants_manage_insert ON public.employee_document_category_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_document_category_grants_manage_update ON public.employee_document_category_grants
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_document_category_grants_manage_delete ON public.employee_document_category_grants
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_document_category_grants_service_all ON public.employee_document_category_grants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- employee_app_audit_events — owner read only; writes via trusted server (admin DB)
DROP POLICY IF EXISTS employee_app_audit_events_org_member ON public.employee_app_audit_events;
DROP POLICY IF EXISTS employee_app_audit_events_insert ON public.employee_app_audit_events;
DROP POLICY IF EXISTS employee_app_audit_events_manage_select ON public.employee_app_audit_events;
DROP POLICY IF EXISTS employee_app_audit_events_service_all ON public.employee_app_audit_events;

CREATE POLICY employee_app_audit_events_manage_select ON public.employee_app_audit_events
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_app_audit_events_service_all ON public.employee_app_audit_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
