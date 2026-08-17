-- 0056_closeout_warranty
-- Additive only. Does NOT modify 0000–0055.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Project closeout overlay + warranty coverages/issues.
-- Does not rewrite project_status enum: Closed = existing `completed`.
-- Ready-to-close is closeout.status, not a new project status.
-- Warranty issues may link a service work order without reopening the project.
-- Closeout events are append-only history. Same-project composite FKs.

--------------------------------------------------------------------------------
-- Closeout
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_closeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  financial_snapshot_json jsonb,
  close_reason text,
  reopen_reason text,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reopened_at timestamptz,
  reopened_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_closeouts_status_known CHECK (
    status IN ('open', 'ready', 'closed', 'reopened')
  ),
  CONSTRAINT project_closeouts_closed_identity CHECK (
    (status = 'open'
      AND closed_at IS NULL
      AND closed_by_user_id IS NULL
      AND reopened_at IS NULL
      AND reopened_by_user_id IS NULL)
    OR (status = 'ready'
      AND (
        (closed_at IS NULL AND closed_by_user_id IS NULL)
        OR (closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL)
      ))
    OR (status = 'closed'
      AND closed_at IS NOT NULL
      AND closed_by_user_id IS NOT NULL)
    OR (status = 'reopened'
      AND closed_at IS NOT NULL
      AND closed_by_user_id IS NOT NULL
      AND reopened_at IS NOT NULL
      AND reopened_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_closeouts_id_organization_id_uq
  ON public.project_closeouts (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_closeouts_id_org_project_uq
  ON public.project_closeouts (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_closeouts_org_project_uq
  ON public.project_closeouts (organization_id, project_id);
CREATE INDEX IF NOT EXISTS project_closeouts_org_status_idx
  ON public.project_closeouts (organization_id, status);

ALTER TABLE public.project_closeouts
  DROP CONSTRAINT IF EXISTS project_closeouts_project_org_fk;
ALTER TABLE public.project_closeouts
  ADD CONSTRAINT project_closeouts_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.project_closeout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  closeout_id uuid NOT NULL,
  project_id uuid NOT NULL,
  event_kind text NOT NULL,
  reason text,
  snapshot_json jsonb,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_closeout_events_kind_known CHECK (
    event_kind IN ('started', 'marked_ready', 'closed', 'reopened')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_closeout_events_id_organization_id_uq
  ON public.project_closeout_events (id, organization_id);
CREATE INDEX IF NOT EXISTS project_closeout_events_closeout_idx
  ON public.project_closeout_events (organization_id, closeout_id);

ALTER TABLE public.project_closeout_events
  DROP CONSTRAINT IF EXISTS project_closeout_events_closeout_org_fk;
ALTER TABLE public.project_closeout_events
  DROP CONSTRAINT IF EXISTS project_closeout_events_closeout_project_fk;
ALTER TABLE public.project_closeout_events
  ADD CONSTRAINT project_closeout_events_closeout_project_fk
  FOREIGN KEY (closeout_id, organization_id, project_id)
  REFERENCES public.project_closeouts (id, organization_id, project_id)
  ON DELETE CASCADE;

ALTER TABLE public.project_closeout_events
  DROP CONSTRAINT IF EXISTS project_closeout_events_project_org_fk;
ALTER TABLE public.project_closeout_events
  ADD CONSTRAINT project_closeout_events_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- Warranty
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warranty_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  work_package_id uuid,
  vendor_id uuid,
  coverage_type text NOT NULL DEFAULT 'workmanship',
  title text NOT NULL,
  notes text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'scheduled',
  reminder_days_before integer NOT NULL DEFAULT 30,
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warranty_coverages_type_known CHECK (
    coverage_type IN ('workmanship', 'materials', 'equipment', 'mixed')
  ),
  CONSTRAINT warranty_coverages_status_known CHECK (
    status IN ('scheduled', 'active', 'expired', 'void')
  ),
  CONSTRAINT warranty_coverages_dates_order CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT warranty_coverages_reminder_nonneg CHECK (reminder_days_before >= 0),
  CONSTRAINT warranty_coverages_title_nonblank CHECK (length(btrim(title)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS warranty_coverages_id_organization_id_uq
  ON public.warranty_coverages (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_coverages_id_org_project_uq
  ON public.warranty_coverages (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS warranty_coverages_org_project_idx
  ON public.warranty_coverages (organization_id, project_id);
CREATE INDEX IF NOT EXISTS warranty_coverages_org_end_idx
  ON public.warranty_coverages (organization_id, end_date, status);

ALTER TABLE public.warranty_coverages
  DROP CONSTRAINT IF EXISTS warranty_coverages_project_org_fk;
ALTER TABLE public.warranty_coverages
  ADD CONSTRAINT warranty_coverages_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.warranty_coverages
  DROP CONSTRAINT IF EXISTS warranty_coverages_wp_org_fk;
ALTER TABLE public.warranty_coverages
  DROP CONSTRAINT IF EXISTS warranty_coverages_wp_project_fk;
ALTER TABLE public.warranty_coverages
  ADD CONSTRAINT warranty_coverages_wp_project_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id)
  ON DELETE SET NULL (work_package_id);

ALTER TABLE public.warranty_coverages
  DROP CONSTRAINT IF EXISTS warranty_coverages_vendor_org_fk;
ALTER TABLE public.warranty_coverages
  ADD CONSTRAINT warranty_coverages_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE SET NULL (vendor_id);

CREATE TABLE IF NOT EXISTS public.warranty_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  coverage_id uuid NOT NULL,
  project_id uuid NOT NULL,
  work_order_id uuid,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'open',
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warranty_issues_status_known CHECK (
    status IN ('open', 'in_progress', 'resolved', 'cancelled')
  ),
  CONSTRAINT warranty_issues_title_nonblank CHECK (length(btrim(title)) > 0),
  CONSTRAINT warranty_issues_resolved_ts CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolved_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS warranty_issues_id_organization_id_uq
  ON public.warranty_issues (id, organization_id);
CREATE INDEX IF NOT EXISTS warranty_issues_org_coverage_idx
  ON public.warranty_issues (organization_id, coverage_id);
CREATE INDEX IF NOT EXISTS warranty_issues_org_project_idx
  ON public.warranty_issues (organization_id, project_id);

ALTER TABLE public.warranty_issues
  DROP CONSTRAINT IF EXISTS warranty_issues_coverage_org_fk;
ALTER TABLE public.warranty_issues
  DROP CONSTRAINT IF EXISTS warranty_issues_coverage_project_fk;
ALTER TABLE public.warranty_issues
  ADD CONSTRAINT warranty_issues_coverage_project_fk
  FOREIGN KEY (coverage_id, organization_id, project_id)
  REFERENCES public.warranty_coverages (id, organization_id, project_id)
  ON DELETE CASCADE;

ALTER TABLE public.warranty_issues
  DROP CONSTRAINT IF EXISTS warranty_issues_project_org_fk;
ALTER TABLE public.warranty_issues
  ADD CONSTRAINT warranty_issues_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.warranty_issues
  DROP CONSTRAINT IF EXISTS warranty_issues_work_order_org_fk;
ALTER TABLE public.warranty_issues
  ADD CONSTRAINT warranty_issues_work_order_org_fk
  FOREIGN KEY (work_order_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE SET NULL (work_order_id);

-- Linked work order must be same-org work_kind = work_order (or null).
-- It is intentionally a separate projects row and must not equal coverage.project_id
-- as a "same project" requirement — it must not reopen the original project.
CREATE OR REPLACE FUNCTION app.warranty_issues_work_order_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_kind text;
BEGIN
  IF NEW.work_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT work_kind INTO v_kind
  FROM public.projects
  WHERE id = NEW.work_order_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'warranty_issues: work order missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_kind IS DISTINCT FROM 'work_order' THEN
    RAISE EXCEPTION 'warranty_issues: linked work order must be a service call'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.work_order_id = NEW.project_id THEN
    RAISE EXCEPTION 'warranty_issues: work order cannot be the original project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS warranty_issues_work_order_guard ON public.warranty_issues;
CREATE TRIGGER warranty_issues_work_order_guard
  BEFORE INSERT OR UPDATE OF work_order_id, project_id, organization_id
  ON public.warranty_issues
  FOR EACH ROW
  EXECUTE FUNCTION app.warranty_issues_work_order_guard();

REVOKE ALL ON FUNCTION app.warranty_issues_work_order_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.warranty_issues_work_order_guard() TO service_role;

--------------------------------------------------------------------------------
-- Classic-project-only closeout + immutable closed snapshot / lifecycle
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.project_closeouts_classic_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_kind text;
BEGIN
  SELECT work_kind INTO v_kind
  FROM public.projects
  WHERE id = NEW.project_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_closeouts: project missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_kind IS DISTINCT FROM 'project' THEN
    RAISE EXCEPTION 'project_closeouts: jobs and work orders cannot enter classic closeout'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_closeouts_classic_kind ON public.project_closeouts;
CREATE TRIGGER project_closeouts_classic_kind
  BEFORE INSERT OR UPDATE OF project_id, organization_id
  ON public.project_closeouts
  FOR EACH ROW
  EXECUTE FUNCTION app.project_closeouts_classic_kind();

REVOKE ALL ON FUNCTION app.project_closeouts_classic_kind() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_closeouts_classic_kind() TO service_role;

CREATE OR REPLACE FUNCTION app.project_closeouts_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_latched boolean;
BEGIN
  v_latched := app.next_gen_latch_held('closeout');

  IF TG_OP = 'DELETE' THEN
    IF NOT v_latched THEN
      RAISE EXCEPTION 'project_closeouts: history cannot be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_latched THEN
      RAISE EXCEPTION 'project_closeouts: rows are created only through closeout functions'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'project_closeouts: new rows must start open'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.financial_snapshot_json IS NOT NULL
       OR NEW.closed_at IS NOT NULL
       OR NEW.closed_by_user_id IS NOT NULL
       OR NEW.reopened_at IS NOT NULL
       OR NEW.reopened_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'project_closeouts: close identity must be empty on insert'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'project_closeouts: identity is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT v_latched THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.financial_snapshot_json IS DISTINCT FROM OLD.financial_snapshot_json
       OR NEW.close_reason IS DISTINCT FROM OLD.close_reason
       OR NEW.reopen_reason IS DISTINCT FROM OLD.reopen_reason
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
       OR NEW.closed_by_user_id IS DISTINCT FROM OLD.closed_by_user_id
       OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
       OR NEW.reopened_by_user_id IS DISTINCT FROM OLD.reopened_by_user_id THEN
      RAISE EXCEPTION 'project_closeouts: status transitions require the closeout path'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'closed' THEN
    IF NEW.status IS DISTINCT FROM 'reopened' AND NEW.status IS DISTINCT FROM 'closed' THEN
      RAISE EXCEPTION 'project_closeouts: closed projects reopen explicitly'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'closed'
       AND (
         NEW.closed_at IS DISTINCT FROM OLD.closed_at
         OR NEW.closed_by_user_id IS DISTINCT FROM OLD.closed_by_user_id
         OR NEW.close_reason IS DISTINCT FROM OLD.close_reason
         OR NEW.financial_snapshot_json IS DISTINCT FROM OLD.financial_snapshot_json
       ) THEN
      RAISE EXCEPTION 'project_closeouts: closed history cannot be rewritten'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'reopened' AND NEW.status NOT IN ('reopened', 'closed', 'ready') THEN
    RAISE EXCEPTION 'project_closeouts: invalid reopen transition'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('open', 'ready') AND NEW.status NOT IN ('open', 'ready', 'closed') THEN
    RAISE EXCEPTION 'project_closeouts: invalid status transition'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.closed_at := clock_timestamp();
    NEW.closed_by_user_id := app.current_user_id();
    NEW.reopened_at := NULL;
    NEW.reopened_by_user_id := NULL;
    IF NEW.closed_by_user_id IS NULL THEN
      RAISE EXCEPTION 'project_closeouts: close requires the current actor'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.close_reason IS NULL OR length(btrim(NEW.close_reason)) = 0 THEN
      RAISE EXCEPTION 'project_closeouts: close requires a reason'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.financial_snapshot_json IS NULL THEN
      RAISE EXCEPTION 'project_closeouts: close requires a fresh financial snapshot'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.status = 'reopened' AND OLD.status IS DISTINCT FROM 'reopened' THEN
    IF OLD.status IS DISTINCT FROM 'closed' THEN
      RAISE EXCEPTION 'project_closeouts: only closed projects can reopen'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.reopen_reason IS NULL OR length(btrim(NEW.reopen_reason)) = 0 THEN
      RAISE EXCEPTION 'project_closeouts: reopen requires a reason'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.reopened_at := clock_timestamp();
    NEW.reopened_by_user_id := app.current_user_id();
    IF NEW.reopened_by_user_id IS NULL THEN
      RAISE EXCEPTION 'project_closeouts: reopen requires the current actor'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.closed_at := OLD.closed_at;
    NEW.closed_by_user_id := OLD.closed_by_user_id;
    NEW.close_reason := OLD.close_reason;
    NEW.financial_snapshot_json := OLD.financial_snapshot_json;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_closeouts_lifecycle_guard ON public.project_closeouts;
CREATE TRIGGER project_closeouts_lifecycle_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_closeouts
  FOR EACH ROW
  EXECUTE FUNCTION app.project_closeouts_lifecycle_guard();

REVOKE ALL ON FUNCTION app.project_closeouts_lifecycle_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_closeouts_lifecycle_guard() TO service_role;

DROP TRIGGER IF EXISTS project_closeout_events_append_only ON public.project_closeout_events;
CREATE TRIGGER project_closeout_events_append_only
  BEFORE UPDATE OR DELETE ON public.project_closeout_events
  FOR EACH ROW
  EXECUTE FUNCTION app.append_only_guard();

CREATE OR REPLACE FUNCTION app.project_closeout_events_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT app.next_gen_latch_held('closeout') THEN
    RAISE EXCEPTION 'project_closeout_events: events are written only by the closeout path'
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.actor_user_id := app.current_user_id();
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_closeout_events_insert_guard ON public.project_closeout_events;
CREATE TRIGGER project_closeout_events_insert_guard
  BEFORE INSERT ON public.project_closeout_events
  FOR EACH ROW
  EXECUTE FUNCTION app.project_closeout_events_insert_guard();

REVOKE ALL ON FUNCTION app.project_closeout_events_insert_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_closeout_events_insert_guard() TO service_role;

CREATE OR REPLACE FUNCTION app.projects_classic_closeout_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_has_closeout boolean;
  v_row_security text;
BEGIN
  v_row_security := current_setting('row_security', true);
  PERFORM set_config('row_security', 'off', true);
  SELECT EXISTS (
    SELECT 1 FROM public.project_closeouts c
    WHERE c.project_id = OLD.id
      AND c.organization_id = OLD.organization_id
  ) INTO v_has_closeout;
  PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);

  IF v_has_closeout AND NEW.work_kind IS DISTINCT FROM 'project' THEN
    RAISE EXCEPTION 'projects: work_kind cannot leave project once closeout exists'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF OLD.work_kind = 'project' OR NEW.work_kind = 'project' THEN
      IF NOT app.next_gen_latch_held('closeout') THEN
        RAISE EXCEPTION 'projects: classic projects close and reopen only through closeout'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    IF OLD.work_kind = 'project' OR NEW.work_kind = 'project' OR v_has_closeout THEN
      IF NOT app.next_gen_latch_held('closeout') THEN
        RAISE EXCEPTION 'projects: classic projects close and reopen only through closeout'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.work_kind = 'project'
     AND OLD.work_kind IS DISTINCT FROM 'project'
     AND NEW.status = 'completed'
     AND NOT app.next_gen_latch_held('closeout') THEN
    RAISE EXCEPTION 'projects: classic projects close and reopen only through closeout'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS projects_classic_closeout_status_guard ON public.projects;
CREATE TRIGGER projects_classic_closeout_status_guard
  BEFORE UPDATE OF status, work_kind ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION app.projects_classic_closeout_status_guard();

REVOKE ALL ON FUNCTION app.projects_classic_closeout_status_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.projects_classic_closeout_status_guard() TO service_role;

CREATE OR REPLACE FUNCTION app.projects_closeout_history_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row_security text;
BEGIN
  v_row_security := current_setting('row_security', true);
  PERFORM set_config('row_security', 'off', true);
  IF EXISTS (
    SELECT 1 FROM public.project_closeouts c
    WHERE c.project_id = OLD.id
      AND c.organization_id = OLD.organization_id
  ) THEN
    PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
    IF current_setting('role', true) = 'authenticated'
       AND EXISTS (
         SELECT 1 FROM public.organizations o WHERE o.id = OLD.organization_id
       ) THEN
      RAISE EXCEPTION 'projects: closeout history cannot be erased'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS projects_closeout_history_delete_guard ON public.projects;
CREATE TRIGGER projects_closeout_history_delete_guard
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION app.projects_closeout_history_delete_guard();

REVOKE ALL ON FUNCTION app.projects_closeout_history_delete_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.projects_closeout_history_delete_guard() TO service_role;

-- Class B tenant RPCs: unconditionally check org + projects.update + project access + work_kind.
CREATE OR REPLACE FUNCTION app.closeout_assert_writer(
  p_organization_id uuid,
  p_project_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_kind text;
  v_actor uuid;
BEGIN
  v_actor := app.current_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'closeout: current actor is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'closeout: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'projects.update') THEN
    RAISE EXCEPTION 'closeout: requires projects.update'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.can_access_project(p_organization_id, p_project_id) THEN
    RAISE EXCEPTION 'closeout: project is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT work_kind INTO v_kind
  FROM public.projects
  WHERE id = p_project_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'closeout: project missing in organization'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_kind IS DISTINCT FROM 'project' THEN
    RAISE EXCEPTION 'closeout: jobs and work orders cannot enter classic closeout'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_actor;
END;
$fn$;

REVOKE ALL ON FUNCTION app.closeout_assert_writer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.closeout_assert_writer(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.closeout_assert_writer(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.closeout_assert_writer(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.start_project_closeout(
  p_organization_id uuid,
  p_project_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app.closeout_assert_writer(p_organization_id, p_project_id);
  PERFORM app.next_gen_latch_acquire('closeout');
  BEGIN
    SELECT id INTO v_id
    FROM public.project_closeouts
    WHERE organization_id = p_organization_id AND project_id = p_project_id
    FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO public.project_closeouts (organization_id, project_id, status)
      VALUES (p_organization_id, p_project_id, 'open')
      RETURNING id INTO v_id;
      INSERT INTO public.project_closeout_events (
        organization_id, closeout_id, project_id, event_kind
      ) VALUES (
        p_organization_id, v_id, p_project_id, 'started'
      );
    END IF;
    PERFORM app.next_gen_latch_release('closeout');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('closeout');
    RAISE;
  END;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.mark_project_closeout_ready(
  p_organization_id uuid,
  p_project_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  PERFORM app.closeout_assert_writer(p_organization_id, p_project_id);
  PERFORM app.next_gen_latch_acquire('closeout');
  BEGIN
    SELECT id, status INTO v_id, v_status
    FROM public.project_closeouts
    WHERE organization_id = p_organization_id AND project_id = p_project_id
    FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO public.project_closeouts (organization_id, project_id, status)
      VALUES (p_organization_id, p_project_id, 'open')
      RETURNING id INTO v_id;
      INSERT INTO public.project_closeout_events (
        organization_id, closeout_id, project_id, event_kind
      ) VALUES (
        p_organization_id, v_id, p_project_id, 'started'
      );
      v_status := 'open';
    END IF;
    IF v_status NOT IN ('open', 'ready', 'reopened') THEN
      RAISE EXCEPTION 'project_closeouts: invalid ready transition'
        USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.project_closeouts
    SET status = 'ready', updated_at = clock_timestamp()
    WHERE id = v_id AND organization_id = p_organization_id;
    INSERT INTO public.project_closeout_events (
      organization_id, closeout_id, project_id, event_kind
    ) VALUES (
      p_organization_id, v_id, p_project_id, 'marked_ready'
    );
    PERFORM app.next_gen_latch_release('closeout');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('closeout');
    RAISE;
  END;
END;
$fn$;

-- Tenant cannot supply the financial snapshot. Authenticated authorizes via the
-- application; only service_role writes snapshot + status + event, as the actor.
DROP FUNCTION IF EXISTS app.close_project_via_closeout(uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION app.organization_business_date(p_organization_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (timezone(o.timezone, clock_timestamp()))::date
  FROM public.organizations o
  WHERE o.id = p_organization_id
$$;

REVOKE ALL ON FUNCTION app.organization_business_date(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_business_date(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.close_project_via_closeout(
  p_organization_id uuid,
  p_project_id uuid,
  p_reason text,
  p_snapshot jsonb,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_status text;
  v_reason text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'closeout: actor is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.user_id', p_actor_user_id::text, true);
  PERFORM app.closeout_assert_writer(p_organization_id, p_project_id);
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'project_closeouts: close requires a reason'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF p_snapshot IS NULL THEN
    RAISE EXCEPTION 'project_closeouts: close requires a fresh financial snapshot'
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM app.next_gen_latch_acquire('closeout');
  BEGIN
    SELECT id, status INTO v_id, v_status
    FROM public.project_closeouts
    WHERE organization_id = p_organization_id AND project_id = p_project_id
    FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO public.project_closeouts (organization_id, project_id, status)
      VALUES (p_organization_id, p_project_id, 'open')
      RETURNING id INTO v_id;
      INSERT INTO public.project_closeout_events (
        organization_id, closeout_id, project_id, event_kind
      ) VALUES (
        p_organization_id, v_id, p_project_id, 'started'
      );
      v_status := 'open';
    END IF;
    IF v_status NOT IN ('open', 'ready', 'reopened') THEN
      RAISE EXCEPTION 'project_closeouts: invalid close transition'
        USING ERRCODE = 'restrict_violation';
    END IF;

    UPDATE public.project_closeouts
    SET
      status = 'closed',
      financial_snapshot_json = p_snapshot,
      close_reason = v_reason,
      updated_at = clock_timestamp()
    WHERE id = v_id AND organization_id = p_organization_id;

    UPDATE public.projects
    SET
      status = 'completed',
      actual_end_date = app.organization_business_date(p_organization_id),
      updated_at = clock_timestamp()
    WHERE id = p_project_id AND organization_id = p_organization_id;

    INSERT INTO public.project_closeout_events (
      organization_id, closeout_id, project_id, event_kind, reason, snapshot_json
    ) VALUES (
      p_organization_id, v_id, p_project_id, 'closed', v_reason, p_snapshot
    );

    PERFORM app.next_gen_latch_release('closeout');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('closeout');
    RAISE;
  END;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.reopen_project_via_closeout(
  p_organization_id uuid,
  p_project_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_status text;
  v_reason text;
  v_snapshot jsonb;
BEGIN
  PERFORM app.closeout_assert_writer(p_organization_id, p_project_id);
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'project_closeouts: reopen requires a reason'
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM app.next_gen_latch_acquire('closeout');
  BEGIN
    SELECT id, status, financial_snapshot_json INTO v_id, v_status, v_snapshot
    FROM public.project_closeouts
    WHERE organization_id = p_organization_id AND project_id = p_project_id
    FOR UPDATE;
    IF v_id IS NULL OR v_status IS DISTINCT FROM 'closed' THEN
      RAISE EXCEPTION 'project_closeouts: only closed projects can reopen'
        USING ERRCODE = 'restrict_violation';
    END IF;

    UPDATE public.project_closeouts
    SET
      status = 'reopened',
      reopen_reason = v_reason,
      updated_at = clock_timestamp()
    WHERE id = v_id AND organization_id = p_organization_id;

    UPDATE public.projects
    SET
      status = 'active',
      actual_end_date = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_project_id AND organization_id = p_organization_id;

    INSERT INTO public.project_closeout_events (
      organization_id, closeout_id, project_id, event_kind, reason, snapshot_json
    ) VALUES (
      p_organization_id, v_id, p_project_id, 'reopened', v_reason, v_snapshot
    );

    PERFORM app.next_gen_latch_release('closeout');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('closeout');
    RAISE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.start_project_closeout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_project_closeout(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION app.mark_project_closeout_ready(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_project_closeout_ready(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION app.close_project_via_closeout(uuid, uuid, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.close_project_via_closeout(uuid, uuid, text, jsonb, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.close_project_via_closeout(uuid, uuid, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.close_project_via_closeout(uuid, uuid, text, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reopen_project_via_closeout(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reopen_project_via_closeout(uuid, uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Document owner access for closeout / warranty (fail-closed unknown types)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.can_access_next_gen_document_owner(
  p_organization_id uuid,
  p_owner_type text,
  p_owner_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_owner_type = 'warranty_coverage' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_coverages w
      WHERE w.id = p_owner_id
        AND w.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, w.project_id)
    );
  END IF;
  IF p_owner_type = 'warranty_issue' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_issues i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'closeout' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.project_closeouts c
      WHERE c.id = p_owner_id
        AND c.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, c.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.can_access_document_owner(
  p_organization_id uuid,
  p_owner_type text,
  p_owner_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Org-library folders/documents: both owner fields null.
  -- One-sided null or unknown types fail closed.
  IF p_owner_type IS NULL AND p_owner_id IS NULL THEN
    RETURN app.is_org_member(p_organization_id);
  END IF;
  IF p_organization_id IS NULL OR p_owner_type IS NULL OR p_owner_id IS NULL THEN
    RETURN false;
  END IF;
  IF p_owner_type IN ('project', 'job', 'work_order') THEN
    RETURN app.can_access_project(p_organization_id, p_owner_id);
  END IF;
  IF p_owner_type = 'contract' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = p_owner_id AND c.organization_id = p_organization_id
        AND (c.project_id IS NULL OR app.can_access_project(p_organization_id, c.project_id))
    );
  END IF;
  IF p_owner_type = 'expense' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = p_owner_id AND e.organization_id = p_organization_id
        AND (e.project_id IS NULL OR app.can_access_project(p_organization_id, e.project_id))
    );
  END IF;
  IF p_owner_type = 'billing_record' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.billing_records b
      WHERE b.id = p_owner_id AND b.organization_id = p_organization_id
        AND (b.project_id IS NULL OR app.can_access_project(p_organization_id, b.project_id))
    );
  END IF;
  IF p_owner_type = 'change_request' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.change_requests c
      WHERE c.id = p_owner_id AND c.organization_id = p_organization_id
        AND (c.project_id IS NULL OR app.can_access_project(p_organization_id, c.project_id))
    );
  END IF;
  IF p_owner_type = 'change_order' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.change_orders c
      WHERE c.id = p_owner_id AND c.organization_id = p_organization_id
        AND (c.project_id IS NULL OR app.can_access_project(p_organization_id, c.project_id))
    );
  END IF;
  IF p_owner_type = 'quote_version' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.quote_versions qv
      JOIN public.quotes q ON q.id = qv.quote_id AND q.organization_id = qv.organization_id
      WHERE qv.id = p_owner_id AND qv.organization_id = p_organization_id
        AND (q.project_id IS NULL OR app.can_access_project(p_organization_id, q.project_id))
    );
  END IF;
  IF p_owner_type = 'daily_log' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_owner_id AND d.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, d.project_id)
    );
  END IF;
  IF p_owner_type = 'punch_list_item' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.punch_list_items p
      WHERE p.id = p_owner_id AND p.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, p.project_id)
    );
  END IF;
  IF p_owner_type = 'inspection' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = p_owner_id AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'subcontract_agreement' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.subcontract_agreements s
      WHERE s.id = p_owner_id AND s.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, s.project_id)
    );
  END IF;
  IF p_owner_type = 'safety_record' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.safety_records s
      WHERE s.id = p_owner_id AND s.organization_id = p_organization_id
        AND (s.project_id IS NULL OR app.can_access_project(p_organization_id, s.project_id))
    );
  END IF;
  IF p_owner_type = 'purchase_order' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.id = p_owner_id AND p.organization_id = p_organization_id
        AND (p.project_id IS NULL OR app.can_access_project(p_organization_id, p.project_id))
    );
  END IF;
  IF p_owner_type = 'procurement_rfq' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.procurement_rfqs r
      WHERE r.id = p_owner_id AND r.organization_id = p_organization_id
        AND (r.project_id IS NULL OR app.can_access_project(p_organization_id, r.project_id))
    );
  END IF;
  IF p_owner_type = 'ap_bill' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.ap_bills b
      WHERE b.id = p_owner_id AND b.organization_id = p_organization_id
        AND (b.project_id IS NULL OR app.can_access_project(p_organization_id, b.project_id))
    );
  END IF;
  IF p_owner_type = 'approval' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.approvals a
      WHERE a.id = p_owner_id AND a.organization_id = p_organization_id
        AND app.can_access_approval_target(a.organization_id, a.target_type, a.target_id)
    );
  END IF;
  IF p_owner_type = 'organization' THEN
    RETURN p_owner_id = p_organization_id AND app.is_org_member(p_organization_id);
  END IF;
  IF p_owner_type = 'client' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = p_owner_id AND c.organization_id = p_organization_id
    );
  END IF;
  IF p_owner_type = 'vendor' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = p_owner_id AND v.organization_id = p_organization_id
    );
  END IF;
  IF p_owner_type = 'employee' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = p_owner_id AND e.organization_id = p_organization_id
    );
  END IF;
  IF p_owner_type = 'compliance_artifact' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.compliance_artifacts a
      WHERE a.id = p_owner_id AND a.organization_id = p_organization_id
    );
  END IF;
  IF p_owner_type = 'asset' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = p_owner_id AND a.organization_id = p_organization_id
        AND (a.assigned_project_id IS NULL OR app.can_access_project(p_organization_id, a.assigned_project_id))
    );
  END IF;
  IF p_owner_type = 'inventory_item' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE i.id = p_owner_id AND i.organization_id = p_organization_id
    );
  END IF;
  IF p_owner_type = 'timesheet' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = p_owner_id AND t.organization_id = p_organization_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.time_entries e
      WHERE e.timesheet_id = p_owner_id
        AND e.organization_id = p_organization_id
        AND e.project_id IS NOT NULL
        AND NOT app.can_access_project(e.organization_id, e.project_id)
    );
  END IF;
  IF p_owner_type = 'form_submission' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.form_submissions s
      WHERE s.id = p_owner_id AND s.organization_id = p_organization_id
        AND app.can_access_form_owner(s.organization_id, s.owner_type, s.owner_id)
    );
  END IF;
  IF app.can_access_next_gen_document_owner(p_organization_id, p_owner_type, p_owner_id) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_document_owner(uuid, text, uuid) TO authenticated, service_role;

-- Subqueries in documents RLS are subject to document_links RLS. A selected-project
-- user who cannot see a restricted link would otherwise treat the document as
-- unlinked (org-wide). Evaluate links as definer so owner scope is real.
CREATE OR REPLACE FUNCTION app.document_visible_to_current_user(
  p_organization_id uuid,
  p_document_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    app.is_org_member(p_organization_id)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.document_links l
        WHERE l.document_id = p_document_id
          AND l.organization_id = p_organization_id
      )
      OR EXISTS (
        SELECT 1 FROM public.document_links l
        WHERE l.document_id = p_document_id
          AND l.organization_id = p_organization_id
          AND app.can_access_document_owner(l.organization_id, l.owner_type::text, l.owner_id)
      )
    );
$fn$;

REVOKE ALL ON FUNCTION app.document_visible_to_current_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.document_visible_to_current_user(uuid, uuid) TO authenticated, service_role;

SELECT app.and_authenticated_policy_predicate(
  'documents',
  'app.document_visible_to_current_user(organization_id, id)'
);
SELECT app.and_authenticated_policy_predicate(
  'document_versions',
  $pred$
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_versions.document_id
        AND d.organization_id = document_versions.organization_id
        AND app.document_visible_to_current_user(d.organization_id, d.id)
    )
  $pred$
);

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls('project_closeouts', 'projects.read', 'projects.update', 'project_id');
SELECT app.install_org_table_rls('project_closeout_events', 'projects.read', 'projects.update', 'project_id');
SELECT app.install_org_table_rls('warranty_coverages', 'projects.read', 'projects.update', 'project_id');
SELECT app.install_org_table_rls('warranty_issues', 'projects.read', 'projects.update', 'project_id');

DROP POLICY IF EXISTS project_closeouts_tenant_insert ON public.project_closeouts;
CREATE POLICY project_closeouts_tenant_insert ON public.project_closeouts
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS project_closeouts_tenant_update ON public.project_closeouts;
CREATE POLICY project_closeouts_tenant_update ON public.project_closeouts
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS project_closeouts_tenant_delete ON public.project_closeouts;
CREATE POLICY project_closeouts_tenant_delete ON public.project_closeouts
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS project_closeout_events_tenant_insert ON public.project_closeout_events;
CREATE POLICY project_closeout_events_tenant_insert ON public.project_closeout_events
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS project_closeout_events_tenant_update ON public.project_closeout_events;
CREATE POLICY project_closeout_events_tenant_update ON public.project_closeout_events
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS project_closeout_events_tenant_delete ON public.project_closeout_events;
CREATE POLICY project_closeout_events_tenant_delete ON public.project_closeout_events
  FOR DELETE TO authenticated
  USING (false);

GRANT SELECT ON public.project_closeouts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_closeouts FROM authenticated;
GRANT SELECT ON public.project_closeout_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_closeout_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_coverages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_issues TO authenticated;
