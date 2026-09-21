-- 0124: Employee App operational RLS alignment with employee_permission_grants.
-- Migration after 0123. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0123.
--
-- PURPOSE
-- ───────
-- Align Employee App operational surfaces with employee_permission_grants via
-- app.uwm_has_permission (org RBAC OR employee grants) and fix project/task
-- all_organization access that previously stopped at org-role helpers /
-- assignment-only gates.
--
-- Section A — Project context for employee all_organization
-- Section B — Task read for all_organization (keep restricted privacy)
-- Section C — Financial RLS: has_org_permission → uwm_has_permission
--             project predicates: can_access_project → uwm_can_access_project_context
--
-- Bank_* WRITE policies are intentionally unchanged (credential/config surface).
-- Bank_* SELECT optionally uses uwm_has_permission(banking.read).
-- boq.billing.create OR clauses remain has_org_permission (BOQ path).

--------------------------------------------------------------------------------
-- Section A — Project context for employee all_organization
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_can_access_project_context(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.can_access_project(p_organization_id, p_project_id)
      OR app.uwm_employee_assigned_to_project(p_organization_id, p_project_id)
      OR app.employee_permission_scope(p_organization_id, 'projects.read')
           = 'all_organization'::public.permission_scope
      OR app.has_employee_permission(p_organization_id, 'projects.access_all');
$fn$;

REVOKE ALL ON FUNCTION app.uwm_can_access_project_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uwm_can_access_project_context(uuid, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS projects_tenant_select ON public.projects;
CREATE POLICY projects_tenant_select ON public.projects
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_can_access_project_context(organization_id, id)
  );

--------------------------------------------------------------------------------
-- Section B — Task read for all_organization (keep restricted privacy)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_employee_scope_allows_task(
  p_organization_id uuid,
  p_scope public.permission_scope,
  p_task_id uuid,
  p_project_id uuid,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_scope = 'all_organization' THEN
    RETURN true;
  END IF;

  IF p_scope = 'self_only' THEN
    IF p_task_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.task_assignees ta
      WHERE ta.task_id = p_task_id
        AND ta.employee_id = p_employee_id
    );
  END IF;

  IF p_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_scope = 'granted_projects' THEN
    RETURN app.can_access_project(p_organization_id, p_project_id)
        OR app.uwm_employee_project_assignment_is_current(
          p_organization_id, p_employee_id, p_project_id
        );
  END IF;

  -- assigned_only (and any unexpected scope): assignment gate
  RETURN app.uwm_employee_project_assignment_is_current(
    p_organization_id, p_employee_id, p_project_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_read_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_visibility public.workspace_visibility;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  -- Org role permissions: require workspace content access, then allow.
  IF app.has_org_permission(p_organization_id, 'tasks.read')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    IF NOT app.uwm_has_workspace_content_access(
      p_organization_id, p_workspace_id, p_project_id
    ) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- Employee all_organization: keep restricted-workspace privacy, but do not
  -- require workspace membership for non-restricted workspaces.
  IF app.linked_employee_id(p_organization_id) IS NOT NULL
     AND app.employee_permission_scope(p_organization_id, 'tasks.read')
           = 'all_organization'::public.permission_scope THEN
    SELECT w.workspace_visibility INTO v_visibility
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
      AND w.organization_id = p_organization_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    IF v_visibility = 'restricted'
       AND NOT app.uwm_has_base_workspace_access(p_organization_id, p_workspace_id) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  -- Scoped employee path: require workspace content access, then exercise grant.
  IF NOT app.uwm_has_workspace_content_access(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.read', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.uwm_employee_scope_allows_task(
  uuid, public.permission_scope, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_read_task(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.uwm_employee_scope_allows_task(
  uuid, public.permission_scope, uuid, uuid, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_read_task(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Section C — Financial RLS (Employee-accessible tables)
-- Pattern from 0073, with uwm_has_permission + uwm_can_access_project_context.
-- Preserves 0077 boq.billing.create OR on billing_records UPDATE.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 1. AP BILLS
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_bills_tenant_select ON public.ap_bills;
CREATE POLICY ap_bills_tenant_select ON public.ap_bills
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.read')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_insert ON public.ap_bills;
CREATE POLICY ap_bills_tenant_insert ON public.ap_bills
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_update ON public.ap_bills;
CREATE POLICY ap_bills_tenant_update ON public.ap_bills
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_delete ON public.ap_bills;
CREATE POLICY ap_bills_tenant_delete ON public.ap_bills
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 2. BILLING RECORDS  (billing + boq.billing.create OR)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS billing_records_tenant_select ON public.billing_records;
CREATE POLICY billing_records_tenant_select ON public.billing_records
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.read')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_insert ON public.billing_records;
CREATE POLICY billing_records_tenant_insert ON public.billing_records
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_update ON public.billing_records;
CREATE POLICY billing_records_tenant_update ON public.billing_records
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'billing.manage')
      -- Preserve 0077: BOQ progress billing finalization with boq.billing.create.
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_delete ON public.billing_records;
CREATE POLICY billing_records_tenant_delete ON public.billing_records
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 3. EXPENSES
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_tenant_select ON public.expenses;
CREATE POLICY expenses_tenant_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.read')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_insert ON public.expenses;
CREATE POLICY expenses_tenant_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.create')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_update ON public.expenses;
CREATE POLICY expenses_tenant_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_delete ON public.expenses;
CREATE POLICY expenses_tenant_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.finalize')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 4. EXPENSE ALLOCATIONS
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS expense_allocations_tenant_select ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_select ON public.expense_allocations
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.read')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_insert ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_insert ON public.expense_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_update ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_update ON public.expense_allocations
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_delete ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_delete ON public.expense_allocations
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 5. COMMITTED COSTS
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS committed_costs_tenant_select ON public.committed_costs;
CREATE POLICY committed_costs_tenant_select ON public.committed_costs
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'procurement.read')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_insert ON public.committed_costs;
CREATE POLICY committed_costs_tenant_insert ON public.committed_costs
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_update ON public.committed_costs;
CREATE POLICY committed_costs_tenant_update ON public.committed_costs
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_delete ON public.committed_costs;
CREATE POLICY committed_costs_tenant_delete ON public.committed_costs
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.uwm_can_access_project_context(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 6. AP BILL LINES
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_bill_lines_tenant_select ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_select ON public.ap_bill_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_insert ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_insert ON public.ap_bill_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_update ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_update ON public.ap_bill_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_delete ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_delete ON public.ap_bill_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

-- ap_bill_lines economic project target — direct project_id on lines
SELECT app.and_authenticated_policy_predicate(
  'ap_bill_lines',
  $pred$
    economic_target_type IS DISTINCT FROM 'project'
    OR project_id IS NULL
    OR app.uwm_can_access_project_context(organization_id, project_id)
  $pred$
);

--------------------------------------------------------------------------------
-- 7. AP PO MATCHES
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_po_matches_tenant_select ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_select ON public.ap_po_matches
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_insert ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_insert ON public.ap_po_matches
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_update ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_update ON public.ap_po_matches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_delete ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_delete ON public.ap_po_matches
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

--------------------------------------------------------------------------------
-- 8. AP PAYMENT APPLICATIONS
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_payment_applications_tenant_select ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_select ON public.ap_payment_applications
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_insert ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_insert ON public.ap_payment_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_update ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_update ON public.ap_payment_applications
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_delete ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_delete ON public.ap_payment_applications
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (
           b.project_id IS NULL
           OR app.uwm_can_access_project_context(b.organization_id, b.project_id)
         )
    )
  );

--------------------------------------------------------------------------------
-- 9. BILLING LINES
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS billing_lines_tenant_select ON public.billing_lines;
CREATE POLICY billing_lines_tenant_select ON public.billing_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (
           br.project_id IS NULL
           OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
         )
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_insert ON public.billing_lines;
CREATE POLICY billing_lines_tenant_insert ON public.billing_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (
           br.project_id IS NULL
           OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
         )
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_update ON public.billing_lines;
CREATE POLICY billing_lines_tenant_update ON public.billing_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (
           br.project_id IS NULL
           OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
         )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (
           br.project_id IS NULL
           OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
         )
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_delete ON public.billing_lines;
CREATE POLICY billing_lines_tenant_delete ON public.billing_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (
           br.project_id IS NULL
           OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
         )
    )
  );

--------------------------------------------------------------------------------
-- 10. PAYMENTS (customer collections)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS payments_tenant_select ON public.payments;
CREATE POLICY payments_tenant_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.read')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (
             br.project_id IS NULL
             OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
           )
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_insert ON public.payments;
CREATE POLICY payments_tenant_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (
             br.project_id IS NULL
             OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
           )
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_update ON public.payments;
CREATE POLICY payments_tenant_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (
             br.project_id IS NULL
             OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
           )
      )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (
             br.project_id IS NULL
             OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
           )
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_delete ON public.payments;
CREATE POLICY payments_tenant_delete ON public.payments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (
             br.project_id IS NULL
             OR app.uwm_can_access_project_context(br.organization_id, br.project_id)
           )
      )
    )
  );

