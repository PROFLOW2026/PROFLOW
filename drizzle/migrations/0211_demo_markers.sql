-- 0211_demo_markers.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- DATA MUTATION: NONE. Existing organizations keep demo_kind NULL.
-- SCHEMA MUTATION: demo markers, session actors, library catalog, reset bookkeeping, RLS, demo_kind guard.
-- Does not edit 0205-0210 and does not replace takeoff or document guards.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_demo_kind_known'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_demo_kind_known
      CHECK (demo_kind IS NULL OR demo_kind IN ('template', 'session'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.demo_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.demo_kind IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.demo_kind IS NOT DISTINCT FROM OLD.demo_kind THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('authenticated', 'anon')
     OR current_setting('app.demo_provisioner', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'demo_kind cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS organizations_demo_kind_guard ON public.organizations;
CREATE TRIGGER organizations_demo_kind_guard
  BEFORE INSERT OR UPDATE OF demo_kind ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION app.demo_kind_guard();

CREATE TABLE IF NOT EXISTS public.demo_sessions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  template_organization_id uuid NOT NULL,
  profile_key text NOT NULL,
  browser_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_session_actors (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  auth_user_id uuid NOT NULL,
  email text NOT NULL,
  PRIMARY KEY (organization_id, role_key),
  CONSTRAINT demo_session_actors_role_known CHECK (
    role_key IN ('owner', 'manager', 'finance', 'worker', 'employee', 'contractor')
  )
);

CREATE TABLE IF NOT EXISTS public.demo_library_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_file_id text NOT NULL,
  display_name text NOT NULL,
  content_type text NOT NULL,
  UNIQUE (provider, provider_file_id)
);

CREATE TABLE IF NOT EXISTS public.demo_reset_runs (
  jerusalem_date date PRIMARY KEY,
  status text NOT NULL,
  lease_until timestamptz,
  last_error text,
  CONSTRAINT demo_reset_runs_status_known CHECK (
    status IN ('pending', 'running', 'failed', 'completed')
  )
);

CREATE TABLE IF NOT EXISTS public.demo_reset_items (
  jerusalem_date date NOT NULL,
  organization_id uuid NOT NULL,
  phase text NOT NULL,
  status text NOT NULL,
  storage_prefix text,
  auth_user_ids uuid[] NOT NULL DEFAULT '{}',
  profile_ids uuid[] NOT NULL DEFAULT '{}',
  last_error text,
  PRIMARY KEY (jerusalem_date, organization_id, phase),
  CONSTRAINT demo_reset_items_phase_known CHECK (phase IN ('rows', 'storage', 'auth')),
  CONSTRAINT demo_reset_items_status_known CHECK (
    status IN ('pending', 'running', 'failed', 'completed')
  )
);

CREATE INDEX IF NOT EXISTS demo_sessions_browser_idx
  ON public.demo_sessions (browser_token_hash);

CREATE OR REPLACE FUNCTION app.demo_marker_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF current_user IN ('authenticated', 'anon')
     OR current_setting('app.demo_provisioner', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'demo markers are not writable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS demo_sessions_guard ON public.demo_sessions;
CREATE TRIGGER demo_sessions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.demo_sessions
  FOR EACH ROW EXECUTE FUNCTION app.demo_marker_guard();

DROP TRIGGER IF EXISTS demo_session_actors_guard ON public.demo_session_actors;
CREATE TRIGGER demo_session_actors_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.demo_session_actors
  FOR EACH ROW EXECUTE FUNCTION app.demo_marker_guard();

ALTER TABLE public.demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demo_session_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_session_actors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demo_library_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_library_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demo_reset_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_reset_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demo_reset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_reset_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.demo_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.demo_session_actors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.demo_library_files FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.demo_reset_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.demo_reset_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.demo_kind_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_marker_guard() FROM PUBLIC;
