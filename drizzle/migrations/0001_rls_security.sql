-- ProjectFlow — tenant isolation, RLS policies and grants (doc 74).
--
-- RLS is defense in depth. The application still performs its own membership
-- and permission checks on every request; these policies exist so that an
-- application bug cannot turn into a cross-tenant data leak.
--
-- The SQL below is written to apply identically on Supabase and on a bare
-- Postgres/PGlite instance used by the integration tests, so the isolation
-- guarantees are actually exercised in CI rather than assumed.

--------------------------------------------------------------------------------
-- 0. Roles
--------------------------------------------------------------------------------
-- Supabase already provides these; creating them conditionally keeps the
-- migration runnable against a plain database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

--------------------------------------------------------------------------------
-- 1. Session helpers
--------------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

-- Resolves the acting user from the request context.
--
-- Supabase populates the JWT claim settings; the `app.user_id` fallback is what
-- the Drizzle connection sets with SET LOCAL after the server has authenticated
-- the session. Both paths are transaction-local, so one pooled connection can
-- never leak identity into the next request.
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF raw IS NULL THEN
    BEGIN
      raw := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
    EXCEPTION WHEN others THEN
      raw := NULL;
    END;
  END IF;

  IF raw IS NULL THEN
    raw := nullif(current_setting('app.user_id', true), '');
  END IF;

  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN raw::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- SECURITY DEFINER so the membership lookup itself is not filtered by the
-- policies that depend on it, which would otherwise recurse.
CREATE OR REPLACE FUNCTION app.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = org_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'active'
  );
$$;

-- Used only to let the very first membership of a brand-new organization be
-- created by its founder. Every subsequent membership requires an existing one.
CREATE OR REPLACE FUNCTION app.org_has_no_members(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = org_id
  );
$$;

-- True when the current user shares at least one organization with `other`.
-- Scopes how much of another person's profile is visible.
CREATE OR REPLACE FUNCTION app.shares_organization_with(other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships mine
    JOIN public.organization_memberships theirs
      ON theirs.organization_id = mine.organization_id
    WHERE mine.user_id = app.current_user_id()
      AND mine.status = 'active'
      AND theirs.user_id = other_user_id
  );
$$;

REVOKE ALL ON FUNCTION app.is_org_member(uuid) FROM public;
REVOKE ALL ON FUNCTION app.org_has_no_members(uuid) FROM public;
REVOKE ALL ON FUNCTION app.shares_organization_with(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.org_has_no_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.shares_organization_with(uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 2. Deferred foreign key
--------------------------------------------------------------------------------
-- Added here rather than in the schema module so `contracts` and `changes` do
-- not have to import each other.

ALTER TABLE public.contract_value_events
  ADD CONSTRAINT contract_value_events_change_order_id_fk
  FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;

--------------------------------------------------------------------------------
-- 3. Baseline grants
--------------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Anonymous callers get nothing. Sign-in happens through Supabase Auth, not
-- through table access.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

--------------------------------------------------------------------------------
-- 4. Tenant-scoped tables
--------------------------------------------------------------------------------
-- Every table carrying `organization_id` gets the same four policies: you may
-- touch a row only while you hold an active membership in its organization.

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'invitations',
    'organization_module_preferences',
    'organization_settings',
    'roles',
    'role_permissions',
    'role_assignments',
    'documents',
    'document_links',
    'clients',
    'client_contacts',
    'party_identifiers',
    'vendors',
    'vendor_contacts',
    'vendor_engagements',
    'organization_domains',
    'projects',
    'project_domains',
    'work_packages',
    'phases',
    'contracts',
    'contract_value_events',
    'change_requests',
    'change_request_lines',
    'quotes',
    'quote_versions',
    'quote_version_lines',
    'approvals',
    'change_orders',
    'cost_categories',
    'expenses',
    'expense_allocations',
    'employees',
    'rate_versions',
    'labor_cost_components',
    'non_project_time_codes',
    'time_entries',
    'billing_records',
    'billing_lines',
    'payments',
    'tax_overrides'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_select', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_insert', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_update', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_delete', tenant_table);

    -- service_role is BYPASSRLS, but FORCE RLS applies to table owners too, so
    -- migrations and controlled seeds need an explicit escape hatch.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tenant_table || '_service_all', tenant_table);
  END LOOP;
END
$$;

--------------------------------------------------------------------------------
-- 5. Organizations
--------------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_member_select ON public.organizations
  FOR SELECT TO authenticated
  USING (app.is_org_member(id));

-- Any authenticated user may found an organization; they become its first
-- member in the same transaction.
CREATE POLICY organizations_create ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY organizations_member_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (app.is_org_member(id))
  WITH CHECK (app.is_org_member(id));

CREATE POLICY organizations_service_all ON public.organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 6. Memberships
--------------------------------------------------------------------------------

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_memberships_select ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) OR user_id = app.current_user_id());

-- Either an existing member is adding somebody (the application separately
-- requires `members.manage`), or the founder is claiming a brand-new org.
CREATE POLICY organization_memberships_insert ON public.organization_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    OR (user_id = app.current_user_id() AND app.org_has_no_members(organization_id))
  );

CREATE POLICY organization_memberships_update ON public.organization_memberships
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

CREATE POLICY organization_memberships_delete ON public.organization_memberships
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

CREATE POLICY organization_memberships_service_all ON public.organization_memberships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 7. Profiles and preferences
--------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_or_colleague_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = app.current_user_id() OR app.shares_organization_with(id));

CREATE POLICY profiles_self_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = app.current_user_id());

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());

CREATE POLICY profiles_service_all ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_self_all ON public.user_preferences
  FOR ALL TO authenticated
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

CREATE POLICY user_preferences_service_all ON public.user_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 8. Global catalogs
--------------------------------------------------------------------------------
-- Readable by any signed-in user, writable only by migrations and system seed.

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY permissions_read ON public.permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY permissions_service_all ON public.permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM authenticated;

--------------------------------------------------------------------------------
-- 9. Tax rules
--------------------------------------------------------------------------------
-- Country-pack rows (organization_id IS NULL) are shared reference data.

ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY tax_rules_select ON public.tax_rules
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR app.is_org_member(organization_id));

CREATE POLICY tax_rules_insert ON public.tax_rules
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND app.is_org_member(organization_id));

CREATE POLICY tax_rules_update ON public.tax_rules
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND app.is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND app.is_org_member(organization_id));

CREATE POLICY tax_rules_delete ON public.tax_rules
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND app.is_org_member(organization_id));

CREATE POLICY tax_rules_service_all ON public.tax_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 10. Audit trail — append only
--------------------------------------------------------------------------------
-- The database, not application discipline, is what makes the trail immutable.

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_member_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND app.is_org_member(organization_id));

CREATE POLICY audit_events_member_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL OR app.is_org_member(organization_id));

CREATE POLICY audit_events_service_all ON public.audit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.audit_events FROM authenticated;

CREATE OR REPLACE FUNCTION app.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (doc 13); % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

--------------------------------------------------------------------------------
-- 11. Default privileges for future tables
--------------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
