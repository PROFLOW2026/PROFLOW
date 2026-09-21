-- 0121: Employee App storage RLS correction (follow-up to 0120).
-- Migration after 0120. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0120.
--
-- 0120 added documents.read SELECT policies using app.has_org_permission only.
-- Employee App grants live in employee_permission_grants and are resolved by
-- app.uwm_has_permission (org RBAC OR employee grants). Without this correction,
-- employee-only documents.read users still cannot SELECT storage connection rows.

DROP POLICY IF EXISTS organization_storage_connections_documents_read_select
  ON public.organization_storage_connections;
CREATE POLICY organization_storage_connections_documents_read_select
  ON public.organization_storage_connections
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'documents.read')
  );

DROP POLICY IF EXISTS storage_folder_mappings_documents_read_select
  ON public.storage_folder_mappings;
CREATE POLICY storage_folder_mappings_documents_read_select
  ON public.storage_folder_mappings
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'documents.read')
  );
