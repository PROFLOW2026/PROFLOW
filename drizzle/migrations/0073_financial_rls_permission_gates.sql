-- 0073: DB-011 — Complete permission-aware RLS on ALL sensitive financial tables.
--
-- DESIGN
-- ──────
-- Every financial table is protected on two axes:
--
--   1. MODULE PERMISSION — org member + read/manage permission
--      (replaces bare is_org_member() membership-only checks from earlier migrations)
--
--   2. PROJECT ACCESS — project_id IS NULL OR can_access_project(org, project)
--      A user with ap.manage but only access to Project A may NOT read, insert,
--      update, or delete records belonging to Project B.
--
-- Both axes are embedded EXPLICITLY in every policy (SELECT, INSERT, UPDATE,
-- DELETE).  No post-hoc helper call is needed; the policies are self-contained
-- and auditable directly from this file.
--
-- TABLES
-- ──────
-- Group A — direct project_id column:
--   ap_bills, billing_records, expenses, expense_allocations, committed_costs
--
-- Group B — project access via parent row:
--   ap_bill_lines, ap_po_matches, ap_payment_applications → parent ap_bills
--   billing_lines → parent billing_records
--   payments → parent billing_records
--
-- Group C — no project_id (org-level only):
--   ap_payments, bank_accounts, bank_import_batches, bank_transactions,
--   bank_match_suggestions, bank_match_decisions
--
-- Group D — configuration table (SELECT stays membership-only; writes tightened):
--   tax_overrides
--
-- PRIOR POLICY NAMES
-- ──────────────────
-- All affected tables had policies named <table>_tenant_select / _insert /
-- _update / _delete created by 0001_rls_security.sql or 0012_ap_vendor_portal.sql.
-- Those exact names are dropped and re-created below.  Service-role bypass
-- policies (<table>_service_all) are unchanged — service_role already has
-- BYPASSRLS but the explicit policy satisfies FORCE ROW LEVEL SECURITY on
-- the table owner role used by migrations.
--
-- BYPASS AUDIT
-- ────────────
-- After applying, run the verification query at the bottom of this file against
-- pg_policies to confirm that no membership-only authenticated policy remains on
-- any of the affected tables.
--
-- Owner must apply. For OWNER REVIEW ONLY. Do NOT apply to Production without
-- explicit Owner approval. Next applied migration after 0072.
-- Historical migrations 0000–0072 are NOT modified.

--------------------------------------------------------------------------------
-- Helper: project_id column predicate (inlined per table)
--   (project_id IS NULL OR app.can_access_project(organization_id, project_id))
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- ── GROUP A: Tables with direct project_id column ──
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 1. AP BILLS  (ap.read / ap.manage + project)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_bills_tenant_select ON public.ap_bills;
CREATE POLICY ap_bills_tenant_select ON public.ap_bills
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_insert ON public.ap_bills;
CREATE POLICY ap_bills_tenant_insert ON public.ap_bills
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_update ON public.ap_bills;
CREATE POLICY ap_bills_tenant_update ON public.ap_bills
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS ap_bills_tenant_delete ON public.ap_bills;
CREATE POLICY ap_bills_tenant_delete ON public.ap_bills
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 2. BILLING RECORDS  (billing.read / billing.manage + project)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS billing_records_tenant_select ON public.billing_records;
CREATE POLICY billing_records_tenant_select ON public.billing_records
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_insert ON public.billing_records;
CREATE POLICY billing_records_tenant_insert ON public.billing_records
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'billing.manage')
      -- BOQ progress billing creation is allowed with boq.billing.create alone.
      -- Finalization still requires billing.manage (enforced by the UPDATE policy).
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_update ON public.billing_records;
CREATE POLICY billing_records_tenant_update ON public.billing_records
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS billing_records_tenant_delete ON public.billing_records;
CREATE POLICY billing_records_tenant_delete ON public.billing_records
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 3. EXPENSES  (expenses.read / expenses.create / expenses.update / finalize + project)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_tenant_select ON public.expenses;
CREATE POLICY expenses_tenant_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.read')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_insert ON public.expenses;
CREATE POLICY expenses_tenant_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.create')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_update ON public.expenses;
CREATE POLICY expenses_tenant_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expenses_tenant_delete ON public.expenses;
CREATE POLICY expenses_tenant_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.finalize')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 4. EXPENSE ALLOCATIONS  (expenses.read / expenses.update + project)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS expense_allocations_tenant_select ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_select ON public.expense_allocations
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.read')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_insert ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_insert ON public.expense_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_update ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_update ON public.expense_allocations
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS expense_allocations_tenant_delete ON public.expense_allocations;
CREATE POLICY expense_allocations_tenant_delete ON public.expense_allocations
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.update')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- 5. COMMITTED COSTS  (procurement.read / procurement.manage + project)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS committed_costs_tenant_select ON public.committed_costs;
CREATE POLICY committed_costs_tenant_select ON public.committed_costs
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.read')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_insert ON public.committed_costs;
CREATE POLICY committed_costs_tenant_insert ON public.committed_costs
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_update ON public.committed_costs;
CREATE POLICY committed_costs_tenant_update ON public.committed_costs
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

