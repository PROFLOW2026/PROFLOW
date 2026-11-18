-- 0215_demo_session_cleanup.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- SCHEMA: organizations.demo_abandoned_at; demo-only budget purge bypass under app.demo_provisioner.
-- DATA MUTATION: none (additive column, default NULL).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_abandoned_at timestamptz;

COMMENT ON COLUMN public.organizations.demo_abandoned_at IS
  'Set when a demo session org is soft-abandoned; required identity for gated abandoned-org sweeper.';

-- Demo-only budget purge. `app.demo_provisioner` is a session GUC and is NOT an identity:
-- anyone can set_config it. Authorization therefore rests on the effective role (current_user)
-- and its catalog attributes, which set_config cannot change. Request traffic runs as
-- `authenticated` / `anon` (PostgREST also uses `authenticator`) and is always refused before any
-- table is read. The trusted service connection must be superuser or BYPASSRLS — it already needs
-- that to read FORCE-RLS `demo_sessions`. Invoker rights on purpose: SECURITY DEFINER would
-- replace current_user with the owner and erase the caller identity.
CREATE OR REPLACE FUNCTION app.demo_session_budget_purge_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  IF current_setting('app.demo_provisioner', true) IS DISTINCT FROM 'on' THEN
    RETURN false;
  END IF;

  IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
    RETURN false;
  END IF;

  SELECT r.rolsuper OR r.rolbypassrls
    INTO v_trusted
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = current_user;
  IF NOT COALESCE(v_trusted, false) THEN
    RETURN false;
  END IF;

  -- Same identity the application requires to delete the organization row: a session org with
  -- either a live demo_sessions row or a durable demo_abandoned_at marker. Never name-based.
  RETURN EXISTS (
    SELECT 1
    FROM public.organizations AS o
    WHERE o.id = p_org_id
      AND o.demo_kind = 'session'
      AND (
        EXISTS (
          SELECT 1 FROM public.demo_sessions AS session_row
          WHERE session_row.organization_id = o.id
        )
        OR o.demo_abandoned_at IS NOT NULL
      )
  );
END
$$;

REVOKE ALL ON FUNCTION app.demo_session_budget_purge_allowed(uuid) FROM PUBLIC;
-- Budget guards call this as the invoking role. Request roles need EXECUTE so a legitimate
-- pristine-draft delete on a real organization does not fail with "permission denied";
-- the function returns false for them before touching any table.
GRANT EXECUTE ON FUNCTION app.demo_session_budget_purge_allowed(uuid) TO authenticated, service_role;

-- Abandoned session orgs (demo_abandoned_at, no demo_sessions row) still need takeoff purge proof.
CREATE OR REPLACE FUNCTION app.demo_takeoff_purge_proof_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_nonce text;
BEGIN
  IF OLD.demo_kind = 'session' AND (
    EXISTS (
      SELECT 1 FROM public.demo_sessions AS session_row
      WHERE session_row.organization_id = OLD.id
    )
    OR OLD.demo_abandoned_at IS NOT NULL
  ) THEN
    v_nonce := gen_random_uuid()::text;
    DELETE FROM public.demo_takeoff_purge_proof WHERE organization_id = OLD.id;
    INSERT INTO public.demo_takeoff_purge_proof (organization_id, nonce)
    VALUES (OLD.id, v_nonce);
    PERFORM set_config('app.demo_takeoff_purge_nonce', v_nonce, true);
  ELSE
    DELETE FROM public.demo_takeoff_purge_proof WHERE organization_id = OLD.id;
    PERFORM set_config('app.demo_takeoff_purge_nonce', '', true);
  END IF;
  RETURN OLD;
END
$fn$;

CREATE OR REPLACE FUNCTION app.project_budgets_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  max_revision integer;
  has_history boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'active') THEN
      RAISE EXCEPTION 'project_budgets: new budgets must start as draft or active'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.current_revision_number < 1 THEN
      RAISE EXCEPTION 'project_budgets: revision number must be >= 1'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF app.demo_session_budget_purge_allowed(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'project_budgets: only a pristine draft can be hard-deleted; archive or supersede instead'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_budget_revisions r WHERE r.budget_id = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM public.project_budget_lines l WHERE l.budget_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'project_budgets: history-bearing budgets cannot be hard-deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM public.project_budget_revisions r WHERE r.budget_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_id = OLD.id)
    INTO has_history;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'project_budgets: identity is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF has_history OR OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'project_budgets: currency is frozen after history starts'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.current_revision_number < OLD.current_revision_number THEN
      RAISE EXCEPTION 'project_budgets: current revision cannot move backwards'
        USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT COALESCE(MAX(r.revision_number), OLD.current_revision_number)
      INTO max_revision
      FROM public.project_budget_revisions r
      WHERE r.budget_id = OLD.id;
    IF NEW.current_revision_number > max_revision THEN
      RAISE EXCEPTION 'project_budgets: current revision must track an existing revision'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.total_budget_amount IS DISTINCT FROM OLD.total_budget_amount
       AND NEW.current_revision_number = OLD.current_revision_number THEN
      RAISE EXCEPTION 'project_budgets: totals change only through a new revision'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'superseded' AND NEW.status IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION 'project_budgets: superseded budgets cannot change status'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('active', 'superseded') THEN
    RAISE EXCEPTION 'project_budgets: active budgets may only stay active or become superseded'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'active', 'superseded') THEN
    RAISE EXCEPTION 'project_budgets: invalid status transition'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.project_budget_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_RELNAME = 'project_budget_revisions' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' AND app.demo_session_budget_purge_allowed(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'project_budget_revisions: historical revisions are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_RELNAME = 'project_budget_lines' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' AND app.demo_session_budget_purge_allowed(OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'project_budget_lines: revision lines cannot be rewritten; create a new revision'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NULL;
END;
$$;