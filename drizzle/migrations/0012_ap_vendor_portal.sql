-- Wave 3: AP / PO matching + vendor portal grant scoping.
-- External users must not mutate canonical financial truth.
-- AP bills are payable obligations; matching links them to POs/expenses without
-- inventing a second Expense path. CommittedCost remains distinct from Expense.

INSERT INTO public.permissions (key, category, description) VALUES
  ('ap.read', 'expenses', 'View vendor bills and PO matches'),
  ('ap.manage', 'expenses', 'Manage vendor bills and PO matching')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Vendor portal grants need vendor_id (customer grants already use client_id).
ALTER TABLE "external_access_grants"
  ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "external_access_grants_vendor_idx"
  ON "external_access_grants" ("vendor_id");

ALTER TABLE "external_access_grants"
  DROP CONSTRAINT IF EXISTS "external_access_grants_scope_present";

-- Kind-scoped targets: vendor grants require vendor_id only; customer grants
-- require client/project and must not carry vendor_id. Prevents cross-kind
-- scope smuggling that could blur ExternalPrincipal vs Membership boundaries.
ALTER TABLE "external_access_grants"
  ADD CONSTRAINT "external_access_grants_scope_present" CHECK (
    (
      "portal_kind" = 'vendor'
      AND "vendor_id" IS NOT NULL
      AND "client_id" IS NULL
      AND "project_id" IS NULL
    )
    OR (
      "portal_kind" = 'customer'
      AND "vendor_id" IS NULL
      AND num_nonnulls("client_id", "project_id") >= 1
    )
  );

--------------------------------------------------------------------------------
-- Accounts payable bills (vendor invoices) — not Expense actuals by themselves
--------------------------------------------------------------------------------

CREATE TABLE "ap_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "purchase_order_id" uuid REFERENCES "purchase_orders"("id") ON DELETE SET NULL,
  "reference" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "bill_date" date,
  "due_date" date,
  "currency" char(3) NOT NULL,
  "total_amount" numeric(18, 6) NOT NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_bills_status_known" CHECK (
    "status" IN ('draft', 'open', 'partially_matched', 'matched', 'void')
  )
);

CREATE INDEX "ap_bills_org_idx" ON "ap_bills" ("organization_id");
CREATE INDEX "ap_bills_vendor_idx" ON "ap_bills" ("vendor_id");
CREATE INDEX "ap_bills_po_idx" ON "ap_bills" ("purchase_order_id");

CREATE TABLE "ap_bill_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ap_bill_id" uuid NOT NULL REFERENCES "ap_bills"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "quantity" numeric(18, 6) NOT NULL DEFAULT '1',
  "unit_amount" numeric(18, 6) NOT NULL,
  "line_total" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "purchase_order_line_id" uuid REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "ap_bill_lines_bill_idx" ON "ap_bill_lines" ("ap_bill_id");

-- Match suggestion / recorded link: AP bill ↔ Expense (actual) and/or PO (commitment).
-- Recording a match does not auto-create Expense rows.
CREATE TABLE "ap_po_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ap_bill_id" uuid NOT NULL REFERENCES "ap_bills"("id") ON DELETE CASCADE,
  "purchase_order_id" uuid REFERENCES "purchase_orders"("id") ON DELETE SET NULL,
  "expense_id" uuid REFERENCES "expenses"("id") ON DELETE SET NULL,
  "matched_amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_po_matches_status_known" CHECK (
    "status" IN ('proposed', 'accepted', 'rejected')
  ),
  CONSTRAINT "ap_po_matches_target_present" CHECK (
    num_nonnulls("purchase_order_id", "expense_id") >= 1
  )
);

CREATE INDEX "ap_po_matches_bill_idx" ON "ap_po_matches" ("ap_bill_id");

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'ap_bills',
    'ap_bill_lines',
    'ap_po_matches'
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