DROP POLICY IF EXISTS committed_costs_tenant_delete ON public.committed_costs;
CREATE POLICY committed_costs_tenant_delete ON public.committed_costs
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );

--------------------------------------------------------------------------------
-- ── GROUP B: Tables with project access via parent row ──
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 6. AP BILL LINES  (ap.read / ap.manage + project via ap_bills)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_bill_lines_tenant_select ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_select ON public.ap_bill_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_insert ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_insert ON public.ap_bill_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_update ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_update ON public.ap_bill_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_delete ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_delete ON public.ap_bill_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_bill_lines.ap_bill_id
         AND b.organization_id = ap_bill_lines.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

-- ap_bill_lines economic project target — also restrict direct project_id on lines
-- (a line may carry its own project_id for multi-project allocation)
SELECT app.and_authenticated_policy_predicate(
  'ap_bill_lines',
  $pred$
    economic_target_type IS DISTINCT FROM 'project'
    OR project_id IS NULL
    OR app.can_access_project(organization_id, project_id)
  $pred$
);

--------------------------------------------------------------------------------
-- 7. AP PO MATCHES  (ap.read / ap.manage + project via ap_bills)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_po_matches_tenant_select ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_select ON public.ap_po_matches
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_insert ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_insert ON public.ap_po_matches
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_update ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_update ON public.ap_po_matches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_delete ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_delete ON public.ap_po_matches
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_po_matches.ap_bill_id
         AND b.organization_id = ap_po_matches.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

--------------------------------------------------------------------------------
-- 8. AP PAYMENT APPLICATIONS  (ap.read / ap.manage + project via ap_bills)
--    ap_payment_applications has ap_bill_id → ap_bills.project_id
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_payment_applications_tenant_select ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_select ON public.ap_payment_applications
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_insert ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_insert ON public.ap_payment_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

-- UPDATE + DELETE: immutability trigger blocks these at the trigger level.
-- RLS policies are kept as defense-in-depth.
DROP POLICY IF EXISTS ap_payment_applications_tenant_update ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_update ON public.ap_payment_applications
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_delete ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_delete ON public.ap_payment_applications
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
    AND EXISTS (
      SELECT 1 FROM public.ap_bills b
       WHERE b.id = ap_payment_applications.ap_bill_id
         AND b.organization_id = ap_payment_applications.organization_id
         AND (b.project_id IS NULL OR app.can_access_project(b.organization_id, b.project_id))
    )
  );

--------------------------------------------------------------------------------
-- 9. BILLING LINES  (billing.read / billing.manage + project via billing_records)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS billing_lines_tenant_select ON public.billing_lines;
CREATE POLICY billing_lines_tenant_select ON public.billing_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_insert ON public.billing_lines;
CREATE POLICY billing_lines_tenant_insert ON public.billing_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_update ON public.billing_lines;
CREATE POLICY billing_lines_tenant_update ON public.billing_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
    )
  );

DROP POLICY IF EXISTS billing_lines_tenant_delete ON public.billing_lines;
CREATE POLICY billing_lines_tenant_delete ON public.billing_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1 FROM public.billing_records br
       WHERE br.id = billing_lines.billing_record_id
         AND br.organization_id = billing_lines.organization_id
         AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
    )
  );

