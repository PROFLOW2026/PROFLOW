-- 0077_billing_records_rls_boq_finalize
-- Hotfix for 0073_financial_rls_permission_gates.
--
-- Root cause:  0073 set the billing_records UPDATE policy to require
-- billing.manage only.  However, app.finalizeBillingRecordWithPermission
-- is intentionally designed to accept boq.billing.create (for the BOQ
-- progress-billing path where a project-manager may finalize without the
-- broad billing.manage capability).  The mismatch caused the ORM UPDATE
-- executed by finalizeBillingRecordCore to be silently blocked by RLS,
-- leaving the row in status = 'draft', which then caused the subsequent
-- app.freeze_document_brand_snapshot call to raise
-- "brand snapshot subject missing, wrong org, or not issued".
--
-- Fix: widen the UPDATE policy USING + WITH CHECK to also accept
-- boq.billing.create, mirroring the already-correct INSERT policy.
-- The application-layer assertPermission gates in
-- finalizeBillingRecordWithPermission / finalizeBillingRecord remain
-- unchanged and continue to be the primary semantic guard.
-- This migration has no data changes; it is a pure policy replace.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS billing_records_tenant_update ON public.billing_records;
CREATE POLICY billing_records_tenant_update ON public.billing_records
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'billing.manage')
      -- BOQ progress billing finalization is allowed with boq.billing.create
      -- (same capability that INSERT already accepts for the same path).
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'billing.manage')
      OR app.has_org_permission(organization_id, 'boq.billing.create')
    )
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
  );
