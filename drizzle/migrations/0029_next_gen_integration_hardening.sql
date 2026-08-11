-- 0029_next_gen_integration_hardening
-- Additive only. Owner SQL-review hardening of the unapplied 0024–0029 chain.
-- Does NOT edit 0000–0023. UNAPPLIED — DO NOT run against owner Supabase.

--------------------------------------------------------------------------------
-- 1) Remaining optional composite FKs (SET NULL only the optional column)
--------------------------------------------------------------------------------

ALTER TABLE public.project_service_details
  ADD COLUMN IF NOT EXISTS assignee_employee_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_service_details_assignee_employee_org_fk'
  ) THEN
    ALTER TABLE public.project_service_details
      DROP CONSTRAINT project_service_details_assignee_employee_org_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_service_details_assignee_employee_org_fk'
  ) THEN
    ALTER TABLE public.project_service_details
      ADD CONSTRAINT project_service_details_assignee_employee_org_fk
      FOREIGN KEY (assignee_employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (assignee_employee_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS project_service_details_org_assignee_schedule_idx
  ON public.project_service_details (organization_id, assignee_employee_id, scheduled_start_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_service_details_checklist_org_fk'
  ) THEN
    ALTER TABLE public.project_service_details
      ADD CONSTRAINT project_service_details_checklist_org_fk
      FOREIGN KEY (checklist_template_id, organization_id)
      REFERENCES public.form_templates (id, organization_id)
      ON DELETE SET NULL (checklist_template_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_definitions_checklist_org_fk'
  ) THEN
    ALTER TABLE public.recurrence_definitions
      ADD CONSTRAINT recurrence_definitions_checklist_org_fk
      FOREIGN KEY (default_checklist_template_id, organization_id)
      REFERENCES public.form_templates (id, organization_id)
      ON DELETE SET NULL (default_checklist_template_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_employee_org_fk'
  ) THEN
    ALTER TABLE public.form_submissions
      ADD CONSTRAINT form_submissions_employee_org_fk
      FOREIGN KEY (submitted_by_employee_id, organization_id)
      REFERENCES public.employees (id, organization_id)
      ON DELETE SET NULL (submitted_by_employee_id);
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 2) Approval gate helpers — entity-type-specific permissions, minimum columns
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.can_access_approval_gate(
  p_organization_id uuid,
  p_entity_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app.is_org_member(p_organization_id)
    AND (
      app.has_org_permission(p_organization_id, 'approvals.read')
      OR app.has_org_permission(p_organization_id, 'approvals.manage')
      OR app.has_org_permission(p_organization_id, 'approvals.decide')
      OR (
        p_entity_type = 'expense'
        AND app.has_org_permission(p_organization_id, 'expenses.finalize')
      )
      OR (
        p_entity_type IN ('vendor_bill', 'vendor_credit')
        AND app.has_org_permission(p_organization_id, 'ap.manage')
      )
      OR (
        p_entity_type = 'purchase_order'
        AND app.has_org_permission(p_organization_id, 'procurement.manage')
      )
      OR (
        p_entity_type = 'quote_discount'
        AND app.has_org_permission(p_organization_id, 'quotes.manage')
      )
      OR (
        p_entity_type = 'budget_revision'
        AND app.has_org_permission(p_organization_id, 'budgets.manage')
      )
      OR (
        p_entity_type = 'time_correction'
        AND app.has_org_permission(p_organization_id, 'attendance.manage')
      )
    );
$$;

REVOKE ALL ON FUNCTION app.can_access_approval_gate(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION app.can_access_approval_gate(uuid, text) TO authenticated, service_role;

-- RLS-safe rule lookup for INSERT/triggers. Does not expose approval_rules rows.
CREATE OR REPLACE FUNCTION app.approval_rule_matches_request(
  p_organization_id uuid,
  p_rule_id uuid,
  p_entity_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_rules r
    WHERE r.id = p_rule_id
      AND r.organization_id = p_organization_id
      AND r.entity_type = p_entity_type
      AND app.is_org_member(p_organization_id)
  );
$$;

REVOKE ALL ON FUNCTION app.approval_rule_matches_request(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION app.approval_rule_matches_request(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.enabled_approval_rules_for_gate(
  p_organization_id uuid,
  p_entity_type text
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  entity_type text,
  threshold_amount numeric,
  currency char(3),
  enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.entity_type, r.threshold_amount, r.currency, r.enabled
  FROM public.approval_rules r
  WHERE r.organization_id = p_organization_id
    AND r.entity_type = p_entity_type
    AND r.enabled = true
    AND app.can_access_approval_gate(p_organization_id, p_entity_type);
$$;

REVOKE ALL ON FUNCTION app.enabled_approval_rules_for_gate(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION app.enabled_approval_rules_for_gate(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.latest_approval_request_for_gate(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  entity_type text,
  entity_id uuid,
  status text,
  amount numeric,
  currency char(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.entity_type, r.entity_id, r.status, r.amount, r.currency
  FROM public.approval_requests r
  WHERE r.organization_id = p_organization_id
    AND r.entity_type = p_entity_type
    AND r.entity_id = p_entity_id
    AND (
      app.can_access_approval_gate(p_organization_id, p_entity_type)
      OR r.submitted_by_user_id = app.current_user_id()
    )
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.latest_approval_request_for_gate(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.latest_approval_request_for_gate(uuid, text, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 3) Approval request identity / history
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.approval_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'approval_requests: inserts must be status=submitted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.submitted_by_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'approval_requests: submitter must be the current user'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.decided_by_user_id IS NOT NULL
       OR NEW.decided_at IS NOT NULL
       OR NEW.decision_note IS NOT NULL THEN
      RAISE EXCEPTION 'approval_requests: decision fields must be empty on insert'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.rule_id IS NOT NULL
       AND NOT app.approval_rule_matches_request(
         NEW.organization_id,
         NEW.rule_id,
         NEW.entity_type
       ) THEN
      RAISE EXCEPTION 'approval_requests: rule must belong to the same organization and entity type'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'approval_requests: decided/cancelled rows are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.rule_id IS DISTINCT FROM OLD.rule_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'approval_requests: identity and payload are immutable after submit'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('approved', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'approval_requests: submitted rows may only become approved, rejected, or cancelled'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IN ('approved', 'rejected') THEN
      IF NEW.decided_by_user_id IS DISTINCT FROM app.current_user_id()
         OR NEW.decided_at IS NULL THEN
        RAISE EXCEPTION 'approval_requests: decision must be stamped by the current user'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'approval_requests: hard delete is not allowed'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS approval_requests_guard ON public.approval_requests;
CREATE TRIGGER approval_requests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION app.approval_requests_guard();

DROP POLICY IF EXISTS approval_rules_tenant_select ON public.approval_rules;
CREATE POLICY approval_rules_tenant_select ON public.approval_rules
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'approvals.read')
      OR app.has_org_permission(organization_id, 'approvals.manage')
    )
  );

DROP POLICY IF EXISTS approval_requests_tenant_select ON public.approval_requests;
CREATE POLICY approval_requests_tenant_select ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'approvals.read')
      OR app.has_org_permission(organization_id, 'approvals.decide')
      OR app.has_org_permission(organization_id, 'approvals.manage')
      OR submitted_by_user_id = app.current_user_id()
    )
  );

DROP POLICY IF EXISTS approval_requests_tenant_insert ON public.approval_requests;
CREATE POLICY approval_requests_tenant_insert ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    app.can_access_approval_gate(organization_id, entity_type)
    AND status = 'submitted'
    AND submitted_by_user_id = app.current_user_id()
    AND decided_by_user_id IS NULL
    AND decided_at IS NULL
    AND decision_note IS NULL
    AND (
      rule_id IS NULL
      OR app.approval_rule_matches_request(organization_id, rule_id, entity_type)
    )
  );

DROP POLICY IF EXISTS approval_requests_tenant_update ON public.approval_requests;
CREATE POLICY approval_requests_tenant_update ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status = 'submitted'
    AND (
      app.has_org_permission(organization_id, 'approvals.decide')
      OR app.has_org_permission(organization_id, 'approvals.manage')
      OR submitted_by_user_id = app.current_user_id()
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (
        status IN ('approved', 'rejected')
        AND app.has_org_permission(organization_id, 'approvals.decide')
        AND decided_by_user_id = app.current_user_id()
      )
      OR (
        status = 'cancelled'
        AND (
          app.has_org_permission(organization_id, 'approvals.manage')
          OR submitted_by_user_id = app.current_user_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS approval_requests_tenant_delete ON public.approval_requests;
-- No authenticated DELETE: history is preserved. Trigger also blocks DELETE.

--------------------------------------------------------------------------------
-- 4) Month close — closed periods immutable; no completeness leak
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.is_month_closed(
  p_organization_id uuid,
  p_year_month text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.month_close_periods p
    WHERE p.organization_id = p_organization_id
      AND p.year_month = p_year_month
      AND p.status = 'closed'
      AND app.is_org_member(p_organization_id)
  );
$$;

REVOKE ALL ON FUNCTION app.is_month_closed(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION app.is_month_closed(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.month_close_periods_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'month_close_periods: closed periods cannot be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'month_close_periods: new periods must start open'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.closed_at IS NOT NULL OR NEW.closed_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'month_close_periods: close identity must be empty on insert'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'month_close_periods: closed periods are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.year_month IS DISTINCT FROM OLD.year_month
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'month_close_periods: identity is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'closed' THEN
      IF OLD.status IS DISTINCT FROM 'ready' THEN
        RAISE EXCEPTION 'month_close_periods: only ready periods can close'
          USING ERRCODE = 'restrict_violation';
      END IF;
      NEW.closed_at := clock_timestamp();
      NEW.closed_by_user_id := app.current_user_id();
      IF NEW.closed_by_user_id IS NULL THEN
        RAISE EXCEPTION 'month_close_periods: close must be stamped by the current user'
          USING ERRCODE = 'restrict_violation';
      END IF;
    ELSE
      IF NEW.closed_at IS NOT NULL OR NEW.closed_by_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'month_close_periods: close identity is only stamped on close'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS month_close_periods_guard ON public.month_close_periods;
CREATE TRIGGER month_close_periods_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.month_close_periods
  FOR EACH ROW
  EXECUTE FUNCTION app.month_close_periods_guard();

CREATE OR REPLACE FUNCTION app.month_close_adjustments_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.month_close_periods p
      WHERE p.id = NEW.period_id
        AND p.organization_id = NEW.organization_id
        AND p.status = 'closed'
    ) THEN
      RAISE EXCEPTION 'month_close_adjustments: period must be closed'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.created_by_user_id := app.current_user_id();
    IF NEW.created_by_user_id IS NULL THEN
      RAISE EXCEPTION 'month_close_adjustments: creator must be the current user'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'month_close_adjustments: audit rows are immutable'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS month_close_adjustments_guard ON public.month_close_adjustments;
CREATE TRIGGER month_close_adjustments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.month_close_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION app.month_close_adjustments_guard();

DROP POLICY IF EXISTS month_close_periods_tenant_select ON public.month_close_periods;
CREATE POLICY month_close_periods_tenant_select ON public.month_close_periods
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'month_close.read')
      OR app.has_org_permission(organization_id, 'month_close.manage')
    )
  );

DROP POLICY IF EXISTS month_close_periods_tenant_update ON public.month_close_periods;
CREATE POLICY month_close_periods_tenant_update ON public.month_close_periods
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'month_close.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'month_close.manage')
  );

DROP POLICY IF EXISTS month_close_periods_tenant_delete ON public.month_close_periods;
CREATE POLICY month_close_periods_tenant_delete ON public.month_close_periods
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'month_close.manage')
  );

DROP POLICY IF EXISTS month_close_adjustments_tenant_update ON public.month_close_adjustments;
CREATE POLICY month_close_adjustments_tenant_update ON public.month_close_adjustments
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

DROP POLICY IF EXISTS month_close_adjustments_tenant_delete ON public.month_close_adjustments;
CREATE POLICY month_close_adjustments_tenant_delete ON public.month_close_adjustments
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'month_close.manage'));

