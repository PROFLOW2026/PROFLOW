-- 0154: Developer / GC layer - project-scoped internal capabilities.
-- PREPARED ONLY - Owner applies after the Final Gate review. Do not modify 0000-0153.
--
-- PURPOSE
-- -------
-- Authorization on ONE project for ONE person, independent from the organization-wide
-- RBAC union (app.has_org_permission ignores role_assignments.project_id, so a
-- project-scoped role stored there would become organization-wide).
--
--   1. Permission catalog: project_team.admin (org-wide authority; backfilled to Owner roles)
--   2. project_members + project_member_capabilities (capabilities stored pre-expanded)
--   3. app.has_project_capability(org, project, capability)
--   4. app.can_access_project: an ACTIVE project member can open the project
--      (additive branch; every previous branch is unchanged)
--   5. RLS, grants, integrity triggers (active org member only; no capability escalation)
--
-- COMPATIBILITY: purely additive. The deployed app ignores the new tables/permission.
-- The only behavioural change is additive visibility in can_access_project for rows
-- that cannot exist before this migration.

--------------------------------------------------------------------------------
-- 1. Permission catalog + Owner backfill
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('project_team.admin', 'projects',
   'Administer project teams and hold every project capability on every project')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, 'project_team.admin'
FROM public.roles r
WHERE COALESCE(r.template_key, r.key) = 'owner'
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 2. Tables
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text,
  template_key text,
  status text NOT NULL DEFAULT 'active',
  added_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_members_status_known CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_project_org_fk;
ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_members_id_organization_id_uq
  ON public.project_members (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_members_org_project_user_uq
  ON public.project_members (organization_id, project_id, user_id);
CREATE INDEX IF NOT EXISTS project_members_org_user_status_idx
  ON public.project_members (organization_id, user_id, status);
CREATE INDEX IF NOT EXISTS project_members_project_idx
  ON public.project_members (organization_id, project_id);

CREATE TABLE IF NOT EXISTS public.project_member_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  capability text NOT NULL,
  granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_member_capabilities_shape CHECK (capability ~ '^[a-z_]+(\.[a-z_]+)+$')
);

ALTER TABLE public.project_member_capabilities
  DROP CONSTRAINT IF EXISTS project_member_capabilities_member_org_fk;
