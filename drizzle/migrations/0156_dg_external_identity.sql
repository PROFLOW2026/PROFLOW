-- 0156: Developer / GC layer - EXTERNAL IDENTITY (contractor accounts, grants, sessions).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 / 0155.
--
-- PURPOSE
--   1. external_principals: contractor accounts (username + Supabase password, synthetic auth email),
--      lifecycle status (invited -> active -> disabled), home organization/project, sign-in counters.
--   2. external_access_grants: grant bookkeeping (template, granted/revoked by) + contractor shape checks
--      + one active grant per exact scope + RESTRICTIVE write guard for contractor grants.
--   3. external_principal_tokens: single-use invite / password-reset tokens (sha256 hash only).
--   4. external_sign_in_attempts: rate-limit / security log (service role only).
--   5. app.external_principal_id() now requires status = 'active' (disable = immediate RLS cut-off).
--   6. Contractor auth users can NEVER hold organization_memberships (trigger, both directions).
--   7. Principal self-read, own-grant read, safe portal directory, own-profile update, external audit insert.
--
-- COMPATIBILITY: additive. Existing customer/vendor principals default to principal_kind = 'portal',
-- status = 'active'; existing grants are untouched (new checks only constrain portal_kind = 'contractor').
--
-- USERNAME -> AUTH EMAIL: Supabase Auth needs an email; contractor accounts use the synthetic,
-- never-mailed address `<username_normalized>@contractors.pf.internal`. The real contact address,
-- when given, lives in contact_email and is never used for sign-in.

--------------------------------------------------------------------------------
-- 1. external_principals: contractor account columns
--------------------------------------------------------------------------------

ALTER TABLE public.external_principals
  ADD COLUMN IF NOT EXISTS principal_kind text NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS username_normalized text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS home_organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_project_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_sign_in_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  -- Sessions authenticated before this instant are rejected by the session loader (revoke / reset / disable).
  ADD COLUMN IF NOT EXISTS sessions_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_kind_known;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_kind_known CHECK (principal_kind IN ('portal', 'contractor'));

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_status_known;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_status_known CHECK (status IN ('invited', 'active', 'disabled'));

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_contractor_shape;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_contractor_shape CHECK (
    principal_kind <> 'contractor'
    OR (
      username_normalized IS NOT NULL
      AND username_normalized ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
      AND username IS NOT NULL
      AND auth_user_id IS NOT NULL
    )
  );

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_failed_count_non_negative;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_failed_count_non_negative CHECK (failed_sign_in_count >= 0);

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_locale_known;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_locale_known CHECK (locale IS NULL OR locale IN ('he-IL', 'en', 'ar', 'ru'));