--------------------------------------------------------------------------------
-- 10. PAYMENTS (customer collections)  (billing.read / billing.manage + project via billing_records)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS payments_tenant_select ON public.payments;
CREATE POLICY payments_tenant_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_insert ON public.payments;
CREATE POLICY payments_tenant_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_update ON public.payments;
CREATE POLICY payments_tenant_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
      )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
      )
    )
  );

DROP POLICY IF EXISTS payments_tenant_delete ON public.payments;
CREATE POLICY payments_tenant_delete ON public.payments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND (
      billing_record_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.billing_records br
         WHERE br.id = payments.billing_record_id
           AND br.organization_id = payments.organization_id
           AND (br.project_id IS NULL OR app.can_access_project(br.organization_id, br.project_id))
      )
    )
  );

--------------------------------------------------------------------------------
-- ── GROUP C: Tables with no project_id (org-level only) ──
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 11. AP PAYMENTS  (ap.read / ap.manage — no project_id on this table)
--     Immutability guard trigger still applies.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS ap_payments_tenant_select ON public.ap_payments;
CREATE POLICY ap_payments_tenant_select ON public.ap_payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_payments_tenant_insert ON public.ap_payments;
CREATE POLICY ap_payments_tenant_insert ON public.ap_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS ap_payments_tenant_update ON public.ap_payments;
CREATE POLICY ap_payments_tenant_update ON public.ap_payments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS ap_payments_tenant_delete ON public.ap_payments;
CREATE POLICY ap_payments_tenant_delete ON public.ap_payments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

--------------------------------------------------------------------------------
-- 12. BANK ACCOUNTS  (banking.read / banking.manage)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_accounts_tenant_select ON public.bank_accounts;
CREATE POLICY bank_accounts_tenant_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_accounts_tenant_insert ON public.bank_accounts;
CREATE POLICY bank_accounts_tenant_insert ON public.bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_accounts_tenant_update ON public.bank_accounts;
CREATE POLICY bank_accounts_tenant_update ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_accounts_tenant_delete ON public.bank_accounts;
CREATE POLICY bank_accounts_tenant_delete ON public.bank_accounts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

--------------------------------------------------------------------------------
-- 13. BANK IMPORT BATCHES  (banking.read / banking.manage)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_import_batches_tenant_select ON public.bank_import_batches;
CREATE POLICY bank_import_batches_tenant_select ON public.bank_import_batches
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_import_batches_tenant_insert ON public.bank_import_batches;
CREATE POLICY bank_import_batches_tenant_insert ON public.bank_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_import_batches_tenant_update ON public.bank_import_batches;
CREATE POLICY bank_import_batches_tenant_update ON public.bank_import_batches
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_import_batches_tenant_delete ON public.bank_import_batches;
CREATE POLICY bank_import_batches_tenant_delete ON public.bank_import_batches
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

--------------------------------------------------------------------------------
-- 14. BANK TRANSACTIONS  (banking.read / banking.manage)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_transactions_tenant_select ON public.bank_transactions;
CREATE POLICY bank_transactions_tenant_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_transactions_tenant_insert ON public.bank_transactions;
CREATE POLICY bank_transactions_tenant_insert ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_transactions_tenant_update ON public.bank_transactions;
CREATE POLICY bank_transactions_tenant_update ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_transactions_tenant_delete ON public.bank_transactions;
CREATE POLICY bank_transactions_tenant_delete ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

--------------------------------------------------------------------------------
-- 15. BANK MATCH SUGGESTIONS  (banking.read / banking.manage)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_match_suggestions_tenant_select ON public.bank_match_suggestions;
CREATE POLICY bank_match_suggestions_tenant_select ON public.bank_match_suggestions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_match_suggestions_tenant_insert ON public.bank_match_suggestions;
CREATE POLICY bank_match_suggestions_tenant_insert ON public.bank_match_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_match_suggestions_tenant_update ON public.bank_match_suggestions;
CREATE POLICY bank_match_suggestions_tenant_update ON public.bank_match_suggestions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_match_suggestions_tenant_delete ON public.bank_match_suggestions;
CREATE POLICY bank_match_suggestions_tenant_delete ON public.bank_match_suggestions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

