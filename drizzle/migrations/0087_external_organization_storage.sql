-- 0087_external_organization_storage
-- Additive only. Does NOT modify 0000–0086.
-- UNAPPLIED — Owner applies manually before production use.
--
-- Organization-level external cloud storage (OneDrive, Google Drive, Dropbox, Box).
-- Credentials sealed in app.storage_connection_credential_refs (service_role only).

--------------------------------------------------------------------------------
-- Organization storage connections
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_storage_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  is_primary boolean NOT NULL DEFAULT false,
  external_account_id text,
  external_account_name text,
  external_account_email text,
  external_tenant_id text,
  root_folder_external_id text,
  root_folder_name text NOT NULL DEFAULT 'ProjectFlow',
  scopes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_expires_at timestamptz,
  connected_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  connected_at timestamptz,
  last_validated_at timestamptz,
  last_error text,
  quota_used_bytes bigint,
  quota_total_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_storage_connections_provider_known CHECK (
    provider IN ('onedrive', 'google_drive', 'dropbox', 'box')
  ),
  CONSTRAINT organization_storage_connections_status_known CHECK (
    status IN ('disconnected', 'connecting', 'connected', 'reconnect_required', 'error')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_storage_connections_id_org_uq
  ON public.organization_storage_connections (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_storage_connections_org_provider_uq
  ON public.organization_storage_connections (organization_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS organization_storage_connections_org_primary_uq
  ON public.organization_storage_connections (organization_id)
  WHERE is_primary = true AND status = 'connected';

CREATE INDEX IF NOT EXISTS organization_storage_connections_org_status_idx
  ON public.organization_storage_connections (organization_id, status);

--------------------------------------------------------------------------------
-- Folder mappings (semantic types → provider folder IDs)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.storage_folder_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  semantic_folder_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  external_folder_id text NOT NULL,
  external_parent_id text,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_folder_mappings_status_known CHECK (
    status IN ('pending', 'ready', 'error')
  ),
  CONSTRAINT storage_folder_mappings_semantic_known CHECK (
    semantic_folder_type IN (
      'organization_root',
      'clients_root',
      'client_root',
      'project_root',
      'quotes',
      'contracts',
      'billing',
      'vendor_invoices',
      'plans',
      'photos',
      'documents',
      'general_files',
      'vendors_root',
      'employees_root',
      'organization_documents'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS storage_folder_mappings_id_org_uq
  ON public.storage_folder_mappings (id, organization_id);

ALTER TABLE public.storage_folder_mappings
  DROP CONSTRAINT IF EXISTS storage_folder_mappings_connection_org_fk;
ALTER TABLE public.storage_folder_mappings
  ADD CONSTRAINT storage_folder_mappings_connection_org_fk
  FOREIGN KEY (connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS storage_folder_mappings_semantic_entity_uq
  ON public.storage_folder_mappings (
    organization_id,
    connection_id,
    semantic_folder_type,
    COALESCE(entity_type, ''),
    COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX IF NOT EXISTS storage_folder_mappings_external_uq
  ON public.storage_folder_mappings (organization_id, connection_id, external_folder_id);

CREATE INDEX IF NOT EXISTS storage_folder_mappings_entity_idx
  ON public.storage_folder_mappings (organization_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

--------------------------------------------------------------------------------
-- External file metadata
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.storage_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  document_id uuid,
  document_version_id uuid,
  external_file_id text NOT NULL,
  external_parent_folder_id text,
  original_filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  external_etag text,
  checksum text,
  status text NOT NULL DEFAULT 'synced',
  last_error text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_files_status_known CHECK (
    status IN ('pending', 'synced', 'missing', 'error', 'deleted')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS storage_files_id_org_uq
  ON public.storage_files (id, organization_id);

ALTER TABLE public.storage_files
  DROP CONSTRAINT IF EXISTS storage_files_connection_org_fk;
ALTER TABLE public.storage_files
  ADD CONSTRAINT storage_files_connection_org_fk
  FOREIGN KEY (connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.storage_files
  DROP CONSTRAINT IF EXISTS storage_files_document_org_fk;
ALTER TABLE public.storage_files
  ADD CONSTRAINT storage_files_document_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id)
  ON DELETE SET NULL;

ALTER TABLE public.storage_files
  DROP CONSTRAINT IF EXISTS storage_files_version_org_fk;
ALTER TABLE public.storage_files
  ADD CONSTRAINT storage_files_version_org_fk
  FOREIGN KEY (document_version_id, organization_id)
  REFERENCES public.document_versions (id, organization_id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS storage_files_external_uq
  ON public.storage_files (organization_id, connection_id, external_file_id);

CREATE INDEX IF NOT EXISTS storage_files_document_idx
  ON public.storage_files (organization_id, document_id)
  WHERE document_id IS NOT NULL;

--------------------------------------------------------------------------------
-- Document external storage columns (legacy Supabase rows unchanged)
--------------------------------------------------------------------------------

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'supabase_legacy';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_connection_id uuid;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_file_id text;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_parent_folder_id text;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_etag text;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_storage_backend_known;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_storage_backend_known CHECK (
    storage_backend IN ('supabase_legacy', 'external')
  );

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_external_connection_org_fk;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_external_connection_org_fk
  FOREIGN KEY (external_connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id)
  ON DELETE SET NULL;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'supabase_legacy';

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS external_connection_id uuid;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS external_file_id text;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS external_parent_folder_id text;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS external_etag text;

ALTER TABLE public.document_versions
  DROP CONSTRAINT IF EXISTS document_versions_storage_backend_known;
ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_storage_backend_known CHECK (
    storage_backend IN ('supabase_legacy', 'external')
  );

ALTER TABLE public.document_versions
  DROP CONSTRAINT IF EXISTS document_versions_external_connection_org_fk;
ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_external_connection_org_fk
  FOREIGN KEY (external_connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id)
  ON DELETE SET NULL;

--------------------------------------------------------------------------------
-- Service-only credential refs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.storage_connection_credential_refs (
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL PRIMARY KEY,
  credentials_ref text NOT NULL,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_connection_credential_refs_nonblank CHECK (
    length(btrim(credentials_ref)) > 0
  ),
  CONSTRAINT storage_connection_credential_refs_connection_fk
    FOREIGN KEY (connection_id, organization_id)
    REFERENCES public.organization_storage_connections (id, organization_id)
    ON DELETE CASCADE
);

ALTER TABLE app.storage_connection_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.storage_connection_credential_refs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_connection_credential_refs_service_all
  ON app.storage_connection_credential_refs;
CREATE POLICY storage_connection_credential_refs_service_all
  ON app.storage_connection_credential_refs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE app.storage_connection_credential_refs FROM PUBLIC;
REVOKE ALL ON TABLE app.storage_connection_credential_refs FROM anon;
REVOKE ALL ON TABLE app.storage_connection_credential_refs FROM authenticated;
GRANT ALL ON TABLE app.storage_connection_credential_refs TO service_role;

--------------------------------------------------------------------------------
-- RLS (reuse integrations + documents permission gates)
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls(
  'organization_storage_connections',
  'integrations.read',
  'settings.manage',
  NULL
);
SELECT app.install_org_table_rls(
  'storage_folder_mappings',
  'integrations.read',
  'settings.manage',
  NULL
);
SELECT app.install_org_table_rls(
  'storage_files',
  'documents.read',
  'documents.manage',
  NULL
);
