-- Wave 3 foundations: field operations, assets, fleet, maintenance.
-- Optional — unused orgs unaffected. No notification delivery.
-- External users must not mutate canonical financial truth from these tables.

INSERT INTO public.permissions (key, category, description) VALUES
  ('field_ops.read', 'projects', 'View daily logs, punch lists and inspections'),
  ('field_ops.manage', 'projects', 'Manage field operations records'),
  ('assets.read', 'expenses', 'View assets and equipment'),
  ('assets.manage', 'expenses', 'Manage assets, fleet and maintenance')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- Field operations
--------------------------------------------------------------------------------

CREATE TABLE "daily_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "log_date" date NOT NULL,
  "weather" text,
  "summary" text NOT NULL,
  "workforce_notes" text,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "daily_logs_project_date_idx" ON "daily_logs" ("project_id", "log_date");

CREATE TABLE "punch_list_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'open' NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "location" text,
  "due_date" date,
  "closed_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "punch_list_items_status_known" CHECK (
    "status" IN ('open', 'in_progress', 'done', 'cancelled')
  ),
  CONSTRAINT "punch_list_items_priority_known" CHECK (
    "priority" IN ('low', 'normal', 'high', 'critical')
  )
);

CREATE INDEX "punch_list_items_project_idx" ON "punch_list_items" ("project_id");

CREATE TABLE "inspections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "kind" text DEFAULT 'general' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "scheduled_on" date,
  "completed_on" date,
  "result" text,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inspections_status_known" CHECK (
    "status" IN ('scheduled', 'in_progress', 'passed', 'failed', 'cancelled')
  )
);

CREATE INDEX "inspections_project_idx" ON "inspections" ("project_id");

--------------------------------------------------------------------------------
-- Assets / equipment / fleet / maintenance
--------------------------------------------------------------------------------

CREATE TABLE "assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "asset_kind" text DEFAULT 'equipment' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "identifier" text,
  "manufacturer" text,
  "model" text,
  "serial_number" text,
  "assigned_project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assets_kind_known" CHECK (
    "asset_kind" IN ('equipment', 'vehicle', 'tool', 'other')
  ),
  CONSTRAINT "assets_status_known" CHECK (
    "status" IN ('active', 'in_maintenance', 'retired', 'disposed')
  )
);

CREATE INDEX "assets_org_idx" ON "assets" ("organization_id");

CREATE TABLE "fleet_vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "plate_number" text,
  "vin" text,
  "odometer" numeric(18, 6),
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "fleet_vehicles_org_idx" ON "fleet_vehicles" ("organization_id");
CREATE UNIQUE INDEX "fleet_vehicles_asset_uq" ON "fleet_vehicles" ("asset_id");

CREATE TABLE "maintenance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "performed_on" date,
  "cost_amount" numeric(18, 6),
  "currency" char(3),
  "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE SET NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "maintenance_records_status_known" CHECK (
    "status" IN ('planned', 'in_progress', 'completed', 'cancelled')
  )
);

CREATE INDEX "maintenance_records_asset_idx" ON "maintenance_records" ("asset_id");

-- Inventory foundation (quantity tracking only — not GL / not Expense).
CREATE TABLE "inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "material_item_id" uuid REFERENCES "material_items"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "sku" text,
  "unit" text NOT NULL DEFAULT 'ea',
  "quantity_on_hand" numeric(18, 6) NOT NULL DEFAULT '0',
  "reorder_level" numeric(18, 6),
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "inventory_items_org_idx" ON "inventory_items" ("organization_id");

CREATE TABLE "inventory_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "inventory_item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "movement_type" text NOT NULL,
  "quantity" numeric(18, 6) NOT NULL,
  "occurred_on" date NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_movements_type_known" CHECK (
    "movement_type" IN ('receive', 'issue', 'adjust', 'return')
  )
);

CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" ("inventory_item_id");

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'daily_logs',
    'punch_list_items',
    'inspections',
    'assets',
    'fleet_vehicles',
    'maintenance_records',
    'inventory_items',
    'inventory_movements'
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
