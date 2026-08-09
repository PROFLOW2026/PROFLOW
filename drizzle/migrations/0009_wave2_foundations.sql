-- Wave 2 foundations: CRM pre-project, external principals, compliance,
-- governed custom fields, API keys & webhooks.
-- Optional modules — unused orgs are unaffected (progressive complexity).
-- ExternalPrincipal != Membership. CommittedCost not introduced here.

--------------------------------------------------------------------------------
-- Permissions (idempotent for already-seeded environments)
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('crm.read', 'commercial', 'View CRM prospects, opportunities and sales quotes'),
  ('crm.manage', 'commercial', 'Manage CRM pipeline and convert won deals'),
  ('compliance.read', 'administration', 'View compliance artifacts'),
  ('compliance.manage', 'administration', 'Manage insurance, licenses and certifications'),
  ('custom_fields.manage', 'administration', 'Define governed custom fields'),
  ('portal.manage', 'administration', 'Manage external portal access grants'),
  ('api.manage', 'administration', 'Manage API clients, keys and webhooks')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- CRM
--------------------------------------------------------------------------------

CREATE TABLE "crm_prospects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "email" text,
  "phone" text,
  "company_name" text,
  "notes" text,
  "converted_client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_prospects_status_known" CHECK ("status" IN ('active', 'converted', 'inactive'))
);

CREATE INDEX "crm_prospects_org_idx" ON "crm_prospects" ("organization_id");

CREATE TABLE "crm_prospect_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prospect_id" uuid NOT NULL REFERENCES "crm_prospects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "role" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "crm_prospect_contacts_prospect_idx" ON "crm_prospect_contacts" ("prospect_id");

CREATE TABLE "crm_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prospect_id" uuid REFERENCES "crm_prospects"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "source" text,
  "status" text DEFAULT 'new' NOT NULL,
  "email" text,
  "phone" text,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_leads_status_known" CHECK (
    "status" IN ('new', 'contacted', 'qualified', 'disqualified', 'converted')
  )
);

CREATE INDEX "crm_leads_org_idx" ON "crm_leads" ("organization_id");

CREATE TABLE "crm_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prospect_id" uuid REFERENCES "crm_prospects"("id") ON DELETE SET NULL,
  "lead_id" uuid REFERENCES "crm_leads"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "stage" text DEFAULT 'qualify' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "expected_value_amount" numeric(18, 6),
  "currency" char(3),
  "expected_start_date" date,
  "referral_source" text,
  "lost_reason" text,
  "converted_client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL,
  "converted_project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "converted_contract_id" uuid REFERENCES "contracts"("id") ON DELETE SET NULL,
  "converted_at" timestamp with time zone,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_opportunities_stage_known" CHECK (
    "stage" IN ('qualify', 'estimate', 'quote', 'negotiation', 'won', 'lost')
  ),
  CONSTRAINT "crm_opportunities_status_known" CHECK (
    "status" IN ('open', 'won', 'lost', 'cancelled')
  )
);

CREATE INDEX "crm_opportunities_org_idx" ON "crm_opportunities" ("organization_id");
CREATE INDEX "crm_opportunities_org_status_idx" ON "crm_opportunities" ("organization_id", "status");

CREATE TABLE "crm_opportunity_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "opportunity_id" uuid NOT NULL REFERENCES "crm_opportunities"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_by_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "crm_opportunity_notes_opportunity_idx" ON "crm_opportunity_notes" ("opportunity_id");

CREATE TABLE "crm_estimates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "opportunity_id" uuid NOT NULL REFERENCES "crm_opportunities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "internal_amount" numeric(18, 6),
  "currency" char(3) NOT NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_estimates_status_known" CHECK (
    "status" IN ('draft', 'final', 'superseded')
  )
);

CREATE INDEX "crm_estimates_opportunity_idx" ON "crm_estimates" ("opportunity_id");

CREATE TABLE "crm_sales_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "opportunity_id" uuid NOT NULL REFERENCES "crm_opportunities"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "currency" char(3) NOT NULL,
  "accepted_version_id" uuid,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_sales_quotes_status_known" CHECK (
    "status" IN ('draft', 'issued', 'accepted', 'rejected', 'cancelled')
  )
);

CREATE INDEX "crm_sales_quotes_opportunity_idx" ON "crm_sales_quotes" ("opportunity_id");

CREATE TABLE "crm_sales_quote_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "sales_quote_id" uuid NOT NULL REFERENCES "crm_sales_quotes"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "subtotal_amount" numeric(18, 6) NOT NULL,
  "tax_amount" numeric(18, 6),
  "total_amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "alternate_label" text,
  "notes" text,
  "issued_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_sales_quote_versions_status_known" CHECK (
    "status" IN ('draft', 'issued', 'superseded', 'accepted', 'rejected')
  ),
  CONSTRAINT "crm_sales_quote_versions_uq" UNIQUE ("sales_quote_id", "version_number")
);

CREATE INDEX "crm_sales_quote_versions_quote_idx" ON "crm_sales_quote_versions" ("sales_quote_id");

ALTER TABLE "crm_sales_quotes"
  ADD CONSTRAINT "crm_sales_quotes_accepted_version_fk"
  FOREIGN KEY ("accepted_version_id") REFERENCES "crm_sales_quote_versions"("id") ON DELETE SET NULL;

CREATE TABLE "crm_sales_quote_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "crm_sales_quote_versions"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "quantity" numeric(18, 6) DEFAULT '1' NOT NULL,
  "unit_amount" numeric(18, 6) NOT NULL,
  "line_total" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "crm_sales_quote_lines_version_idx" ON "crm_sales_quote_lines" ("version_id");

