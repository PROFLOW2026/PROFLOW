-- 0051_review_integrity_closure
-- Additive only. Does NOT modify 0000–0050 files.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Closes independent financial/RLS review findings from waves 1–3:
--   * one live work-order AR invoice (partial unique + lock-friendly trigger)
--   * approved recorded time cannot leave Actual except void+replace
--   * activate_project_boq supersedes only the same contract_id (NULL = NULL)
--   * emit_notification requires the recipient to be an active org member
--   * resolve_notifications is caller-owned only (no service_role impersonation)
--   * activity_events INSERT restored to clients.manage
--   * employee_unavailability RLS matches scheduling permissions
--   * can_access_project is SECURITY DEFINER (fails closed without leaking grants)
--   * projects UPDATE/DELETE and core financial SELECT/write honor can_access_project

--------------------------------------------------------------------------------
-- One live work-order AR source
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS billing_records_one_live_work_order_uq
  ON public.billing_records (organization_id, source_id)
  WHERE source_kind = 'work_order'
    AND status IN ('draft', 'finalized')
    AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.work_order_billing_live_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status text;
  v_kind text;
  v_live integer;
BEGIN
  PERFORM 1
  FROM public.projects p
  WHERE p.id = NEW.work_order_id AND p.organization_id = NEW.organization_id
  FOR UPDATE;

  SELECT p.work_kind INTO v_kind
  FROM public.projects p
  WHERE p.id = NEW.work_order_id AND p.organization_id = NEW.organization_id;
  IF v_kind IS DISTINCT FROM 'work_order' THEN
    RAISE EXCEPTION 'work_order_billing_sources: target must be a work_order project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.status INTO v_status
  FROM public.billing_records b
  WHERE b.id = NEW.billing_record_id AND b.organization_id = NEW.organization_id
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'work_order_billing_sources: billing record missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT count(*)::int INTO v_live
  FROM public.work_order_billing_sources s
  JOIN public.billing_records b
    ON b.id = s.billing_record_id AND b.organization_id = s.organization_id
  WHERE s.organization_id = NEW.organization_id
    AND s.work_order_id = NEW.work_order_id
    AND s.id IS DISTINCT FROM NEW.id
    AND b.status IN ('draft', 'finalized');

  IF v_status IN ('draft', 'finalized') AND v_live > 0 THEN
    RAISE EXCEPTION 'work_order_billing_sources: live billing already exists for this work order'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

--------------------------------------------------------------------------------
-- Approved recorded time is locked (void+replace only)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.time_entries_approval_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approval_status = 'approved' AND OLD.status = 'recorded' THEN
      RAISE EXCEPTION 'time_entries: approved recorded time cannot be deleted; void and replace'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.approval_status = 'approved' AND OLD.status = 'recorded' THEN
    IF NEW.status = 'void' AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
      IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
         OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.work_package_id IS DISTINCT FROM OLD.work_package_id
         OR NEW.phase_id IS DISTINCT FROM OLD.phase_id
         OR NEW.time_code_id IS DISTINCT FROM OLD.time_code_id
         OR NEW.work_date IS DISTINCT FROM OLD.work_date
         OR NEW.hours IS DISTINCT FROM OLD.hours
         OR NEW.kind IS DISTINCT FROM OLD.kind
         OR NEW.rate_version_id IS DISTINCT FROM OLD.rate_version_id
         OR NEW.cost_amount IS DISTINCT FROM OLD.cost_amount
         OR NEW.cost_currency IS DISTINCT FROM OLD.cost_currency
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
         OR NEW.corrects_entry_id IS DISTINCT FROM OLD.corrects_entry_id
         OR NEW.bulk_batch_id IS DISTINCT FROM OLD.bulk_batch_id
         OR NEW.timesheet_id IS DISTINCT FROM OLD.timesheet_id
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
         OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
         OR NEW.decided_by_user_id IS DISTINCT FROM OLD.decided_by_user_id
         OR NEW.manager_note IS DISTINCT FROM OLD.manager_note
         OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'time_entries: voiding approved time cannot rewrite history'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'time_entries: approved time is locked; use a correction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS time_entries_approval_lock ON public.time_entries;
