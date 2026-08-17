-- 0055_next_gen_permissions
-- Additive only. Does NOT modify 0000–0054.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Next-generation experience: permission catalog + document owner types
-- + reusable tenant RLS installer. Tables land in 0056–0058.
-- Portal stays off. No live accounting / calendar / assistant provider.

--------------------------------------------------------------------------------
-- Permissions
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('communications.read', 'organization', 'View outbound business communications'),
  ('communications.manage', 'organization', 'Prepare and send outbound business communications'),
  ('automations.read', 'administration', 'View business automation rules and run history'),
  ('automations.manage', 'administration', 'Configure business automation presets'),
  ('assistant.use', 'organization', 'Use the in-product assistant within existing permissions'),
  ('integrations.read', 'administration', 'View external integration connection state')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'communications.read'),
    ('owner', 'communications.manage'),
    ('owner', 'automations.read'),
    ('owner', 'automations.manage'),
    ('owner', 'assistant.use'),
    ('owner', 'integrations.read'),
    ('manager', 'communications.read'),
    ('manager', 'communications.manage'),
    ('manager', 'automations.read'),
    ('manager', 'automations.manage'),
    ('manager', 'assistant.use'),
    ('manager', 'integrations.read'),
    ('finance', 'communications.read'),
    ('finance', 'communications.manage'),
    ('finance', 'automations.read'),
    ('finance', 'assistant.use'),
    ('finance', 'integrations.read'),
    ('worker', 'assistant.use')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- Document owner types (ADD VALUE must precede use in later migrations)
--------------------------------------------------------------------------------

ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'warranty_coverage';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'warranty_issue';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'closeout';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'outbound_communication';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'calendar_event';

--------------------------------------------------------------------------------
-- Reusable tenant RLS installer
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.install_org_table_rls(
  p_table text,
  p_select_perm text,
  p_write_perm text,
  p_project_col text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  project_pred text;
BEGIN
  project_pred := CASE
    WHEN p_project_col IS NULL THEN 'true'
    ELSE format(
      '(%I IS NULL OR app.can_access_project(organization_id, %I))',
      p_project_col,
      p_project_col
    )
  END;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_select', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_select', p_table, p_select_perm, project_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_insert', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_insert', p_table, p_write_perm, project_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_update', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, %L)
        AND %s
      )
      WITH CHECK (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, %L)
        AND %s
      )',
    p_table || '_tenant_update', p_table, p_write_perm, project_pred, p_write_perm, project_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_delete', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_delete', p_table, p_write_perm, project_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_service_all', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
    p_table || '_service_all', p_table
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.install_org_table_rls(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.install_org_table_rls(text, text, text, text) TO service_role;

--------------------------------------------------------------------------------
-- Parent-aware RLS (child rows inherit the parent's project scope)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.install_org_parent_table_rls(
  p_table text,
  p_parent text,
  p_fk text,
  p_select_perm text,
  p_write_perm text,
  p_parent_project_col text DEFAULT 'project_id'
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  parent_pred text;
BEGIN
  parent_pred := format(
    $ex$EXISTS (
      SELECT 1 FROM public.%I p
      WHERE p.id = %I
        AND p.organization_id = %I.organization_id
        AND (p.%I IS NULL OR app.can_access_project(p.organization_id, p.%I))
    )$ex$,
    p_parent, p_fk, p_table, p_parent_project_col, p_parent_project_col
  );

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_select', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_select', p_table, p_select_perm, parent_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_insert', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_insert', p_table, p_write_perm, parent_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_update', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, %L)
        AND %s
      )
      WITH CHECK (
        app.is_org_member(organization_id)
        AND app.has_org_permission(organization_id, %L)
        AND %s
      )',
    p_table || '_tenant_update', p_table, p_write_perm, parent_pred, p_write_perm, parent_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_delete', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, %L)
      AND %s
    )',
    p_table || '_tenant_delete', p_table, p_write_perm, parent_pred
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_service_all', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
    p_table || '_service_all', p_table
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.install_org_parent_table_rls(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.install_org_parent_table_rls(text, text, text, text, text, text) TO service_role;

--------------------------------------------------------------------------------
-- Append-only history guard (authenticated cannot UPDATE/DELETE)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.append_only_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.append_only_guard() TO service_role;

--------------------------------------------------------------------------------
-- Next-gen write latches (BOQ-style). Authenticated cannot acquire.
-- Class B privileged writers acquire internally from SECURITY DEFINER RPCs
-- or from service_role. Latch presence is not authorization by itself.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.next_gen_write_latches (
  pid integer NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pid, kind)
);

REVOKE ALL ON TABLE app.next_gen_write_latches FROM PUBLIC;
REVOKE ALL ON TABLE app.next_gen_write_latches FROM anon;
REVOKE ALL ON TABLE app.next_gen_write_latches FROM authenticated;
GRANT ALL ON TABLE app.next_gen_write_latches TO service_role;

CREATE OR REPLACE FUNCTION app.next_gen_latch_acquire(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_kind IS NULL OR length(btrim(p_kind)) = 0 THEN
    RAISE EXCEPTION 'next_gen latch kind is required'
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO app.next_gen_write_latches (pid, kind)
  VALUES (pg_backend_pid(), btrim(p_kind))
  ON CONFLICT (pid, kind) DO UPDATE SET created_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION app.next_gen_latch_release(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM app.next_gen_write_latches
  WHERE pid = pg_backend_pid() AND kind = btrim(p_kind);
END;
$$;

CREATE OR REPLACE FUNCTION app.next_gen_latch_held(p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.next_gen_write_latches
    WHERE pid = pg_backend_pid() AND kind = btrim(p_kind)
  );
$$;

-- Class B: latch acquire/release are service-only. Tenant RPCs call them as definer.
REVOKE ALL ON FUNCTION app.next_gen_latch_acquire(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.next_gen_latch_acquire(text) FROM authenticated;
REVOKE ALL ON FUNCTION app.next_gen_latch_acquire(text) FROM anon;
GRANT EXECUTE ON FUNCTION app.next_gen_latch_acquire(text) TO service_role;

REVOKE ALL ON FUNCTION app.next_gen_latch_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.next_gen_latch_release(text) FROM authenticated;
REVOKE ALL ON FUNCTION app.next_gen_latch_release(text) FROM anon;
GRANT EXECUTE ON FUNCTION app.next_gen_latch_release(text) TO service_role;

-- Class A: read predicate used by triggers.
REVOKE ALL ON FUNCTION app.next_gen_latch_held(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_gen_latch_held(text) TO authenticated, service_role;
