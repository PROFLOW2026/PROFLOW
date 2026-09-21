-- Employee and owner project folders live directly under ProjectFlow / פרויקטים.
-- Adds the organization-level projects_root semantic type. No data backfill.

ALTER TABLE public.storage_folder_mappings
  DROP CONSTRAINT IF EXISTS storage_folder_mappings_semantic_known;

ALTER TABLE public.storage_folder_mappings
  ADD CONSTRAINT storage_folder_mappings_semantic_known CHECK (
    semantic_folder_type IN (
      'organization_root',
      'clients_root',
      'client_root',
      'projects_root',
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
  );