--------------------------------------------------------------------------------
-- 11. AP PAYMENTS (org-level; no project_id)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_payments_tenant_select ON public.ap_payments;
CREATE POLICY ap_payments_tenant_select ON public.ap_payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_payments_tenant_insert ON public.ap_payments;
CREATE POLICY ap_payments_tenant_insert ON public.ap_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS ap_payments_tenant_update ON public.ap_payments;
CREATE POLICY ap_payments_tenant_update ON public.ap_payments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS ap_payments_tenant_delete ON public.ap_payments;
CREATE POLICY ap_payments_tenant_delete ON public.ap_payments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'ap.manage')
  );

--------------------------------------------------------------------------------
-- Optional: bank_* SELECT only → uwm_has_permission(banking.read)
-- WRITE policies intentionally left on has_org_permission (0073).
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_accounts_tenant_select ON public.bank_accounts;
CREATE POLICY bank_accounts_tenant_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_import_batches_tenant_select ON public.bank_import_batches;
CREATE POLICY bank_import_batches_tenant_select ON public.bank_import_batches
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_transactions_tenant_select ON public.bank_transactions;
CREATE POLICY bank_transactions_tenant_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_match_suggestions_tenant_select ON public.bank_match_suggestions;
CREATE POLICY bank_match_suggestions_tenant_select ON public.bank_match_suggestions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_match_decisions_tenant_select ON public.bank_match_decisions;
CREATE POLICY bank_match_decisions_tenant_select ON public.bank_match_decisions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'banking.read')
  );
