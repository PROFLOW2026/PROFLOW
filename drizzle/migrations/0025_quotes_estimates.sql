-- 0025_quotes_estimates
-- Additive only. Pre-sale estimates (product: Quotes).
-- Tables: estimates / estimate_line_items — MUST NOT reuse change-order `quotes`.
-- Quote ≠ Billing ≠ Change Order ≠ Revenue.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.

CREATE UNIQUE INDEX IF NOT EXISTS clients_id_organization_id_uq
  ON public.clients (id, organization_id);

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  client_id uuid,
  contact_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL,
  tax_mode text NOT NULL DEFAULT 'exclusive',
  tax_rule_id uuid,
  validity_date date,
  notes text,
  subtotal_amount numeric(18,6),
  tax_amount numeric(18,6),
  total_amount numeric(18,6),
  estimated_cost_amount numeric(18,6),
  estimated_margin_percent numeric(9,6),
  converted_project_id uuid,
  converted_at timestamptz,
  sent_at timestamptz,
  decided_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT estimates_status_known CHECK (status IN ('draft','ready','sent','accepted','rejected','expired','cancelled','converted')),
  CONSTRAINT estimates_tax_mode_known CHECK (tax_mode IN ('exclusive','inclusive','none')),
  CONSTRAINT estimates_amounts_non_negative CHECK (
    (subtotal_amount IS NULL OR subtotal_amount >= 0)
    AND (tax_amount IS NULL OR tax_amount >= 0)
    AND (total_amount IS NULL OR total_amount >= 0)
    AND (estimated_cost_amount IS NULL OR estimated_cost_amount >= 0)
  ),
  CONSTRAINT estimates_margin_range CHECK (
    estimated_margin_percent IS NULL
    OR (estimated_margin_percent >= -100 AND estimated_margin_percent <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS estimates_id_organization_id_uq ON public.estimates (id, organization_id);
CREATE INDEX IF NOT EXISTS estimates_org_status_idx ON public.estimates (organization_id, status);
CREATE INDEX IF NOT EXISTS estimates_org_client_idx ON public.estimates (organization_id, client_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimates_client_org_fk') THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_client_org_fk
      FOREIGN KEY (client_id, organization_id)
      REFERENCES public.clients (id, organization_id)
      ON DELETE SET NULL (client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimates_contact_org_fk') THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_contact_org_fk
      FOREIGN KEY (contact_id, organization_id)
      REFERENCES public.client_contacts (id, organization_id)
      ON DELETE SET NULL (contact_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimates_converted_project_org_fk') THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_converted_project_org_fk
      FOREIGN KEY (converted_project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (converted_project_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  quantity numeric(18,6) NOT NULL DEFAULT 1,
  unit text,
  unit_price_amount numeric(18,6) NOT NULL,
  estimated_unit_cost_amount numeric(18,6),
  line_total_amount numeric(18,6),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT estimate_line_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT estimate_line_items_amounts_non_negative CHECK (
    unit_price_amount >= 0
    AND (estimated_unit_cost_amount IS NULL OR estimated_unit_cost_amount >= 0)
    AND (line_total_amount IS NULL OR line_total_amount >= 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS estimate_line_items_id_organization_id_uq ON public.estimate_line_items (id, organization_id);
CREATE INDEX IF NOT EXISTS estimate_line_items_estimate_idx ON public.estimate_line_items (estimate_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_line_items_estimate_org_fk') THEN
    ALTER TABLE public.estimate_line_items
      ADD CONSTRAINT estimate_line_items_estimate_org_fk
      FOREIGN KEY (estimate_id, organization_id)
      REFERENCES public.estimates (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimates_tenant_select ON public.estimates
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.read'));

CREATE POLICY estimates_tenant_insert ON public.estimates
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimates_tenant_update ON public.estimates
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimates_tenant_delete ON public.estimates
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimates_service_all ON public.estimates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimate_line_items_tenant_select ON public.estimate_line_items
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.read'));

CREATE POLICY estimate_line_items_tenant_insert ON public.estimate_line_items
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimate_line_items_tenant_update ON public.estimate_line_items
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimate_line_items_tenant_delete ON public.estimate_line_items
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'quotes.manage'));

CREATE POLICY estimate_line_items_service_all ON public.estimate_line_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