--------------------------------------------------------------------------------
-- 5) Field forms — own/draft lifecycle; submitted history frozen; no cascade
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.form_owner_same_org(p_org uuid, p_owner_type text, p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_owner_type IN ('project', 'job', 'work_order') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = p_owner_id
        AND pr.organization_id = p_org
        AND (
          (p_owner_type = 'project' AND pr.work_kind = 'project')
          OR (p_owner_type = 'job' AND pr.work_kind = 'job')
          OR (p_owner_type = 'work_order' AND pr.work_kind = 'work_order')
        )
    );
  END IF;
  IF p_owner_type = 'planning_task' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.planning_work_items i
      WHERE i.id = p_owner_id AND i.organization_id = p_org
    );
  END IF;
  IF p_owner_type = 'maintenance' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.maintenance_records m
      WHERE m.id = p_owner_id AND m.organization_id = p_org
    );
  END IF;
  IF p_owner_type = 'field_log' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_owner_id AND d.organization_id = p_org
    );
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app.form_owner_same_org(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.form_owner_same_org(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.form_submissions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'form_submissions: inserts must be draft'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.submitted_by_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'form_submissions: submitter must be the current user'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'form_submissions: submitted_at must be empty on insert'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NOT app.form_owner_same_org(NEW.organization_id, NEW.owner_type, NEW.owner_id) THEN
      RAISE EXCEPTION 'form_submissions: owner must belong to the same organization'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' THEN
      RAISE EXCEPTION 'form_submissions: voided rows are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.owner_type IS DISTINCT FROM OLD.owner_type
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'form_submissions: identity is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'submitted' THEN
      IF NEW.status IS DISTINCT FROM 'void' THEN
        RAISE EXCEPTION 'form_submissions: submitted rows may only be voided'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.answers_json IS DISTINCT FROM OLD.answers_json
         OR NEW.acknowledgement_name IS DISTINCT FROM OLD.acknowledgement_name
         OR NEW.acknowledgement_at IS DISTINCT FROM OLD.acknowledgement_at
         OR NEW.acknowledgement_note IS DISTINCT FROM OLD.acknowledgement_note
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        RAISE EXCEPTION 'form_submissions: submitted acknowledgement/history cannot be rewritten'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status = 'draft'
       AND NOT app.has_org_permission(OLD.organization_id, 'forms.manage')
       AND OLD.submitted_by_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'form_submissions: submitters may only edit their own drafts'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('draft', 'submitted', 'void') THEN
      RAISE EXCEPTION 'form_submissions: invalid status'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'form_submissions: only draft rows can be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_submissions_guard ON public.form_submissions;
CREATE TRIGGER form_submissions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION app.form_submissions_guard();

DROP POLICY IF EXISTS form_submissions_tenant_insert ON public.form_submissions;
CREATE POLICY form_submissions_tenant_insert ON public.form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status = 'draft'
    AND submitted_by_user_id = app.current_user_id()
    AND submitted_at IS NULL
    AND (
      app.has_org_permission(organization_id, 'forms.submit')
      OR app.has_org_permission(organization_id, 'forms.manage')
    )
  );

DROP POLICY IF EXISTS form_submissions_tenant_update ON public.form_submissions;
CREATE POLICY form_submissions_tenant_update ON public.form_submissions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'forms.manage')
      OR (
        app.has_org_permission(organization_id, 'forms.submit')
        AND submitted_by_user_id = app.current_user_id()
      )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'forms.manage')
      OR (
        app.has_org_permission(organization_id, 'forms.submit')
        AND submitted_by_user_id = app.current_user_id()
        AND status IN ('draft', 'submitted')
      )
    )
  );