CREATE TRIGGER time_entries_approval_lock
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION app.time_entries_approval_lock();

DROP TRIGGER IF EXISTS time_entries_approval_lock_delete ON public.time_entries;
CREATE TRIGGER time_entries_approval_lock_delete
  BEFORE DELETE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION app.time_entries_approval_lock();

REVOKE ALL ON FUNCTION app.time_entries_approval_lock() FROM PUBLIC;

--------------------------------------------------------------------------------
-- Activate BOQ: supersede only the same contract slice
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.activate_project_boq(
  p_organization_id uuid,
  p_boq_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boq public.project_boqs%ROWTYPE;
  v_items int;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'activate_project_boq: not org member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'boq.manage') THEN
    RAISE EXCEPTION 'activate_project_boq: requires boq.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_boq
  FROM public.project_boqs
  WHERE id = p_boq_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_project_boq: BOQ not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_boq.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'activate_project_boq: only draft can activate' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_items
  FROM public.boq_nodes
  WHERE boq_id = p_boq_id
    AND organization_id = p_organization_id
    AND node_kind = 'item'
    AND archived_at IS NULL;
  IF v_items < 1 THEN
    RAISE EXCEPTION 'activate_project_boq: at least one item required' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.boq_latch_acquire('lifecycle');
  PERFORM set_config('app.boq_lifecycle_write', 'on', true);

  PERFORM 1
  FROM public.project_boqs
  WHERE organization_id = p_organization_id
    AND project_id = v_boq.project_id
    AND status = 'active'
    AND id IS DISTINCT FROM p_boq_id
    AND contract_id IS NOT DISTINCT FROM v_boq.contract_id
  FOR UPDATE;

  UPDATE public.project_boqs
  SET status = 'superseded',
      superseded_by_boq_id = p_boq_id,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND project_id = v_boq.project_id
    AND status = 'active'
    AND id IS DISTINCT FROM p_boq_id
    AND contract_id IS NOT DISTINCT FROM v_boq.contract_id;

  UPDATE public.project_boqs
  SET status = 'active',
      activated_at = now(),
      activated_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid,
      updated_at = now()
  WHERE id = p_boq_id AND organization_id = p_organization_id;

  PERFORM app.boq_latch_release('lifecycle');
  RETURN p_boq_id;
END;
$$;

--------------------------------------------------------------------------------
-- Notifications: recipient must be in the org; resolve is per-caller
--------------------------------------------------------------------------------

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
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_recipient_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'emit_notification: recipient is not an organization member'
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
  v_user uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'resolve_notifications: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_user := app.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'resolve_notifications: caller identity required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.notifications
  SET resolved_at = now(), updated_at = now()
  WHERE organization_id = p_organization_id
    AND type = p_type
    AND entity_id = p_entity_id
    AND resolved_at IS NULL
    AND recipient_user_id = v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION app.resolve_notifications(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_notifications(uuid, text, uuid) TO authenticated;

--------------------------------------------------------------------------------
-- Activity timeline INSERT: membership is not enough
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS activity_events_tenant_insert ON public.activity_events;
CREATE POLICY activity_events_tenant_insert ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'clients.manage')
  );

--------------------------------------------------------------------------------
-- Unavailability is a scheduling surface
--------------------------------------------------------------------------------

SELECT app.install_permissioned_rls('employee_unavailability', 'scheduling.read', 'scheduling.manage');

--------------------------------------------------------------------------------
-- Project access helper must see grants even without projects.read
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.project_access_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        ELSE COALESCE(value->>'mode', 'all')
      END
      FROM public.organization_settings
      WHERE organization_id = p_organization_id AND key = 'project_access_mode'
      LIMIT 1
    ),
    'all'
  );
