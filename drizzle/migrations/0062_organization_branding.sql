-- 0062_organization_branding
-- Additive only. Does NOT modify 0000–0061.
-- UNAPPLIED — Owner applies later.
--
-- Organization company identity + multi-brand profiles + document brand snapshots.
-- Logo/signature/stamp assets use Storage keys under {orgId}/branding/... (not Documents OCR queue).
-- Portal stays OFF. Document branding ≠ UI theme.

--------------------------------------------------------------------------------
-- Company identity (1:1 with organization)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  trading_name text,
  registration_number text,
  vat_tax_id text,
  extra_identifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  website text,
  main_email text,
  main_phone text,
  secondary_phone text,
  whatsapp_phone text,
  billing_email text,
  sales_email text,
  support_email text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_company_profiles_org_uq UNIQUE (organization_id),
  CONSTRAINT organization_company_profiles_extra_identifiers_is_array
    CHECK (jsonb_typeof(extra_identifiers) = 'array')
);

CREATE INDEX IF NOT EXISTS organization_company_profiles_org_idx
  ON public.organization_company_profiles (organization_id);

--------------------------------------------------------------------------------
-- Brand profiles (N per org; exactly one default among active)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  -- Logos (storage object keys; nullable)
  logo_primary_key text,
  logo_primary_content_type text,
  logo_primary_byte_size integer,
  logo_primary_width integer,
  logo_primary_height integer,
  logo_compact_key text,
  logo_compact_content_type text,
  logo_dark_key text,
  logo_dark_content_type text,
  logo_light_key text,
  logo_light_content_type text,
  -- Visual signature / stamp (not cryptographic e-sign)
  signature_image_key text,
  signature_image_content_type text,
  stamp_image_key text,
  stamp_image_content_type text,
  -- Colors (HEX #RRGGBB)
  primary_color text NOT NULL DEFAULT '#0F766E',
  secondary_color text NOT NULL DEFAULT '#334155',
  -- Layout presets
  header_layout text NOT NULL DEFAULT 'letterhead',
  footer_style text NOT NULL DEFAULT 'detailed',
  document_theme text NOT NULL DEFAULT 'customer',
  template_preset text NOT NULL DEFAULT 'standard',
  -- Visibility
  show_logo boolean NOT NULL DEFAULT true,
  show_legal_name boolean NOT NULL DEFAULT true,
  show_display_name boolean NOT NULL DEFAULT true,
  show_registration_number boolean NOT NULL DEFAULT true,
  show_vat_tax_id boolean NOT NULL DEFAULT true,
  show_address boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT true,
  show_email boolean NOT NULL DEFAULT true,
  show_website boolean NOT NULL DEFAULT true,
  show_page_numbers boolean NOT NULL DEFAULT true,
  show_generated_date boolean NOT NULL DEFAULT true,
  show_document_reference boolean NOT NULL DEFAULT true,
  -- Signature/stamp policy (defaults conservative)
  allow_signature_on_quotes boolean NOT NULL DEFAULT false,
  allow_signature_on_reports boolean NOT NULL DEFAULT false,
  allow_stamp boolean NOT NULL DEFAULT false,
  include_signature_by_default boolean NOT NULL DEFAULT false,
  include_stamp_by_default boolean NOT NULL DEFAULT false,
  -- Document free-text (plain; not Payment Terms catalog)
  footer_custom_text text,
  quote_footer_text text,
  quote_terms_text text,
  report_footer_text text,
  payment_instructions_text text,
  general_document_note text,
  email_signature_text text,
  po_terms_text text,
  service_report_note text,
  report_disclaimer_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT organization_brand_profiles_status_known
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT organization_brand_profiles_header_layout_known
    CHECK (header_layout IN ('letterhead', 'logo_sides', 'centered', 'minimal')),
  CONSTRAINT organization_brand_profiles_footer_style_known
    CHECK (footer_style IN ('minimal', 'detailed', 'legal')),
  CONSTRAINT organization_brand_profiles_document_theme_known
    CHECK (document_theme IN ('customer', 'internal')),
  CONSTRAINT organization_brand_profiles_template_preset_known
    CHECK (template_preset IN ('standard', 'minimal', 'formal', 'detailed')),
  CONSTRAINT organization_brand_profiles_primary_color_hex
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT organization_brand_profiles_secondary_color_hex
    CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT organization_brand_profiles_org_name_uq UNIQUE (organization_id, name),
  CONSTRAINT organization_brand_profiles_id_org_uq UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS organization_brand_profiles_org_idx
  ON public.organization_brand_profiles (organization_id);

-- Active brand = status='active' AND archived_at IS NULL (same predicate everywhere).
ALTER TABLE public.organization_brand_profiles
  DROP CONSTRAINT IF EXISTS organization_brand_profiles_active_archive_consistency;
ALTER TABLE public.organization_brand_profiles
  ADD CONSTRAINT organization_brand_profiles_active_archive_consistency
  CHECK (
    (status = 'active' AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  );

DROP INDEX IF EXISTS organization_brand_profiles_one_default_uq;
CREATE UNIQUE INDEX organization_brand_profiles_one_default_uq
  ON public.organization_brand_profiles (organization_id)
  WHERE is_default = true AND status = 'active' AND archived_at IS NULL;

--------------------------------------------------------------------------------
-- Optional brand selection inheritance
-- Product Quote (customer commercial) = public.estimates
-- Commercial Change Quote = public.quotes (change-order negotiation quotes)
-- Do NOT mix these tables.
--------------------------------------------------------------------------------

-- Work orders are projects.work_kind='work_order' (no separate work_orders table).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid;

-- Composite FKs require UNIQUE (id, organization_id) on referencing tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_id_organization_id_uq'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'estimates_id_organization_id_uq'
  ) THEN
    CREATE UNIQUE INDEX estimates_id_organization_id_uq
      ON public.estimates (id, organization_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_id_organization_id_uq'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'quotes_id_organization_id_uq'
  ) THEN
    CREATE UNIQUE INDEX quotes_id_organization_id_uq
      ON public.quotes (id, organization_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_id_organization_id_uq'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'projects_id_organization_id_uq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS projects_id_organization_id_uq
      ON public.projects (id, organization_id);
  END IF;
END $$;

-- Composite FKs use ON DELETE RESTRICT (never SET NULL): PostgreSQL would
-- otherwise nullify organization_id too. Brand profiles are archive-only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_brand_profile_org_fk'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_brand_profile_org_fk
      FOREIGN KEY (brand_profile_id, organization_id)
      REFERENCES public.organization_brand_profiles (id, organization_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_brand_profile_org_fk'
  ) THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_brand_profile_org_fk
      FOREIGN KEY (brand_profile_id, organization_id)
      REFERENCES public.organization_brand_profiles (id, organization_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_brand_profile_org_fk'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_brand_profile_org_fk
      FOREIGN KEY (brand_profile_id, organization_id)
      REFERENCES public.organization_brand_profiles (id, organization_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_brand_profile_org_fk'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_brand_profile_org_fk
      FOREIGN KEY (brand_profile_id, organization_id)
      REFERENCES public.organization_brand_profiles (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- Historical branding snapshots for issued/final documents
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_brand_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  brand_profile_id uuid,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_brand_snapshots_entity_type_known CHECK (
    entity_type IN (
      'quote',
      'purchase_order',
      'rfq',
      'contract',
      'change_order',
      'boq',
      'boq_progress_batch',
      'report',
      'work_order',
      'service_report',
      'daily_log',
      'inspection',
      'form_submission',
      'safety_record',
      'timesheet',
      'billing_record',
      'customer_statement',
      'subcontract',
      'closeout',
      'warranty',
      'warranty_issue',
      'communication'
    )
  ),
  CONSTRAINT document_brand_snapshots_snapshot_is_object
    CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS document_brand_snapshots_entity_uq
  ON public.document_brand_snapshots (organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS document_brand_snapshots_org_idx
  ON public.document_brand_snapshots (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_brand_snapshots_brand_org_fk'
  ) THEN
    ALTER TABLE public.document_brand_snapshots
      ADD CONSTRAINT document_brand_snapshots_brand_org_fk
      FOREIGN KEY (brand_profile_id, organization_id)
      REFERENCES public.organization_brand_profiles (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- Seed existing orgs: company profile + default brand (idempotent)
--------------------------------------------------------------------------------

INSERT INTO public.organization_company_profiles (
  organization_id,
  legal_name,
  display_name,
  registration_number,
  vat_tax_id,
  country_code
)
SELECT
  o.id,
  o.name,
  o.name,
  CASE
    WHEN jsonb_typeof(s.value) = 'object' AND NULLIF(btrim(s.value->>'companyNumber'), '') IS NOT NULL
      THEN btrim(s.value->>'companyNumber')
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(s.value) = 'object' AND NULLIF(btrim(s.value->>'taxId'), '') IS NOT NULL
      THEN btrim(s.value->>'taxId')
    ELSE NULL
  END,
  o.country_code
FROM public.organizations o
LEFT JOIN public.organization_settings s
  ON s.organization_id = o.id
 AND s.key = 'legal_identity'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_company_profiles p WHERE p.organization_id = o.id
);

INSERT INTO public.organization_brand_profiles (
  organization_id,
  name,
  is_default,
  status
)
SELECT o.id, 'Default', true, 'active'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_brand_profiles b
  WHERE b.organization_id = o.id
    AND b.is_default = true
    AND b.status = 'active'
);

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls('organization_company_profiles', 'org.read', 'org.update', NULL);
SELECT app.install_org_table_rls('organization_brand_profiles', 'org.read', 'org.update', NULL);
-- Snapshots: SELECT for members; INSERT/UPDATE/DELETE never via authenticated.
-- Capture is only via app.freeze_document_brand_snapshot (SECURITY DEFINER).
SELECT app.install_org_table_rls('document_brand_snapshots', 'org.read', 'org.update', NULL);
DROP POLICY IF EXISTS document_brand_snapshots_tenant_insert ON public.document_brand_snapshots;
DROP POLICY IF EXISTS document_brand_snapshots_tenant_update ON public.document_brand_snapshots;
DROP POLICY IF EXISTS document_brand_snapshots_tenant_delete ON public.document_brand_snapshots;

-- Internal helpers: NOT granted to authenticated (freeze calls them as SECURITY DEFINER owner).
CREATE OR REPLACE FUNCTION app.document_brand_snapshot_required_permission(p_entity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_entity_type
    WHEN 'quote' THEN 'quotes.manage'
    WHEN 'purchase_order' THEN 'procurement.manage'
    WHEN 'rfq' THEN 'procurement.manage'
    WHEN 'contract' THEN 'contracts.manage'
    WHEN 'change_order' THEN 'changes.approve'
    WHEN 'boq' THEN 'boq.manage'
    WHEN 'boq_progress_batch' THEN 'boq.progress.approve'
    WHEN 'report' THEN 'org.read'
    WHEN 'work_order' THEN 'service.manage'
    WHEN 'service_report' THEN 'service.manage'
    WHEN 'daily_log' THEN 'field_ops.manage'
    WHEN 'inspection' THEN 'field_ops.manage'
    WHEN 'form_submission' THEN 'forms.submit'
    WHEN 'safety_record' THEN 'safety.manage'
    WHEN 'timesheet' THEN 'time.manage'
    WHEN 'billing_record' THEN 'billing.manage'
    WHEN 'customer_statement' THEN 'billing.read'
    WHEN 'subcontract' THEN 'vendors.manage'
    WHEN 'closeout' THEN 'projects.update'
    WHEN 'warranty' THEN 'projects.update'
    WHEN 'warranty_issue' THEN 'projects.update'
    WHEN 'communication' THEN 'communications.manage'
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION app.document_brand_snapshot_subject_project_id(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  IF p_entity_type = 'purchase_order' THEN
    SELECT po.project_id INTO v_project FROM public.purchase_orders po
     WHERE po.id = p_entity_id AND po.organization_id = p_organization_id;
  ELSIF p_entity_type = 'rfq' THEN
    SELECT r.project_id INTO v_project FROM public.procurement_rfqs r
     WHERE r.id = p_entity_id AND r.organization_id = p_organization_id;
  ELSIF p_entity_type = 'contract' THEN
    SELECT c.project_id INTO v_project FROM public.contracts c
     WHERE c.id = p_entity_id AND c.organization_id = p_organization_id;
  ELSIF p_entity_type = 'change_order' THEN
    SELECT co.project_id INTO v_project FROM public.change_orders co
     WHERE co.id = p_entity_id AND co.organization_id = p_organization_id;
  ELSIF p_entity_type = 'boq' THEN
    SELECT b.project_id INTO v_project FROM public.project_boqs b
     WHERE b.id = p_entity_id AND b.organization_id = p_organization_id;
  ELSIF p_entity_type = 'boq_progress_batch' THEN
    SELECT pb.project_id INTO v_project FROM public.boq_progress_batches pb
     WHERE pb.id = p_entity_id AND pb.organization_id = p_organization_id;
  ELSIF p_entity_type IN ('work_order', 'service_report') THEN
    v_project := p_entity_id;
  ELSIF p_entity_type = 'daily_log' THEN
    SELECT d.project_id INTO v_project FROM public.daily_logs d
     WHERE d.id = p_entity_id AND d.organization_id = p_organization_id;
  ELSIF p_entity_type = 'inspection' THEN
    SELECT i.project_id INTO v_project FROM public.inspections i
     WHERE i.id = p_entity_id AND i.organization_id = p_organization_id;
  ELSIF p_entity_type = 'form_submission' THEN
    SELECT CASE
      WHEN f.owner_type IN ('project', 'job', 'work_order') THEN f.owner_id
      WHEN f.owner_type = 'planning_task' THEN (
        SELECT pwi.project_id
        FROM public.planning_work_items pwi
        WHERE pwi.id = f.owner_id
          AND pwi.organization_id = f.organization_id
      )
      WHEN f.owner_type = 'maintenance' THEN (
        SELECT a.assigned_project_id
        FROM public.maintenance_records m
        INNER JOIN public.assets a
          ON a.id = m.asset_id
         AND a.organization_id = m.organization_id
        WHERE m.id = f.owner_id
          AND m.organization_id = f.organization_id
      )
      WHEN f.owner_type = 'field_log' THEN (
        SELECT d.project_id
        FROM public.daily_logs d
        WHERE d.id = f.owner_id
          AND d.organization_id = f.organization_id
      )
      WHEN f.owner_type = 'inspection' THEN (
        SELECT i.project_id
        FROM public.inspections i
        WHERE i.id = f.owner_id
          AND i.organization_id = f.organization_id
      )
      ELSE NULL
    END INTO v_project
    FROM public.form_submissions f
    WHERE f.id = p_entity_id AND f.organization_id = p_organization_id;
  ELSIF p_entity_type = 'safety_record' THEN
    SELECT s.project_id INTO v_project FROM public.safety_records s
     WHERE s.id = p_entity_id AND s.organization_id = p_organization_id;
  ELSIF p_entity_type = 'billing_record' THEN
    SELECT br.project_id INTO v_project FROM public.billing_records br
     WHERE br.id = p_entity_id AND br.organization_id = p_organization_id;
  ELSIF p_entity_type = 'subcontract' THEN
    SELECT sa.project_id INTO v_project FROM public.subcontract_agreements sa
     WHERE sa.id = p_entity_id AND sa.organization_id = p_organization_id;
  ELSIF p_entity_type = 'closeout' THEN
    SELECT pc.project_id INTO v_project FROM public.project_closeouts pc
     WHERE pc.id = p_entity_id AND pc.organization_id = p_organization_id;
  ELSIF p_entity_type = 'warranty' THEN
    SELECT w.project_id INTO v_project FROM public.warranty_coverages w
     WHERE w.id = p_entity_id AND w.organization_id = p_organization_id;
  ELSIF p_entity_type = 'warranty_issue' THEN
    SELECT wi.project_id INTO v_project FROM public.warranty_issues wi
     WHERE wi.id = p_entity_id AND wi.organization_id = p_organization_id;
  ELSIF p_entity_type = 'communication' THEN
    SELECT oc.project_id INTO v_project FROM public.outbound_communications oc
     WHERE oc.id = p_entity_id AND oc.organization_id = p_organization_id;
  ELSE
    v_project := NULL;
  END IF;
  RETURN v_project;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.document_brand_snapshot_subject_ok(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ok boolean := false;
BEGIN
  IF p_entity_type = 'quote' THEN
    -- Product Quote = estimates (not commercial change quotes)
    SELECT EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = p_entity_id
        AND e.organization_id = p_organization_id
        AND e.status IN ('sent', 'accepted', 'rejected', 'expired', 'cancelled', 'converted')
    ) INTO v_ok;
  ELSIF p_entity_type = 'purchase_order' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = p_entity_id AND po.organization_id = p_organization_id
        AND po.status IN ('issued', 'partially_received', 'closed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'rfq' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.procurement_rfqs r
      WHERE r.id = p_entity_id AND r.organization_id = p_organization_id
        AND r.status IN ('sent', 'closed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'contract' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = p_entity_id AND c.organization_id = p_organization_id
        AND c.status IN ('active', 'closed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'change_order' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = p_entity_id AND co.organization_id = p_organization_id
    ) INTO v_ok;
  ELSIF p_entity_type = 'boq' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_boqs b
      WHERE b.id = p_entity_id AND b.organization_id = p_organization_id
        AND b.status IN ('active', 'superseded', 'closed')
    ) INTO v_ok;
  ELSIF p_entity_type = 'boq_progress_batch' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.boq_progress_batches pb
      WHERE pb.id = p_entity_id AND pb.organization_id = p_organization_id
        AND pb.status IN ('approved', 'billed', 'superseded', 'voided')
    ) INTO v_ok;
  ELSIF p_entity_type IN ('work_order', 'service_report') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.project_service_details d
        ON d.project_id = p.id AND d.organization_id = p.organization_id
      WHERE p.id = p_entity_id AND p.organization_id = p_organization_id
        AND p.work_kind = 'work_order'
        AND d.service_status IN ('completed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'daily_log' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.daily_logs d
      WHERE d.id = p_entity_id AND d.organization_id = p_organization_id
        AND d.status = 'finalized'
    ) INTO v_ok;
  ELSIF p_entity_type = 'inspection' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = p_entity_id AND i.organization_id = p_organization_id
        AND i.status IN ('passed', 'failed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'form_submission' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.form_submissions f
      WHERE f.id = p_entity_id AND f.organization_id = p_organization_id
        AND f.status IN ('submitted', 'void')
    ) INTO v_ok;
  ELSIF p_entity_type = 'safety_record' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.safety_records s
      WHERE s.id = p_entity_id AND s.organization_id = p_organization_id
        AND s.status IN ('closed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'timesheet' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = p_entity_id AND t.organization_id = p_organization_id
        AND t.status = 'approved'
    ) INTO v_ok;
  ELSIF p_entity_type = 'billing_record' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.billing_records br
      WHERE br.id = p_entity_id AND br.organization_id = p_organization_id
        AND br.status IN ('finalized', 'void')
    ) INTO v_ok;
  ELSIF p_entity_type = 'subcontract' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subcontract_agreements sa
      WHERE sa.id = p_entity_id AND sa.organization_id = p_organization_id
        AND sa.status IN ('completed', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'closeout' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_closeouts pc
      WHERE pc.id = p_entity_id AND pc.organization_id = p_organization_id
        AND pc.status IN ('closed', 'reopened')
    ) INTO v_ok;
  ELSIF p_entity_type = 'warranty' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.warranty_coverages w
      WHERE w.id = p_entity_id AND w.organization_id = p_organization_id
        AND w.status IN ('active', 'expired', 'void')
    ) INTO v_ok;
  ELSIF p_entity_type = 'warranty_issue' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.warranty_issues wi
      WHERE wi.id = p_entity_id AND wi.organization_id = p_organization_id
        AND wi.status IN ('resolved', 'cancelled')
    ) INTO v_ok;
  ELSIF p_entity_type = 'communication' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.outbound_communications oc
      WHERE oc.id = p_entity_id AND oc.organization_id = p_organization_id
        AND oc.status = 'sent'
    ) INTO v_ok;
  ELSE
    v_ok := false;
  END IF;
  RETURN COALESCE(v_ok, false);
END;
$fn$;

-- Resolve brand profile id for an entity (document override → project → org default).
CREATE OR REPLACE FUNCTION app.resolve_document_brand_profile_id(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_brand_profile_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_doc uuid;
  v_project uuid;
  v_project_brand uuid;
  v_default uuid;
BEGIN
  IF p_brand_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_brand_profiles b
      WHERE b.id = p_brand_profile_id
        AND b.organization_id = p_organization_id
        AND b.status = 'active'
        AND b.archived_at IS NULL
    ) THEN
      RETURN p_brand_profile_id;
    END IF;
    RAISE EXCEPTION 'brand profile does not belong to organization'
      USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'quote' THEN
    SELECT e.brand_profile_id INTO v_doc FROM public.estimates e
     WHERE e.id = p_entity_id AND e.organization_id = p_organization_id;
  ELSIF p_entity_type = 'purchase_order' THEN
    SELECT po.brand_profile_id INTO v_doc FROM public.purchase_orders po
     WHERE po.id = p_entity_id AND po.organization_id = p_organization_id;
  END IF;

  IF v_doc IS NOT NULL THEN
    RETURN v_doc;
  END IF;

  v_project := app.document_brand_snapshot_subject_project_id(
    p_organization_id, p_entity_type, p_entity_id
  );
  IF v_project IS NOT NULL THEN
    SELECT p.brand_profile_id INTO v_project_brand
    FROM public.projects p
    WHERE p.id = v_project AND p.organization_id = p_organization_id;
    IF v_project_brand IS NOT NULL THEN
      RETURN v_project_brand;
    END IF;
  END IF;

  SELECT b.id INTO v_default
  FROM public.organization_brand_profiles b
  WHERE b.organization_id = p_organization_id
    AND b.is_default = true
    AND b.status = 'active'
    AND b.archived_at IS NULL
  LIMIT 1;

  RETURN v_default;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.build_canonical_brand_snapshot_json(
  p_organization_id uuid,
  p_brand_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c public.organization_company_profiles%ROWTYPE;
  b public.organization_brand_profiles%ROWTYPE;
  v_lines jsonb := '[]'::jsonb;
  v_phones jsonb := '[]'::jsonb;
  v_emails jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.organization_company_profiles
   WHERE organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company profile missing'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_brand_profile_id IS NOT NULL THEN
    SELECT * INTO b FROM public.organization_brand_profiles
     WHERE id = p_brand_profile_id
       AND organization_id = p_organization_id
       AND status = 'active'
       AND archived_at IS NULL;
  END IF;

  IF c.address_line1 IS NOT NULL AND length(btrim(c.address_line1)) > 0 THEN
    v_lines := v_lines || to_jsonb(btrim(c.address_line1));
  END IF;
  IF c.address_line2 IS NOT NULL AND length(btrim(c.address_line2)) > 0 THEN
    v_lines := v_lines || to_jsonb(btrim(c.address_line2));
  END IF;
  IF COALESCE(c.city, c.region, c.postal_code) IS NOT NULL THEN
    v_lines := v_lines || to_jsonb(
      NULLIF(btrim(concat_ws(', ', NULLIF(c.city, ''), NULLIF(c.region, ''), NULLIF(c.postal_code, ''))), '')
    );
  END IF;
  IF c.country_code IS NOT NULL THEN
    v_lines := v_lines || to_jsonb(upper(c.country_code));
  END IF;
  v_lines := COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v_lines) t(x) WHERE x IS NOT NULL AND x <> 'null'::jsonb), '[]'::jsonb);

  IF c.main_phone IS NOT NULL THEN v_phones := v_phones || to_jsonb(c.main_phone); END IF;
  IF c.secondary_phone IS NOT NULL THEN v_phones := v_phones || to_jsonb(c.secondary_phone); END IF;
  IF c.whatsapp_phone IS NOT NULL THEN v_phones := v_phones || to_jsonb(c.whatsapp_phone); END IF;
  IF c.main_email IS NOT NULL THEN v_emails := v_emails || to_jsonb(c.main_email); END IF;
  IF c.billing_email IS NOT NULL THEN v_emails := v_emails || to_jsonb(c.billing_email); END IF;
  IF c.sales_email IS NOT NULL THEN v_emails := v_emails || to_jsonb(c.sales_email); END IF;
  IF c.support_email IS NOT NULL THEN v_emails := v_emails || to_jsonb(c.support_email); END IF;

  -- jsonb_build_object is capped at 100 args; merge parts.
  RETURN jsonb_build_object(
    'version', 1,
    'brandProfileId', b.id,
    'brandProfileName', b.name,
    'companyLegalName', c.legal_name,
    'companyDisplayName', c.display_name,
    'tradingName', c.trading_name,
    'registrationNumber', c.registration_number,
    'vatTaxId', c.vat_tax_id,
    'addressLines', v_lines,
    'phones', COALESCE(v_phones, '[]'::jsonb),
    'emails', COALESCE(v_emails, '[]'::jsonb),
    'website', c.website,
    'primaryColor', COALESCE(b.primary_color, '#0F766E'),
    'secondaryColor', COALESCE(b.secondary_color, '#334155'),
    'headerLayout', COALESCE(b.header_layout, 'letterhead'),
    'footerStyle', COALESCE(b.footer_style, 'detailed'),
    'documentTheme', COALESCE(b.document_theme, 'customer'),
    'templatePreset', COALESCE(b.template_preset, 'standard'),
    'capturedAt', (timezone('utc', now()))::text
  ) || jsonb_build_object(
    'showLogo', COALESCE(b.show_logo, true),
    'showLegalName', COALESCE(b.show_legal_name, true),
    'showDisplayName', COALESCE(b.show_display_name, true),
    'showRegistrationNumber', COALESCE(b.show_registration_number, true),
    'showVatTaxId', COALESCE(b.show_vat_tax_id, true),
    'showAddress', COALESCE(b.show_address, true),
    'showPhone', COALESCE(b.show_phone, true),
    'showEmail', COALESCE(b.show_email, true),
    'showWebsite', COALESCE(b.show_website, true),
    'showPageNumbers', COALESCE(b.show_page_numbers, true),
    'showGeneratedDate', COALESCE(b.show_generated_date, true),
    'showDocumentReference', COALESCE(b.show_document_reference, true),
    'allowSignatureOnQuotes', COALESCE(b.allow_signature_on_quotes, false),
    'allowSignatureOnReports', COALESCE(b.allow_signature_on_reports, false),
    'allowStamp', COALESCE(b.allow_stamp, false),
    'includeSignatureByDefault', COALESCE(b.include_signature_by_default, false),
    'includeStampByDefault', COALESCE(b.include_stamp_by_default, false)
  ) || jsonb_build_object(
    'logoPrimaryKey', b.logo_primary_key,
    'logoPrimaryContentType', b.logo_primary_content_type,
    'logoDarkKey', b.logo_dark_key,
    'logoDarkContentType', b.logo_dark_content_type,
    'logoCompactKey', b.logo_compact_key,
    'logoCompactContentType', b.logo_compact_content_type,
    'logoLightKey', b.logo_light_key,
    'logoLightContentType', b.logo_light_content_type,
    'signatureImageKey', b.signature_image_key,
    'signatureImageContentType', b.signature_image_content_type,
    'stampImageKey', b.stamp_image_key,
    'stampImageContentType', b.stamp_image_content_type,
    'footerCustomText', b.footer_custom_text,
    'quoteFooterText', b.quote_footer_text,
    'quoteTermsText', b.quote_terms_text,
    'reportFooterText', b.report_footer_text,
    'paymentInstructionsText', b.payment_instructions_text,
    'generalDocumentNote', b.general_document_note,
    'emailSignatureText', b.email_signature_text,
    'poTermsText', b.po_terms_text,
    'serviceReportNote', b.service_report_note,
    'reportDisclaimerText', b.report_disclaimer_text
  );
END;
$fn$;

DROP FUNCTION IF EXISTS app.freeze_document_brand_snapshot(uuid, text, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION app.freeze_document_brand_snapshot(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_brand_profile_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_permission text;
  v_project uuid;
  v_resolved_brand uuid;
  v_snapshot jsonb;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not an organization member' USING ERRCODE = '42501';
  END IF;

  v_permission := app.document_brand_snapshot_required_permission(p_entity_type);
  IF v_permission IS NULL THEN
    RAISE EXCEPTION 'unsupported brand snapshot entity type' USING ERRCODE = 'check_violation';
  END IF;

  IF p_entity_type = 'form_submission' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'forms.submit')
      OR app.has_org_permission(p_organization_id, 'forms.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'boq' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'boq.manage')
      OR app.has_org_permission(p_organization_id, 'boq.progress.approve')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'boq_progress_batch' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'boq.progress.approve')
      OR app.has_org_permission(p_organization_id, 'boq.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'change_order' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'changes.approve')
      OR app.has_org_permission(p_organization_id, 'changes.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT app.has_org_permission(p_organization_id, v_permission) THEN
    RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
  END IF;

  IF NOT app.document_brand_snapshot_subject_ok(
    p_organization_id, p_entity_type, p_entity_id
  ) THEN
    RAISE EXCEPTION 'brand snapshot subject missing, wrong org, or not issued'
      USING ERRCODE = '42501';
  END IF;

  v_project := app.document_brand_snapshot_subject_project_id(
    p_organization_id, p_entity_type, p_entity_id
  );
  IF v_project IS NOT NULL AND NOT app.can_access_project(p_organization_id, v_project) THEN
    RAISE EXCEPTION 'project access denied for brand snapshot capture'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.id INTO v_existing
  FROM public.document_brand_snapshots s
  WHERE s.organization_id = p_organization_id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_resolved_brand := app.resolve_document_brand_profile_id(
    p_organization_id, p_entity_type, p_entity_id, p_brand_profile_id
  );
  v_snapshot := app.build_canonical_brand_snapshot_json(
    p_organization_id, v_resolved_brand
  );

  INSERT INTO public.document_brand_snapshots (
    organization_id, entity_type, entity_id, brand_profile_id, snapshot
  ) VALUES (
    p_organization_id, p_entity_type, p_entity_id, v_resolved_brand, v_snapshot
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.document_brand_snapshot_required_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_required_permission(text) FROM authenticated;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_required_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION app.document_brand_snapshot_required_permission(text) TO service_role;

REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_project_id(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_project_id(uuid, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_project_id(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.document_brand_snapshot_subject_project_id(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_ok(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_ok(uuid, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.document_brand_snapshot_subject_ok(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.document_brand_snapshot_subject_ok(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.resolve_document_brand_profile_id(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_document_brand_profile_id(uuid, text, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.resolve_document_brand_profile_id(uuid, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.resolve_document_brand_profile_id(uuid, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.build_canonical_brand_snapshot_json(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.build_canonical_brand_snapshot_json(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.build_canonical_brand_snapshot_json(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.build_canonical_brand_snapshot_json(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) TO service_role;

-- Exactly one active default brand (DB adversarial guard)
-- Active = status='active' AND archived_at IS NULL.
-- If any brand profile rows exist for the org, exactly one active default is required
-- (blocks zero-default and last-active archive bypasses).
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.organization_brand_profiles_default_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org uuid;
  v_profile_count int;
  v_default_count int;
BEGIN
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);

  SELECT
    count(*),
    count(*) FILTER (
      WHERE status = 'active'
        AND archived_at IS NULL
        AND is_default = true
    )
  INTO v_profile_count, v_default_count
  FROM public.organization_brand_profiles
  WHERE organization_id = v_org;

  IF v_profile_count > 0 AND v_default_count <> 1 THEN
    RAISE EXCEPTION 'organization must have exactly one active default brand profile'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS organization_brand_profiles_default_invariant ON public.organization_brand_profiles;
CREATE CONSTRAINT TRIGGER organization_brand_profiles_default_invariant
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_brand_profiles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.organization_brand_profiles_default_invariant();

REVOKE ALL ON FUNCTION app.organization_brand_profiles_default_invariant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_brand_profiles_default_invariant() TO service_role;