DROP POLICY IF EXISTS form_submissions_tenant_delete ON public.form_submissions;
CREATE POLICY form_submissions_tenant_delete ON public.form_submissions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'forms.manage')
    AND status = 'draft'
  );

--------------------------------------------------------------------------------
-- 6) Budget history — parent + revisions/lines; no cascade-erase
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budget_lines_budget_org_fk') THEN
    ALTER TABLE public.project_budget_lines DROP CONSTRAINT project_budget_lines_budget_org_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budget_revisions_budget_org_fk') THEN
    ALTER TABLE public.project_budget_revisions DROP CONSTRAINT project_budget_revisions_budget_org_fk;
  END IF;
END $$;

ALTER TABLE public.project_budget_lines
  ADD CONSTRAINT project_budget_lines_budget_org_fk
  FOREIGN KEY (budget_id, organization_id)
  REFERENCES public.project_budgets (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.project_budget_revisions
  ADD CONSTRAINT project_budget_revisions_budget_org_fk
  FOREIGN KEY (budget_id, organization_id)
  REFERENCES public.project_budgets (id, organization_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.project_budgets_guard()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS project_budgets_guard ON public.project_budgets;
CREATE TRIGGER project_budgets_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_budgets
  FOR EACH ROW
  EXECUTE FUNCTION app.project_budgets_guard();

CREATE OR REPLACE FUNCTION app.project_budget_history_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_RELNAME = 'project_budget_revisions' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'project_budget_revisions: historical revisions are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_RELNAME = 'project_budget_lines' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'project_budget_lines: revision lines cannot be rewritten; create a new revision'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS project_budget_revisions_guard ON public.project_budget_revisions;
CREATE TRIGGER project_budget_revisions_guard
  BEFORE UPDATE OR DELETE ON public.project_budget_revisions
  FOR EACH ROW
  EXECUTE FUNCTION app.project_budget_history_guard();

DROP TRIGGER IF EXISTS project_budget_lines_guard ON public.project_budget_lines;
CREATE TRIGGER project_budget_lines_guard
  BEFORE UPDATE OR DELETE ON public.project_budget_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.project_budget_history_guard();

DROP POLICY IF EXISTS project_budget_revisions_tenant_update ON public.project_budget_revisions;
CREATE POLICY project_budget_revisions_tenant_update ON public.project_budget_revisions
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

DROP POLICY IF EXISTS project_budget_revisions_tenant_delete ON public.project_budget_revisions;
CREATE POLICY project_budget_revisions_tenant_delete ON public.project_budget_revisions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

DROP POLICY IF EXISTS project_budget_lines_tenant_update ON public.project_budget_lines;
CREATE POLICY project_budget_lines_tenant_update ON public.project_budget_lines
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

DROP POLICY IF EXISTS project_budget_lines_tenant_delete ON public.project_budget_lines;
CREATE POLICY project_budget_lines_tenant_delete ON public.project_budget_lines
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'budgets.manage'));