$fn$;

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

REVOKE ALL ON FUNCTION app.project_access_mode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_access_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_access_mode(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_access_project(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS projects_tenant_update ON public.projects;
CREATE POLICY projects_tenant_update ON public.projects
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.can_access_project(organization_id, id))
  WITH CHECK (app.is_org_member(organization_id) AND app.can_access_project(organization_id, id));

DROP POLICY IF EXISTS projects_tenant_delete ON public.projects;
CREATE POLICY projects_tenant_delete ON public.projects
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.can_access_project(organization_id, id));

--------------------------------------------------------------------------------
-- Project-scoped RLS: membership (optional permission) AND can_access_project
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.table_exists(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT to_regclass('public.' || p_table) IS NOT NULL;
$fn$;

-- Fail closed: generic RLS helpers must never skip a missing table/column.
CREATE OR REPLACE FUNCTION app.require_relation_column(p_table text, p_column text)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_rel regclass;
BEGIN
  IF p_table IS NULL OR btrim(p_table) = '' OR p_column IS NULL OR btrim(p_column) = '' THEN
    RAISE EXCEPTION 'generic project RLS helper: table and column names are required';
  END IF;

  v_rel := to_regclass(format('%I.%I', 'public', p_table));
  IF v_rel IS NULL THEN
    RAISE EXCEPTION '%', format('generic project RLS helper: table public.%s does not exist', p_table);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = v_rel
      AND a.attname = p_column
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION '%', format(
      'generic project RLS helper: column public.%s.%s does not exist',
      p_table,
      p_column
    );
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.can_access_approval_target(
  p_organization_id uuid,
  p_target_type text,
  p_target_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_organization_id IS NULL OR p_target_type IS NULL OR p_target_id IS NULL THEN
    RETURN false;
  END IF;
  IF p_target_type = 'change_request' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.change_requests cr
      WHERE cr.id = p_target_id
        AND cr.organization_id = p_organization_id
        AND app.can_access_project(cr.organization_id, cr.project_id)
    );
  END IF;
  IF p_target_type = 'quote_version' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.quote_versions qv
      JOIN public.quotes q
        ON q.id = qv.quote_id
       AND q.organization_id = qv.organization_id
      WHERE qv.id = p_target_id
        AND qv.organization_id = p_organization_id
        AND q.organization_id = p_organization_id
        AND app.can_access_project(q.organization_id, q.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

-- AND a predicate onto every existing authenticated policy. Never drop/replace
-- authorization policies and never create a weaker parallel permissive policy.
CREATE OR REPLACE FUNCTION app.and_authenticated_policy_predicate(
  p_table text,
  p_predicate text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
  v_using text;
  v_check text;
  v_roles text;
BEGIN
  IF p_table IS NULL OR btrim(p_table) = '' OR p_predicate IS NULL OR btrim(p_predicate) = '' THEN
    RAISE EXCEPTION 'generic project RLS helper: table and predicate are required';
  END IF;
  IF to_regclass(format('%I.%I', 'public', p_table)) IS NULL THEN
    RAISE EXCEPTION '%', format('generic project RLS helper: table public.%s does not exist', p_table);
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  FOR r IN
    SELECT
      p.polname,
      pg_get_expr(p.polqual, p.polrelid) AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr,
      p.polroles
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table
    ORDER BY p.polname
  LOOP
    SELECT COALESCE(string_agg(rol.rolname, ',' ORDER BY rol.rolname), '')
      INTO v_roles
    FROM pg_roles rol
    WHERE rol.oid = ANY (r.polroles);

    IF r.polroles <> '{}' AND v_roles = 'service_role' THEN
      CONTINUE;
    END IF;

    v_using := r.using_expr;
    v_check := r.check_expr;
    IF v_using IS NOT NULL AND position(p_predicate in v_using) = 0 THEN
      v_using := '(' || v_using || ') AND (' || p_predicate || ')';
    END IF;
    IF v_check IS NOT NULL AND position(p_predicate in v_check) = 0 THEN
      v_check := '(' || v_check || ') AND (' || p_predicate || ')';
    END IF;

    IF v_using IS NOT DISTINCT FROM r.using_expr AND v_check IS NOT DISTINCT FROM r.check_expr THEN
      CONTINUE;
    END IF;

    IF v_using IS NOT NULL AND v_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
        r.polname, p_table, v_using, v_check
      );
    ELSIF v_using IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.polname, p_table, v_using);
    ELSIF v_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.polname, p_table, v_check);
    END IF;
  END LOOP;