ALTER TABLE public.project_member_capabilities
  ADD CONSTRAINT project_member_capabilities_member_org_fk
  FOREIGN KEY (member_id, organization_id)
  REFERENCES public.project_members (id, organization_id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_member_capabilities_member_capability_uq
  ON public.project_member_capabilities (member_id, capability);
CREATE INDEX IF NOT EXISTS project_member_capabilities_org_member_idx
  ON public.project_member_capabilities (organization_id, member_id);

--------------------------------------------------------------------------------
-- 3. Capability check (DB mirror of assertProjectCapability)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.has_project_capability(
  p_organization_id uuid,
  p_project_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
    AND p_project_id IS NOT NULL
    AND (
      app.has_org_permission(p_organization_id, 'project_team.admin')
      OR EXISTS (
        SELECT 1
        FROM public.project_members m
        JOIN public.project_member_capabilities c
          ON c.member_id = m.id AND c.organization_id = m.organization_id
        WHERE m.organization_id = p_organization_id
          AND m.project_id = p_project_id
          AND m.user_id = app.current_user_id()
          AND m.status = 'active'
          AND c.capability = p_capability
      )
    );
$fn$;

REVOKE ALL ON FUNCTION app.has_project_capability(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_project_capability(uuid, uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. Project visibility: an active project member can open the project
--    (identical to 0051 plus one additive branch before the 'selected' cut-off)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.can_access_project(p_organization_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  IF EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.organization_id = p_organization_id
      AND pm.project_id = p_project_id
      AND pm.user_id = app.current_user_id()
      AND pm.status = 'active'
  ) THEN
    RETURN true;
  END IF;
  IF v_mode = 'selected' THEN
    RETURN false;
  END IF;
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

REVOKE ALL ON FUNCTION app.can_access_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_project(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. Integrity triggers
--------------------------------------------------------------------------------

-- Project members are internal users: an ACTIVE organization membership is required.
-- (External contractors never become project_members; they use external grants.)
CREATE OR REPLACE FUNCTION app.project_members_assert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.organization_id = NEW.organization_id
      AND om.user_id = NEW.user_id
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'project member must be an active organization member'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_members_assert_internal_trg ON public.project_members;
CREATE TRIGGER project_members_assert_internal_trg
  BEFORE INSERT OR UPDATE OF status, user_id ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION app.project_members_assert_internal();

-- Identity of a membership never changes; end it and add a new one instead.
CREATE OR REPLACE FUNCTION app.project_members_identity_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'project member identity (organization, project, user) is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_members_identity_frozen_trg ON public.project_members;
CREATE TRIGGER project_members_identity_frozen_trg
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION app.project_members_identity_frozen();

-- No escalation at the database: an authenticated grantor may only insert capabilities
-- they hold on that project themselves. Service-role maintenance (no JWT user) is exempt.
CREATE OR REPLACE FUNCTION app.project_member_capabilities_no_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project_id uuid;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT m.project_id INTO v_project_id
  FROM public.project_members m
  WHERE m.id = NEW.member_id AND m.organization_id = NEW.organization_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project member not found' USING ERRCODE = '23503';
  END IF;
  IF NOT app.has_project_capability(NEW.organization_id, v_project_id, NEW.capability) THEN
    RAISE EXCEPTION 'cannot grant a project capability you do not hold: %', NEW.capability
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_member_capabilities_no_escalation_trg ON public.project_member_capabilities;
CREATE TRIGGER project_member_capabilities_no_escalation_trg
  BEFORE INSERT ON public.project_member_capabilities
  FOR EACH ROW EXECUTE FUNCTION app.project_member_capabilities_no_escalation();

--------------------------------------------------------------------------------
-- 6. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_member_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_member_capabilities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_tenant_select ON public.project_members;
CREATE POLICY project_members_tenant_select ON public.project_members
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      user_id = app.current_user_id()
      OR app.has_project_capability(organization_id, project_id, 'project.view')
    )
  );

DROP POLICY IF EXISTS project_members_tenant_insert ON public.project_members;
CREATE POLICY project_members_tenant_insert ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_team.manage')
  );

DROP POLICY IF EXISTS project_members_tenant_update ON public.project_members;
CREATE POLICY project_members_tenant_update ON public.project_members
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_team.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_team.manage')
  );

DROP POLICY IF EXISTS project_members_tenant_delete ON public.project_members;
CREATE POLICY project_members_tenant_delete ON public.project_members
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_team.manage')
  );

DROP POLICY IF EXISTS project_members_service_all ON public.project_members;
CREATE POLICY project_members_service_all ON public.project_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_member_capabilities_tenant_select ON public.project_member_capabilities;
CREATE POLICY project_member_capabilities_tenant_select ON public.project_member_capabilities
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.id = project_member_capabilities.member_id
        AND m.organization_id = project_member_capabilities.organization_id
    )
  );

DROP POLICY IF EXISTS project_member_capabilities_tenant_insert ON public.project_member_capabilities;
CREATE POLICY project_member_capabilities_tenant_insert ON public.project_member_capabilities
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.id = project_member_capabilities.member_id
        AND m.organization_id = project_member_capabilities.organization_id
        AND app.has_project_capability(m.organization_id, m.project_id, 'project_team.manage')
    )
  );

DROP POLICY IF EXISTS project_member_capabilities_tenant_delete ON public.project_member_capabilities;
CREATE POLICY project_member_capabilities_tenant_delete ON public.project_member_capabilities
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.id = project_member_capabilities.member_id
        AND m.organization_id = project_member_capabilities.organization_id
        AND app.has_project_capability(m.organization_id, m.project_id, 'project_team.manage')
    )
  );

DROP POLICY IF EXISTS project_member_capabilities_service_all ON public.project_member_capabilities;
CREATE POLICY project_member_capabilities_service_all ON public.project_member_capabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_member_capabilities TO authenticated;
GRANT ALL PRIVILEGES ON public.project_members TO service_role;
GRANT ALL PRIVILEGES ON public.project_member_capabilities TO service_role;