--------------------------------------------------------------------------------
-- 6b) Recurring service history — do not cascade-delete occurrences
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_occurrences_def_org_fk') THEN
    ALTER TABLE public.recurrence_occurrences DROP CONSTRAINT recurrence_occurrences_def_org_fk;
  END IF;
END $$;

ALTER TABLE public.recurrence_occurrences
  ADD CONSTRAINT recurrence_occurrences_def_org_fk
  FOREIGN KEY (recurrence_definition_id, organization_id)
  REFERENCES public.recurrence_definitions (id, organization_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.recurrence_definitions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.recurrence_occurrences o
      WHERE o.recurrence_definition_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'recurrence_definitions: used definitions cannot be hard-deleted; pause or end instead'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'recurrence_definitions: identity is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'ended' AND NEW.status IS DISTINCT FROM 'ended' THEN
      RAISE EXCEPTION 'recurrence_definitions: ended definitions cannot change status'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('active', 'paused', 'ended') THEN
      RAISE EXCEPTION 'recurrence_definitions: invalid status'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurrence_definitions_guard ON public.recurrence_definitions;
CREATE TRIGGER recurrence_definitions_guard
  BEFORE UPDATE OR DELETE ON public.recurrence_definitions
  FOR EACH ROW
  EXECUTE FUNCTION app.recurrence_definitions_guard();

CREATE OR REPLACE FUNCTION app.recurrence_occurrences_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'planned' THEN
      RAISE EXCEPTION 'recurrence_occurrences: generated/skipped/cancelled history cannot be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.recurrence_definition_id IS DISTINCT FROM OLD.recurrence_definition_id
       OR NEW.occurrence_date IS DISTINCT FROM OLD.occurrence_date
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'recurrence_occurrences: identity is immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('generated', 'skipped', 'cancelled')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'recurrence_occurrences: operational history status is frozen'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'planned' AND NEW.status NOT IN ('planned', 'generated', 'skipped', 'cancelled') THEN
      RAISE EXCEPTION 'recurrence_occurrences: invalid status transition'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurrence_occurrences_guard ON public.recurrence_occurrences;
CREATE TRIGGER recurrence_occurrences_guard
  BEFORE UPDATE OR DELETE ON public.recurrence_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION app.recurrence_occurrences_guard();

--------------------------------------------------------------------------------
-- 7) Recurring financial drafts — permission is specific to draft_kind
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_select ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_select ON public.recurring_financial_drafts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.read'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.read'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.read'))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_insert ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_insert ON public.recurring_financial_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.finalize'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_update ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_update ON public.recurring_financial_drafts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.finalize'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.finalize'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_delete ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_delete ON public.recurring_financial_drafts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.finalize'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