END;
$fn$;

-- p_select_perm / p_write_perm are call-site compatibility only and MUST NOT
-- flatten existing operation-specific authorization. This helper only ANDs
-- project access onto the policies that already exist.
CREATE OR REPLACE FUNCTION app.apply_project_column_rls(
  p_table text,
  p_project_col text,
  p_select_perm text,
  p_write_perm text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM app.require_relation_column(p_table, 'organization_id');
  PERFORM app.require_relation_column(p_table, p_project_col);
  PERFORM app.and_authenticated_policy_predicate(
    p_table,
    format(
      '(%I IS NULL OR app.can_access_project(organization_id, %I))',
      p_project_col,
      p_project_col
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION app.apply_project_parent_rls(
  p_table text,
  p_parent text,
  p_fk text,
  p_parent_project_col text,
  p_select_perm text,
  p_write_perm text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM app.require_relation_column(p_table, 'organization_id');
  PERFORM app.require_relation_column(p_table, p_fk);
  PERFORM app.require_relation_column(p_parent, 'id');
  PERFORM app.require_relation_column(p_parent, 'organization_id');
  PERFORM app.require_relation_column(p_parent, p_parent_project_col);
  PERFORM app.and_authenticated_policy_predicate(
    p_table,
    format(
      $ex$EXISTS (
        SELECT 1 FROM public.%I p
        WHERE p.id = %I
          AND p.organization_id = %I.organization_id
          AND (p.%I IS NULL OR app.can_access_project(p.organization_id, p.%I))
      )$ex$,
      p_parent, p_fk, p_table, p_parent_project_col, p_parent_project_col
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION app.tighten_project_scoped_rls(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM app.apply_project_column_rls(p_table, 'project_id', NULL, NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION app.table_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.require_relation_column(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_access_approval_target(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.and_authenticated_policy_predicate(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.apply_project_column_rls(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.apply_project_parent_rls(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.tighten_project_scoped_rls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_approval_target(uuid, text, uuid) TO authenticated, service_role;

-- AND project access onto existing authenticated policies (never flatten perms)
SELECT app.apply_project_column_rls('contracts', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('billing_records', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('expenses', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('time_entries', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('change_requests', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('contract_value_events', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('expense_allocations', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('allocation_run_lines', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('project_boqs', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('boq_change_allocations', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('boq_progress_batches', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('boq_subcontractor_schedules', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('quotes', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('change_orders', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('daily_logs', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('punch_list_items', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('inspections', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('inventory_movements', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('inventory_locations', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('employee_project_assignments', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('labor_allocation_run_lines', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('work_packages', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('project_milestones', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('phases', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('project_domains', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('vendor_engagements', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('purchase_orders', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('procurement_rfqs', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('supplier_quotes', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('committed_costs', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('ap_bills', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('ap_bill_project_allocations', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('ap_vendor_credits', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('planning_work_items', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('planning_dependencies', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('month_close_adjustments', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('material_usage_records', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('equipment_usage_records', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('project_service_details', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('project_budgets', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('role_assignments', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('activity_events', 'project_id', 'clients.read', 'clients.manage');
SELECT app.apply_project_column_rls('resource_bookings', 'project_id', 'scheduling.read', 'scheduling.manage');
SELECT app.apply_project_column_rls('safety_records', 'project_id', 'safety.read', 'safety.manage');
SELECT app.apply_project_column_rls('inventory_reservations', 'project_id', 'assets.read', 'assets.manage');
SELECT app.apply_project_column_rls('subcontract_agreements', 'project_id', 'vendors.read', 'vendors.manage');
SELECT app.apply_project_column_rls('project_access_grants', 'project_id', 'projects.read', 'members.manage');
SELECT app.apply_project_column_rls('external_access_grants', 'project_id', NULL, NULL);
SELECT app.apply_project_column_rls('work_order_billing_sources', 'work_order_id', 'billing.read', 'billing.manage');

-- approvals is polymorphic (target_type + target_id); never assume project_id.
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_tenant_select ON public.approvals;
DROP POLICY IF EXISTS approvals_tenant_insert ON public.approvals;
DROP POLICY IF EXISTS approvals_tenant_update ON public.approvals;
DROP POLICY IF EXISTS approvals_tenant_delete ON public.approvals;
DROP POLICY IF EXISTS approvals_tenant_write ON public.approvals;
CREATE POLICY approvals_tenant_select ON public.approvals
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_approval_target(organization_id, target_type, target_id)
  );
CREATE POLICY approvals_tenant_insert ON public.approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_approval_target(organization_id, target_type, target_id)
  );
CREATE POLICY approvals_tenant_update ON public.approvals
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_approval_target(organization_id, target_type, target_id)
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_approval_target(organization_id, target_type, target_id)
  );
CREATE POLICY approvals_tenant_delete ON public.approvals
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_approval_target(organization_id, target_type, target_id)
  );

-- Child tables reached through a project-scoped parent
SELECT app.apply_project_parent_rls('billing_lines', 'billing_records', 'billing_record_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('payment_applications', 'billing_records', 'billing_record_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('change_request_lines', 'change_requests', 'change_request_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('quote_versions', 'quotes', 'quote_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('boq_nodes', 'project_boqs', 'boq_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('boq_progress_lines', 'boq_progress_batches', 'batch_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('boq_progress_billing_links', 'boq_progress_batches', 'progress_batch_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('boq_subcontractor_schedule_lines', 'boq_subcontractor_schedules', 'schedule_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('boq_subcontractor_valuations', 'boq_subcontractor_schedules', 'schedule_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('subcontract_value_events', 'subcontract_agreements', 'subcontract_id', 'project_id', 'vendors.read', 'vendors.manage');
SELECT app.apply_project_parent_rls('safety_corrective_actions', 'safety_records', 'safety_record_id', 'project_id', 'safety.read', 'safety.manage');
SELECT app.apply_project_parent_rls('safety_toolbox_talks', 'safety_records', 'safety_record_id', 'project_id', 'safety.read', 'safety.manage');
SELECT app.apply_project_parent_rls('inventory_counts', 'inventory_locations', 'location_id', 'project_id', 'assets.read', 'assets.manage');
SELECT app.apply_project_parent_rls('project_budget_lines', 'project_budgets', 'budget_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('project_budget_revisions', 'project_budgets', 'budget_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('procurement_rfq_lines', 'procurement_rfqs', 'rfq_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('supplier_quote_lines', 'supplier_quotes', 'supplier_quote_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('purchase_order_lines', 'purchase_orders', 'purchase_order_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('po_receipts', 'purchase_orders', 'purchase_order_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('ap_bill_lines', 'ap_bills', 'ap_bill_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('ap_po_matches', 'ap_bills', 'ap_bill_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('inventory_location_balances', 'inventory_locations', 'location_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('ap_payment_applications', 'ap_bills', 'ap_bill_id', 'project_id', NULL, NULL);
SELECT app.apply_project_parent_rls('ops_expense_links', 'expenses', 'expense_id', 'project_id', NULL, NULL);

SELECT app.and_authenticated_policy_predicate(
  'payments',
  $pred$
    billing_record_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.billing_records b
      WHERE b.id = payments.billing_record_id
        AND b.organization_id = payments.organization_id
        AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'safety_toolbox_attendees',
  $pred$
    EXISTS (
      SELECT 1
      FROM public.safety_toolbox_talks t
      JOIN public.safety_records r
        ON r.id = t.safety_record_id AND r.organization_id = t.organization_id
      WHERE t.id = safety_toolbox_attendees.toolbox_talk_id
        AND t.organization_id = safety_toolbox_attendees.organization_id
        AND (r.project_id IS NULL OR app.can_access_project(r.organization_id, r.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'inventory_count_lines',
  $pred$
    EXISTS (
      SELECT 1
      FROM public.inventory_counts c
      JOIN public.inventory_locations loc
        ON loc.id = c.location_id AND loc.organization_id = c.organization_id
      WHERE c.id = inventory_count_lines.count_id
        AND c.organization_id = inventory_count_lines.organization_id
        AND (loc.project_id IS NULL OR app.can_access_project(loc.organization_id, loc.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'po_receipt_lines',
  $pred$
    EXISTS (
      SELECT 1
      FROM public.po_receipts r
      JOIN public.purchase_orders po
        ON po.id = r.purchase_order_id AND po.organization_id = r.organization_id
      WHERE r.id = po_receipt_lines.receipt_id
        AND r.organization_id = po_receipt_lines.organization_id
        AND (po.project_id IS NULL OR app.can_access_project(po.organization_id, po.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'ap_credit_applications',
  $pred$
    EXISTS (
      SELECT 1 FROM public.ap_vendor_credits c
      WHERE c.id = ap_credit_applications.credit_id
        AND c.organization_id = ap_credit_applications.organization_id
        AND (c.project_id IS NULL OR app.can_access_project(c.organization_id, c.project_id))
    )
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
      WHERE b.id = ap_credit_applications.ap_bill_id
        AND b.organization_id = ap_credit_applications.organization_id
        AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  $pred$
);

--------------------------------------------------------------------------------
-- Linked documents / folders: owner entity is the project gate
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.can_access_form_owner(
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
  IF p_organization_id IS NULL OR p_owner_type IS NULL OR p_owner_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT app.form_owner_same_org(p_organization_id, p_owner_type, p_owner_id) THEN
    RETURN false;
  END IF;
  IF p_owner_type IN ('project', 'job', 'work_order') THEN
    RETURN app.can_access_project(p_organization_id, p_owner_id);
  END IF;
  IF p_owner_type = 'planning_task' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.planning_work_items i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'maintenance' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.maintenance_records m
      JOIN public.assets a
        ON a.id = m.asset_id AND a.organization_id = m.organization_id
      WHERE m.id = p_owner_id
        AND m.organization_id = p_organization_id
        AND (
          a.assigned_project_id IS NULL
          OR app.can_access_project(p_organization_id, a.assigned_project_id)
        )
    );
  END IF;
  IF p_owner_type = 'field_log' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_owner_id
        AND d.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, d.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_form_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_form_owner(uuid, text, uuid) TO authenticated, service_role;

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
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_document_owner(uuid, text, uuid) TO authenticated, service_role;

-- Preserve existing document/link/folder authorization; AND owner/project gating.
SELECT app.and_authenticated_policy_predicate(
  'document_links',
  'app.can_access_document_owner(organization_id, owner_type::text, owner_id)'
);
SELECT app.and_authenticated_policy_predicate(
  'documents',
  $pred$
    NOT EXISTS (SELECT 1 FROM public.document_links l WHERE l.document_id = documents.id)
    OR EXISTS (
      SELECT 1 FROM public.document_links l
      WHERE l.document_id = documents.id
        AND app.can_access_document_owner(l.organization_id, l.owner_type::text, l.owner_id)
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'document_folders',
  $pred$
    owner_type IS NULL AND owner_id IS NULL
    OR app.can_access_document_owner(organization_id, owner_type, owner_id)
  $pred$
);


SELECT app.and_authenticated_policy_predicate(
  'document_versions',
  $pred$
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_versions.document_id
        AND d.organization_id = document_versions.organization_id
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.document_links l
            WHERE l.document_id = d.id AND l.organization_id = d.organization_id
          )
          OR EXISTS (
            SELECT 1 FROM public.document_links l
            WHERE l.document_id = d.id
              AND l.organization_id = d.organization_id
              AND app.can_access_document_owner(l.organization_id, l.owner_type::text, l.owner_id)
          )
        )
    )
  $pred$
);

SELECT app.and_authenticated_policy_predicate(
  'form_submissions',
  'app.can_access_form_owner(organization_id, owner_type, owner_id)'
);
SELECT app.and_authenticated_policy_predicate(
  'quote_version_lines',
  $pred$
    EXISTS (
      SELECT 1
      FROM public.quote_versions qv
      JOIN public.quotes q ON q.id = qv.quote_id AND q.organization_id = qv.organization_id
      WHERE qv.id = quote_version_lines.quote_version_id
        AND qv.organization_id = quote_version_lines.organization_id
        AND (q.project_id IS NULL OR app.can_access_project(q.organization_id, q.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'boq_subcontractor_valuation_lines',
  $pred$
    EXISTS (
      SELECT 1
      FROM public.boq_subcontractor_valuations v
      JOIN public.boq_subcontractor_schedules s
        ON s.id = v.schedule_id AND s.organization_id = v.organization_id
      WHERE v.id = boq_subcontractor_valuation_lines.valuation_id
        AND v.organization_id = boq_subcontractor_valuation_lines.organization_id
        AND (s.project_id IS NULL OR app.can_access_project(s.organization_id, s.project_id))
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'retention_releases',
  $pred$
    (
      source_type = 'billing_record'
      AND EXISTS (
        SELECT 1 FROM public.billing_records b
        WHERE b.id = retention_releases.source_id
          AND b.organization_id = retention_releases.organization_id
          AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
      )
    )
    OR (
      source_type = 'vendor_bill'
      AND EXISTS (
        SELECT 1 FROM public.ap_bills b
        WHERE b.id = retention_releases.source_id
          AND b.organization_id = retention_releases.organization_id
          AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
      )
    )
  $pred$
);
SELECT app.and_authenticated_policy_predicate(
  'ocr_extraction_jobs',
  $pred$
    (
      document_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = ocr_extraction_jobs.document_id
          AND d.organization_id = ocr_extraction_jobs.organization_id
          AND (
            NOT EXISTS (
              SELECT 1 FROM public.document_links l
              WHERE l.document_id = d.id AND l.organization_id = d.organization_id
            )
            OR EXISTS (
              SELECT 1 FROM public.document_links l
              WHERE l.document_id = d.id
                AND l.organization_id = d.organization_id
                AND app.can_access_document_owner(l.organization_id, l.owner_type::text, l.owner_id)
            )
          )
      )
    )
    AND (
      confirmed_expense_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = ocr_extraction_jobs.confirmed_expense_id
          AND e.organization_id = ocr_extraction_jobs.organization_id
          AND (e.project_id IS NULL OR app.can_access_project(e.organization_id, e.project_id))
      )
    )
    AND (
      confirmed_vendor_bill_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ap_bills b
        WHERE b.id = ocr_extraction_jobs.confirmed_vendor_bill_id
          AND b.organization_id = ocr_extraction_jobs.organization_id
          AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
      )
    )
    AND (
      confirmed_vendor_credit_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ap_vendor_credits c
        WHERE c.id = ocr_extraction_jobs.confirmed_vendor_credit_id
          AND c.organization_id = ocr_extraction_jobs.organization_id
          AND (c.project_id IS NULL OR app.can_access_project(c.organization_id, c.project_id))
      )
    )
  $pred$
);
