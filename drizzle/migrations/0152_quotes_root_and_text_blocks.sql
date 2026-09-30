--------------------------------------------------------------------------------
-- Product quotes: org-level storage root + reusable text blocks
--------------------------------------------------------------------------------

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
      'quotes_root',
      'quotes',
      'contracts',
      'billing',
      'vendor_invoices',
      'plans',
      'photos',
      'documents',
      'general_files',
      'vendors_root',
      'vendor_root',
      'employees_root',
      'employee_root',
      'organization_documents'
    )
  );

CREATE TABLE IF NOT EXISTS public.quote_default_text_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  legacy_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_default_text_blocks_id_organization_id_uq UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS quote_default_text_blocks_org_order_idx
  ON public.quote_default_text_blocks (organization_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS quote_default_text_blocks_org_legacy_uq
  ON public.quote_default_text_blocks (organization_id, legacy_key)
  WHERE legacy_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.estimate_text_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  source_default_block_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_text_blocks_id_organization_id_uq UNIQUE (id, organization_id),
  CONSTRAINT estimate_text_blocks_estimate_org_fk
    FOREIGN KEY (estimate_id, organization_id)
    REFERENCES public.estimates (id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS estimate_text_blocks_estimate_idx
  ON public.estimate_text_blocks (organization_id, estimate_id);

-- Seed legacy brand quote terms/footer into quote settings (once per org).
INSERT INTO public.quote_default_text_blocks (organization_id, title, body, enabled, sort_order, legacy_key)
SELECT DISTINCT ON (bp.organization_id)
  bp.organization_id,
  'תנאים מסחריים',
  trim(bp.quote_terms_text),
  true,
  100,
  'legacy_terms'
FROM public.organization_brand_profiles bp
WHERE bp.quote_terms_text IS NOT NULL
  AND trim(bp.quote_terms_text) <> ''
  AND bp.status = 'active'
  AND bp.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.quote_default_text_blocks q
    WHERE q.organization_id = bp.organization_id
  )
ORDER BY bp.organization_id, bp.is_default DESC, bp.updated_at DESC;

INSERT INTO public.quote_default_text_blocks (organization_id, title, body, enabled, sort_order, legacy_key)
SELECT DISTINCT ON (bp.organization_id)
  bp.organization_id,
  'כותרת תחתונה',
  trim(bp.quote_footer_text),
  true,
  110,
  'legacy_footer'
FROM public.organization_brand_profiles bp
WHERE bp.quote_footer_text IS NOT NULL
  AND trim(bp.quote_footer_text) <> ''
  AND bp.status = 'active'
  AND bp.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.quote_default_text_blocks q
    WHERE q.organization_id = bp.organization_id AND q.legacy_key = 'legacy_footer'
  )
ORDER BY bp.organization_id, bp.is_default DESC, bp.updated_at DESC;
