-- Wave 3 foundations: procurement / materials / committed cost.
-- HARD RULE: CommittedCost != Expense. POs do not post actual cost until
-- an Expense (or equivalent actual) exists.
-- Optional — unused orgs unaffected.

INSERT INTO public.permissions (key, category, description) VALUES
  ('procurement.read', 'expenses', 'View RFQs, supplier quotes and purchase orders'),
  ('procurement.manage', 'expenses', 'Manage procurement and purchase orders'),
  ('materials.read', 'expenses', 'View material catalog'),
  ('materials.manage', 'expenses', 'Manage material catalog and prices')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- Materials catalog
--------------------------------------------------------------------------------

CREATE TABLE "material_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "sku" text,
  "name" text NOT NULL,
  "manufacturer" text,
  "model" text,
  "unit" text NOT NULL DEFAULT 'ea',
  "default_unit_price" numeric(18, 6),
  "currency" char(3),
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "material_items_org_idx" ON "material_items" ("organization_id");

CREATE TABLE "material_vendor_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "material_item_id" uuid NOT NULL REFERENCES "material_items"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "unit_price" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "effective_from" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "material_vendor_prices_material_idx" ON "material_vendor_prices" ("material_item_id");

--------------------------------------------------------------------------------
-- RFQ / supplier quotes / POs
--------------------------------------------------------------------------------

CREATE TABLE "procurement_rfqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "due_date" date,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "procurement_rfqs_status_known" CHECK (
    "status" IN ('draft', 'sent', 'closed', 'cancelled')
  )
);

CREATE INDEX "procurement_rfqs_org_idx" ON "procurement_rfqs" ("organization_id");

CREATE TABLE "procurement_rfq_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rfq_id" uuid NOT NULL REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "material_item_id" uuid REFERENCES "material_items"("id") ON DELETE SET NULL,
  "quantity" numeric(18, 6) NOT NULL DEFAULT '1',
  "unit" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "procurement_rfq_lines_rfq_idx" ON "procurement_rfq_lines" ("rfq_id");

CREATE TABLE "supplier_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rfq_id" uuid REFERENCES "procurement_rfqs"("id") ON DELETE SET NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "currency" char(3) NOT NULL,
  "total_amount" numeric(18, 6),
  "received_on" date,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_quotes_status_known" CHECK (
    "status" IN ('received', 'shortlisted', 'accepted', 'rejected')
  )
);

CREATE INDEX "supplier_quotes_org_idx" ON "supplier_quotes" ("organization_id");

CREATE TABLE "supplier_quote_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "supplier_quote_id" uuid NOT NULL REFERENCES "supplier_quotes"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "quantity" numeric(18, 6) NOT NULL DEFAULT '1',
  "unit_amount" numeric(18, 6) NOT NULL,
  "line_total" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "supplier_quote_lines_quote_idx" ON "supplier_quote_lines" ("supplier_quote_id");

CREATE TABLE "purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "supplier_quote_id" uuid REFERENCES "supplier_quotes"("id") ON DELETE SET NULL,
  "reference" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "currency" char(3) NOT NULL,
  "committed_amount" numeric(18, 6) NOT NULL,
  "ordered_on" date,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_orders_status_known" CHECK (
    "status" IN ('draft', 'issued', 'partially_received', 'closed', 'cancelled')
  )
);

CREATE INDEX "purchase_orders_org_idx" ON "purchase_orders" ("organization_id");
CREATE INDEX "purchase_orders_project_idx" ON "purchase_orders" ("project_id");

CREATE TABLE "purchase_order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "material_item_id" uuid REFERENCES "material_items"("id") ON DELETE SET NULL,
  "quantity" numeric(18, 6) NOT NULL DEFAULT '1',
  "unit_amount" numeric(18, 6) NOT NULL,
  "line_total" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" ("purchase_order_id");

-- Explicit committed-cost ledger distinct from expenses (doc 21).
CREATE TABLE "committed_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "committed_costs_status_known" CHECK (
    "status" IN ('open', 'partially_consumed', 'closed', 'cancelled')
  )
);

CREATE INDEX "committed_costs_org_idx" ON "committed_costs" ("organization_id");
CREATE INDEX "committed_costs_po_idx" ON "committed_costs" ("purchase_order_id");

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'material_items',
    'material_vendor_prices',
    'procurement_rfqs',
    'procurement_rfq_lines',
    'supplier_quotes',
    'supplier_quote_lines',
    'purchase_orders',
    'purchase_order_lines',
    'committed_costs'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_select', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id))',
      tenant_table || '_tenant_update', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app.is_org_member(organization_id))',
      tenant_table || '_tenant_delete', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tenant_table || '_service_all', tenant_table);
  END LOOP;
END $$;