--------------------------------------------------------------------------------
-- External principals (portal) — NOT memberships
--------------------------------------------------------------------------------

CREATE TABLE "external_principals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "display_name" text,
  "auth_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "external_principals_email_uq" ON "external_principals" (lower("email"));

CREATE TABLE "external_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "principal_id" uuid NOT NULL REFERENCES "external_principals"("id") ON DELETE CASCADE,
  "portal_kind" text NOT NULL,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_access_grants_kind_known" CHECK (
    "portal_kind" IN ('customer', 'vendor')
  ),
  CONSTRAINT "external_access_grants_status_known" CHECK (
    "status" IN ('active', 'revoked', 'expired')
  ),
  CONSTRAINT "external_access_grants_scope_present" CHECK (
    num_nonnulls("client_id", "project_id") >= 1
  )
);

CREATE INDEX "external_access_grants_org_idx" ON "external_access_grants" ("organization_id");
CREATE INDEX "external_access_grants_principal_idx" ON "external_access_grants" ("principal_id");

--------------------------------------------------------------------------------
-- Compliance artifacts
--------------------------------------------------------------------------------

CREATE TABLE "compliance_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "artifact_kind" text NOT NULL,
  "name" text NOT NULL,
  "reference_number" text,
  "issuer" text,
  "issued_on" date,
  "expires_on" date,
  "status" text DEFAULT 'valid' NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "compliance_artifacts_kind_known" CHECK (
    "artifact_kind" IN ('insurance', 'license', 'certification', 'other')
  ),
  CONSTRAINT "compliance_artifacts_status_known" CHECK (
    "status" IN ('valid', 'expiring_soon', 'expired', 'revoked', 'pending')
  ),
  CONSTRAINT "compliance_artifacts_subject_known" CHECK (
    "subject_type" IN ('organization', 'employee', 'vendor', 'project')
  )
);

CREATE INDEX "compliance_artifacts_org_idx" ON "compliance_artifacts" ("organization_id");
CREATE INDEX "compliance_artifacts_expires_idx" ON "compliance_artifacts" ("organization_id", "expires_on");

--------------------------------------------------------------------------------
-- Governed custom fields
--------------------------------------------------------------------------------

CREATE TABLE "custom_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "field_type" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_field_definitions_entity_known" CHECK (
    "entity_type" IN ('client', 'project', 'vendor', 'employee', 'opportunity', 'expense')
  ),
  CONSTRAINT "custom_field_definitions_type_known" CHECK (
    "field_type" IN (
      'text', 'number', 'money', 'date', 'select', 'multi_select', 'boolean', 'reference'
    )
  ),
  CONSTRAINT "custom_field_definitions_org_entity_key_uq" UNIQUE ("organization_id", "entity_type", "key")
);

CREATE TABLE "custom_field_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "definition_id" uuid NOT NULL REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE,
  "entity_id" uuid NOT NULL,
  "value_text" text,
  "value_number" numeric(18, 6),
  "value_bool" boolean,
  "value_date" date,
  "value_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_field_values_def_entity_uq" UNIQUE ("definition_id", "entity_id")
);

CREATE INDEX "custom_field_values_entity_idx" ON "custom_field_values" ("organization_id", "entity_id");

--------------------------------------------------------------------------------
-- API / webhooks foundation
--------------------------------------------------------------------------------

CREATE TABLE "api_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_clients_status_known" CHECK ("status" IN ('active', 'disabled'))
);

CREATE INDEX "api_clients_org_idx" ON "api_clients" ("organization_id");

CREATE TABLE "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "api_client_id" uuid NOT NULL REFERENCES "api_clients"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "api_keys_org_idx" ON "api_keys" ("organization_id");
CREATE UNIQUE INDEX "api_keys_prefix_uq" ON "api_keys" ("key_prefix");

CREATE TABLE "webhook_endpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "secret_hash" text NOT NULL,
  "event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_endpoints_status_known" CHECK ("status" IN ('active', 'disabled'))
);

CREATE INDEX "webhook_endpoints_org_idx" ON "webhook_endpoints" ("organization_id");

CREATE TABLE "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "endpoint_id" uuid NOT NULL REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_deliveries_status_known" CHECK (
    "status" IN ('pending', 'delivered', 'failed', 'abandoned')
  )
);

CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries" ("endpoint_id");
CREATE INDEX "webhook_deliveries_org_idx" ON "webhook_deliveries" ("organization_id");

--------------------------------------------------------------------------------
-- RLS — tenant tables (authenticated member policies + service_role)
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'crm_prospects',
    'crm_prospect_contacts',
    'crm_leads',
    'crm_opportunities',
    'crm_opportunity_notes',
    'crm_estimates',
    'crm_sales_quotes',
    'crm_sales_quote_versions',
    'crm_sales_quote_lines',
    'external_access_grants',
    'compliance_artifacts',
    'custom_field_definitions',
    'custom_field_values',
    'api_clients',
    'api_keys',
    'webhook_endpoints',
    'webhook_deliveries'
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

-- external_principals are global identities (email), not org-owned rows.
-- Access is mediated via external_access_grants; only service_role / app layer mutates.
ALTER TABLE public.external_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_principals FORCE ROW LEVEL SECURITY;

CREATE POLICY external_principals_service_all
  ON public.external_principals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users may read principals only when they hold an active grant in an org they belong to.
CREATE POLICY external_principals_member_select
  ON public.external_principals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.external_access_grants g
      WHERE g.principal_id = external_principals.id
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND app.is_org_member(g.organization_id)
    )
  );