--------------------------------------------------------------------------------
-- 8) Tax rule org guard (country-pack rules have null organization_id)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.estimates_tax_rule_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rule_org uuid;
BEGIN
  IF NEW.tax_rule_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT organization_id INTO rule_org
  FROM public.tax_rules
  WHERE id = NEW.tax_rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimates: tax rule not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF rule_org IS NOT NULL AND rule_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'estimates: tax rule belongs to another organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_tax_rule_guard ON public.estimates;
CREATE TRIGGER estimates_tax_rule_guard
  BEFORE INSERT OR UPDATE OF tax_rule_id, organization_id ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION app.estimates_tax_rule_guard();

--------------------------------------------------------------------------------
-- 9) Forms — document owner type + offline idempotency
--------------------------------------------------------------------------------

ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'form_submission';

CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_org_offline_client_uq
  ON public.form_submissions (organization_id, offline_client_id)
  WHERE offline_client_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 10) Budgets — at most one active budget per project
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS project_budgets_one_active_per_project_uq
  ON public.project_budgets (organization_id, project_id)
  WHERE status = 'active' AND archived_at IS NULL;

--------------------------------------------------------------------------------
-- 11) FORCE RLS on all next-gen tenant tables
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'estimates',
    'estimate_line_items',
    'project_service_details',
    'recurrence_definitions',
    'recurrence_occurrences',
    'approval_rules',
    'approval_requests',
    'month_close_periods',
    'month_close_adjustments',
    'project_budgets',
    'project_budget_lines',
    'project_budget_revisions',
    'form_templates',
    'form_submissions',
    'material_usage_records',
    'equipment_usage_records',
    'command_center_item_states',
    'recurring_financial_drafts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END $$;