ALTER TABLE public.external_principals DROP CONSTRAINT IF EXISTS external_principals_home_project_fk;
ALTER TABLE public.external_principals
  ADD CONSTRAINT external_principals_home_project_fk
  FOREIGN KEY (home_project_id, home_organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE SET NULL (home_project_id);

CREATE UNIQUE INDEX IF NOT EXISTS external_principals_username_uq
  ON public.external_principals (username_normalized)
  WHERE username_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS external_principals_contractor_auth_user_uq
  ON public.external_principals (auth_user_id)
  WHERE principal_kind = 'contractor' AND auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_principals_auth_user_idx
  ON public.external_principals (auth_user_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS external_principals_home_org_idx
  ON public.external_principals (home_organization_id)
  WHERE home_organization_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. external_access_grants: bookkeeping + contractor checks
--------------------------------------------------------------------------------

ALTER TABLE public.external_access_grants
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason text;

-- Every contractor capability is an `ext.<area>.<verb>` key (never an internal capability / permission).
CREATE OR REPLACE FUNCTION app.external_scopes_valid(p_scopes jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_typeof(p_scopes) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_scopes) AS s(value)
      WHERE jsonb_typeof(s.value) <> 'string'
         OR (s.value #>> '{}') !~ '^ext\.[a-z][a-z_]*\.[a-z][a-z_]*$'
    )
$fn$;

ALTER TABLE public.external_access_grants DROP CONSTRAINT IF EXISTS external_access_grants_contractor_scopes;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_contractor_scopes CHECK (
    portal_kind <> 'contractor' OR app.external_scopes_valid(scopes)
  );

ALTER TABLE public.external_access_grants DROP CONSTRAINT IF EXISTS external_access_grants_contractor_agreement_project;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_contractor_agreement_project CHECK (
    portal_kind <> 'contractor' OR subcontract_agreement_id IS NULL OR project_id IS NOT NULL
  );

ALTER TABLE public.external_access_grants DROP CONSTRAINT IF EXISTS external_access_grants_template_shape;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_template_shape CHECK (
    template_key IS NULL OR template_key ~ '^[a-z][a-z0-9_]*$'
  );

-- One ACTIVE contractor grant per principal and exact scope; edit capabilities instead of stacking grants.
CREATE UNIQUE INDEX IF NOT EXISTS external_access_grants_contractor_scope_uq
  ON public.external_access_grants (
    organization_id, principal_id, vendor_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subcontract_agreement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE portal_kind = 'contractor' AND status = 'active';

CREATE INDEX IF NOT EXISTS external_access_grants_principal_active_idx
  ON public.external_access_grants (principal_id, organization_id)
  WHERE portal_kind = 'contractor' AND status = 'active';

--------------------------------------------------------------------------------
-- 3. Helpers
--------------------------------------------------------------------------------

-- Disabled / invited principals resolve to NULL, so every app.external_* policy denies immediately.
CREATE OR REPLACE FUNCTION app.external_principal_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.id
  FROM public.external_principals p
  WHERE p.auth_user_id = app.current_user_id()
    AND p.archived_at IS NULL
    AND p.status = 'active'
  LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION app.is_contractor_auth_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.external_principals p
    WHERE p.auth_user_id = p_user_id
      AND p.principal_kind = 'contractor'
  )
$fn$;

-- The calling principal holds at least one live contractor grant in the organization.
CREATE OR REPLACE FUNCTION app.external_in_org(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.external_access_grants g
    WHERE g.principal_id = app.external_principal_id()
      AND g.organization_id = p_organization_id
      AND g.portal_kind = 'contractor'
      AND g.status = 'active'
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
  )
$fn$;

-- Internal authority over contractor grants / tokens (DB mirror of the contractor-access guard).
CREATE OR REPLACE FUNCTION app.can_manage_contractor_access(p_organization_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
    AND (
      app.has_org_permission(p_organization_id, 'project_team.admin')
      OR (
        p_project_id IS NOT NULL
        AND (
          app.has_project_capability(p_organization_id, p_project_id, 'external_access.manage')
          OR app.has_project_capability(p_organization_id, p_project_id, 'contractor.invite')
        )
      )
    )
$fn$;

REVOKE ALL ON FUNCTION app.external_principal_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_contractor_auth_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.external_in_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_manage_contractor_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.external_principal_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_contractor_auth_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.external_in_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_manage_contractor_access(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. Contractor auth users never hold organization memberships
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.membership_rejects_contractor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF app.is_contractor_auth_user(NEW.user_id) THEN
    RAISE EXCEPTION 'external contractor accounts cannot join an organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS organization_memberships_reject_contractor ON public.organization_memberships;
CREATE TRIGGER organization_memberships_reject_contractor
  BEFORE INSERT OR UPDATE OF user_id ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION app.membership_rejects_contractor();

CREATE OR REPLACE FUNCTION app.contractor_principal_rejects_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.principal_kind = 'contractor' AND NEW.auth_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_memberships m WHERE m.user_id = NEW.auth_user_id
  ) THEN
    RAISE EXCEPTION 'organization users cannot become external contractor accounts' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS external_principals_reject_member ON public.external_principals;
CREATE TRIGGER external_principals_reject_member
  BEFORE INSERT OR UPDATE OF auth_user_id, principal_kind ON public.external_principals
  FOR EACH ROW EXECUTE FUNCTION app.contractor_principal_rejects_member();

-- Identity columns of a contractor account are immutable once created (no re-pointing an account).
CREATE OR REPLACE FUNCTION app.external_principals_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.principal_kind = 'contractor' AND (
    NEW.principal_kind IS DISTINCT FROM OLD.principal_kind
    OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
    OR NEW.username_normalized IS DISTINCT FROM OLD.username_normalized
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.home_organization_id IS DISTINCT FROM OLD.home_organization_id
  ) THEN
    RAISE EXCEPTION 'external contractor identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS external_principals_identity_immutable ON public.external_principals;
CREATE TRIGGER external_principals_identity_immutable
  BEFORE UPDATE ON public.external_principals
  FOR EACH ROW EXECUTE FUNCTION app.external_principals_identity_immutable();

--------------------------------------------------------------------------------
-- 5. external_principal_tokens (invite / password reset; hash only, single use)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.external_principal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  principal_id uuid NOT NULL REFERENCES public.external_principals (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_principal_tokens_purpose_known CHECK (purpose IN ('invite', 'password_reset')),
  CONSTRAINT external_principal_tokens_hash_shape CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT external_principal_tokens_expiry_after_creation CHECK (expires_at > created_at)
);

ALTER TABLE public.external_principal_tokens DROP CONSTRAINT IF EXISTS external_principal_tokens_project_org_fk;
ALTER TABLE public.external_principal_tokens
  ADD CONSTRAINT external_principal_tokens_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS external_principal_tokens_hash_uq
  ON public.external_principal_tokens (token_hash);
CREATE INDEX IF NOT EXISTS external_principal_tokens_principal_idx
  ON public.external_principal_tokens (principal_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS external_principal_tokens_org_project_idx
  ON public.external_principal_tokens (organization_id, project_id);

--------------------------------------------------------------------------------
-- 6. external_sign_in_attempts (rate limiting / security log)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.external_sign_in_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'sign_in',
  username_hash text NOT NULL,
  ip_hash text,
  principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_sign_in_attempts_kind_known CHECK (kind IN ('sign_in', 'password_reset_request')),
  CONSTRAINT external_sign_in_attempts_outcome_known CHECK (outcome IN (
    'success', 'invalid_credentials', 'inactive', 'locked', 'rate_limited', 'requested'
  ))
);

CREATE INDEX IF NOT EXISTS external_sign_in_attempts_username_idx
  ON public.external_sign_in_attempts (username_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS external_sign_in_attempts_ip_idx
  ON public.external_sign_in_attempts (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

--------------------------------------------------------------------------------
-- 7. Safe portal directory + own-profile update (SECURITY DEFINER, no money, no settings)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.external_portal_directory()
RETURNS TABLE (
  grant_id uuid,
  organization_id uuid,
  organization_name text,
  vendor_id uuid,
  vendor_name text,
  project_id uuid,
  project_name text,
  subcontract_agreement_id uuid,
  agreement_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT g.id, g.organization_id, o.name, g.vendor_id, v.name,
         p.id, p.name, a.id, a.title
  FROM public.external_access_grants g
  JOIN public.organizations o ON o.id = g.organization_id
  JOIN public.vendors v ON v.id = g.vendor_id AND v.organization_id = g.organization_id
  LEFT JOIN public.subcontract_agreements a
    ON a.organization_id = g.organization_id
   AND a.vendor_id = g.vendor_id
   AND a.archived_at IS NULL
   AND a.status <> 'cancelled'
   AND (g.subcontract_agreement_id IS NULL OR a.id = g.subcontract_agreement_id)
   AND (g.project_id IS NULL OR a.project_id = g.project_id)
  LEFT JOIN public.projects p
    ON p.organization_id = g.organization_id
   AND p.id = COALESCE(a.project_id, g.project_id)
  WHERE g.principal_id = app.external_principal_id()
    AND g.portal_kind = 'contractor'
    AND g.status = 'active'
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND jsonb_exists(g.scopes, 'ext.project.view')
$fn$;

CREATE OR REPLACE FUNCTION app.external_update_own_profile(
  p_display_name text,
  p_phone text,
  p_locale text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_principal uuid := app.external_principal_id();
BEGIN
  IF v_principal IS NULL THEN
    RAISE EXCEPTION 'no active external principal' USING ERRCODE = '42501';
  END IF;
  IF p_locale IS NOT NULL AND p_locale NOT IN ('he-IL', 'en', 'ar', 'ru') THEN
    RAISE EXCEPTION 'unknown locale' USING ERRCODE = '22023';
  END IF;
  UPDATE public.external_principals
     SET display_name = NULLIF(btrim(p_display_name), ''),
         phone = NULLIF(btrim(p_phone), ''),
         locale = p_locale,
         updated_at = now()
   WHERE id = v_principal;
END
$fn$;

REVOKE ALL ON FUNCTION app.external_portal_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.external_update_own_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.external_portal_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.external_update_own_profile(text, text, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 8. RLS
--------------------------------------------------------------------------------

-- external_principals: the contractor reads its own row (existing member_select / service_all stay).
DROP POLICY IF EXISTS external_principals_self_select ON public.external_principals;
CREATE POLICY external_principals_self_select ON public.external_principals
  FOR SELECT TO authenticated
  USING (auth_user_id IS NOT NULL AND auth_user_id = app.current_user_id());

-- Internal managers read the contractor accounts their organization created (incl. invited ones,
-- which do not have an active grant yet).
DROP POLICY IF EXISTS external_principals_home_org_select ON public.external_principals;
CREATE POLICY external_principals_home_org_select ON public.external_principals
  FOR SELECT TO authenticated
  USING (home_organization_id IS NOT NULL AND app.is_org_member(home_organization_id));

-- external_access_grants: the contractor reads only its own grants.
DROP POLICY IF EXISTS external_access_grants_principal_select ON public.external_access_grants;
CREATE POLICY external_access_grants_principal_select ON public.external_access_grants
  FOR SELECT TO authenticated
  USING (portal_kind = 'contractor' AND principal_id = app.external_principal_id());

-- Contractor grant writes require contractor-access authority (RESTRICTIVE: ANDed with the
-- existing tenant policies, which allow any member; customer/vendor grants are unaffected).
DROP POLICY IF EXISTS external_access_grants_contractor_insert_guard ON public.external_access_grants;
CREATE POLICY external_access_grants_contractor_insert_guard ON public.external_access_grants
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (portal_kind <> 'contractor' OR app.can_manage_contractor_access(organization_id, project_id));
DROP POLICY IF EXISTS external_access_grants_contractor_update_guard ON public.external_access_grants;
CREATE POLICY external_access_grants_contractor_update_guard ON public.external_access_grants
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (portal_kind <> 'contractor' OR app.can_manage_contractor_access(organization_id, project_id))
  WITH CHECK (portal_kind <> 'contractor' OR app.can_manage_contractor_access(organization_id, project_id));
DROP POLICY IF EXISTS external_access_grants_contractor_delete_guard ON public.external_access_grants;
CREATE POLICY external_access_grants_contractor_delete_guard ON public.external_access_grants
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (portal_kind <> 'contractor' OR app.can_manage_contractor_access(organization_id, project_id));

-- external_principal_tokens: internal managers issue / read / revoke; contractors never touch them
-- (activation and reset run server-side as the trusted connection before any session exists).
ALTER TABLE public.external_principal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_principal_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_principal_tokens_manager_select ON public.external_principal_tokens;
CREATE POLICY external_principal_tokens_manager_select ON public.external_principal_tokens
  FOR SELECT TO authenticated
  USING (app.can_manage_contractor_access(organization_id, project_id));
DROP POLICY IF EXISTS external_principal_tokens_manager_insert ON public.external_principal_tokens;
CREATE POLICY external_principal_tokens_manager_insert ON public.external_principal_tokens
  FOR INSERT TO authenticated
  WITH CHECK (app.can_manage_contractor_access(organization_id, project_id)
    AND created_by_user_id = app.current_user_id() AND consumed_at IS NULL);
DROP POLICY IF EXISTS external_principal_tokens_manager_update ON public.external_principal_tokens;
CREATE POLICY external_principal_tokens_manager_update ON public.external_principal_tokens
  FOR UPDATE TO authenticated
  USING (app.can_manage_contractor_access(organization_id, project_id))
  WITH CHECK (app.can_manage_contractor_access(organization_id, project_id));
DROP POLICY IF EXISTS external_principal_tokens_service_all ON public.external_principal_tokens;
CREATE POLICY external_principal_tokens_service_all ON public.external_principal_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.external_sign_in_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_sign_in_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_sign_in_attempts_service_all ON public.external_sign_in_attempts;
CREATE POLICY external_sign_in_attempts_service_all ON public.external_sign_in_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit_events: external actions are written with metadata.actor = { type: 'external', principalId }
-- by the acting principal only, in organizations where it holds a live grant.
DROP POLICY IF EXISTS audit_events_external_insert ON public.audit_events;
CREATE POLICY audit_events_external_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND actor_user_id IS NULL
    AND metadata IS NOT NULL
    AND (metadata -> 'actor' ->> 'type') = 'external'
    AND (metadata -> 'actor' ->> 'principalId') = app.external_principal_id()::text
    AND app.external_in_org(organization_id)
  );

GRANT SELECT, INSERT, UPDATE ON public.external_principal_tokens TO authenticated;
GRANT ALL PRIVILEGES ON public.external_principal_tokens TO service_role;
REVOKE ALL ON public.external_sign_in_attempts FROM authenticated;
GRANT ALL PRIVILEGES ON public.external_sign_in_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.external_principals TO service_role;
