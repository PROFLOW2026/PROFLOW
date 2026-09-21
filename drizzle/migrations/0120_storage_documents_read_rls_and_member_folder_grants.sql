-- 0120: Storage status visibility for documents.read + org member folder grants.
-- Migration after 0119. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0119.
--
-- Fixes Employee App "storage not connected" when storage is connected but RLS
-- required integrations.read on organization_storage_connections / storage_folder_mappings.
-- Credentials remain in app.storage_connection_credential_refs (service_role only).

--------------------------------------------------------------------------------
-- 1. documents.read SELECT on storage connection status (no credentials in table)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS organization_storage_connections_documents_read_select
  ON public.organization_storage_connections;
CREATE POLICY organization_storage_connections_documents_read_select
  ON public.organization_storage_connections
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.read')
  );

DROP POLICY IF EXISTS storage_folder_mappings_documents_read_select
  ON public.storage_folder_mappings;
CREATE POLICY storage_folder_mappings_documents_read_select
  ON public.storage_folder_mappings
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.read')
  );

--------------------------------------------------------------------------------
-- 2. Org member document category grants (main app users, not Employee App)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_member_document_category_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  category text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  granted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_member_document_category_grants_uq
    UNIQUE (organization_id, membership_id, category)
);

CREATE INDEX IF NOT EXISTS org_member_document_category_grants_membership_idx
  ON public.org_member_document_category_grants (organization_id, membership_id);

ALTER TABLE public.org_member_document_category_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_member_document_category_grants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_member_document_category_grants_self_select
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_self_select
  ON public.org_member_document_category_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND membership_id IN (
      SELECT om.id
      FROM public.organization_memberships om
      WHERE om.organization_id = org_member_document_category_grants.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_member_document_category_grants_manage_select
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_manage_select
  ON public.org_member_document_category_grants
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS org_member_document_category_grants_manage_insert
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_manage_insert
  ON public.org_member_document_category_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS org_member_document_category_grants_manage_update
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_manage_update
  ON public.org_member_document_category_grants
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS org_member_document_category_grants_manage_delete
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_manage_delete
  ON public.org_member_document_category_grants
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS org_member_document_category_grants_service_all
  ON public.org_member_document_category_grants;
CREATE POLICY org_member_document_category_grants_service_all
  ON public.org_member_document_category_grants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_member_document_category_grants TO authenticated;