--------------------------------------------------------------------------------
-- 16. BANK MATCH DECISIONS  (banking.read / banking.manage)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS bank_match_decisions_tenant_select ON public.bank_match_decisions;
CREATE POLICY bank_match_decisions_tenant_select ON public.bank_match_decisions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.read')
  );

DROP POLICY IF EXISTS bank_match_decisions_tenant_insert ON public.bank_match_decisions;
CREATE POLICY bank_match_decisions_tenant_insert ON public.bank_match_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_match_decisions_tenant_update ON public.bank_match_decisions;
CREATE POLICY bank_match_decisions_tenant_update ON public.bank_match_decisions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

DROP POLICY IF EXISTS bank_match_decisions_tenant_delete ON public.bank_match_decisions;
CREATE POLICY bank_match_decisions_tenant_delete ON public.bank_match_decisions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'banking.manage')
  );

--------------------------------------------------------------------------------
-- ── GROUP D: Configuration table — SELECT stays membership-only ──
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 17. TAX OVERRIDES  (SELECT = membership-only; WRITES = ap.manage)
--
-- DOCUMENTED EXCEPTION: tax_overrides stores per-vendor tax method / rate
-- overrides (configuration rows, not financial balance rows).  The field values
-- (method, rate %) pose negligible disclosure risk compared to actual amounts.
-- SELECT access remains gated on org membership only.
-- Write access (INSERT / UPDATE / DELETE) is tightened to ap.manage to prevent
-- manipulation of tax calculations by unprivileged org members.
-- A future migration may tighten SELECT if sensitivity requirements change.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS tax_overrides_tenant_insert ON public.tax_overrides;
CREATE POLICY tax_overrides_tenant_insert ON public.tax_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS tax_overrides_tenant_update ON public.tax_overrides;
CREATE POLICY tax_overrides_tenant_update ON public.tax_overrides
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

DROP POLICY IF EXISTS tax_overrides_tenant_delete ON public.tax_overrides;
CREATE POLICY tax_overrides_tenant_delete ON public.tax_overrides
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

--------------------------------------------------------------------------------
-- POST-APPLY VERIFICATION — run this query against pg_policies after applying:
--
-- SELECT
--   c.relname AS "table",
--   p.polname AS "policy",
--   ARRAY(SELECT rol.rolname FROM pg_roles rol WHERE rol.oid = ANY(p.polroles)) AS roles,
--   CASE p.polcmd
--     WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
--   pg_get_expr(p.polqual, p.polrelid) AS using_expr,
--   pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
-- FROM pg_policy p
-- JOIN pg_class c ON c.oid = p.polrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN (
--     'ap_bills','ap_bill_lines','ap_po_matches','ap_payments',
--     'ap_payment_applications','billing_records','billing_lines','payments',
--     'expenses','expense_allocations','committed_costs',
--     'bank_accounts','bank_import_batches','bank_transactions',
--     'bank_match_suggestions','bank_match_decisions','tax_overrides'
--   )
-- ORDER BY c.relname, p.polname;
--
-- Expected: every authenticated policy has has_org_permission() in USING/WITH CHECK.
-- Expected: project-scoped tables have can_access_project() in every USING/WITH CHECK.
-- Expected: tax_overrides SELECT policy uses is_org_member() only (documented exception).
-- Expected: no extra membership-only authenticated policy remains on any table.
--
-- SCENARIO TEST (run as a project-restricted user with ap.manage but Project A only):
--   INSERT INTO ap_bills (..., project_id = <project_A_id>) → ALLOWED
--   INSERT INTO ap_bills (..., project_id = <project_B_id>) → DENIED (RLS)
--   UPDATE ap_bills SET notes = '...' WHERE project_id = <project_B_id> → DENIED
--   DELETE FROM ap_bills WHERE project_id = <project_B_id> → DENIED
--   Unauthorized cross-project financial writes = 0
--------------------------------------------------------------------------------
