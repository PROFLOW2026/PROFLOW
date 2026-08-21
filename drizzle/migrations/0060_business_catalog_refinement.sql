-- 0060_business_catalog_refinement
-- Additive only. Does NOT modify 0000–0059.
-- UNAPPLIED — Owner applies later.
--
-- Organization business catalogs with kind-aware integrity, payment-term FKs
-- (RESTRICT — catalogs in use are deactivated, never hard-deleted), daily-log
-- party links, Approvals 2.0 steps with historical request snapshots, timesheet
-- lock, document requirement rules, PO payment terms, cost-code attribution
-- columns, and idempotent existing-org universal catalog seed.
-- Portal stays OFF. No GL / payroll / inventory costing.

--------------------------------------------------------------------------------
-- Helpers: catalog kind assertion (DB-level integrity)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.assert_catalog_entry_kind(
  p_entry_id uuid,
  p_organization_id uuid,
  p_expected_kind text
) RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  actual_kind text;
BEGIN
  IF p_entry_id IS NULL THEN
    RETURN;
  END IF;
  SELECT e.kind
    INTO actual_kind
  FROM public.organization_catalog_entries e
  WHERE e.id = p_entry_id
    AND e.organization_id = p_organization_id;
  IF actual_kind IS NULL THEN
    RAISE EXCEPTION 'catalog entry % not found in organization %', p_entry_id, p_organization_id
      USING ERRCODE = '23503';
  END IF;
  IF actual_kind IS DISTINCT FROM p_expected_kind THEN
    RAISE EXCEPTION 'catalog kind mismatch: expected %, got % (entry %)',
      p_expected_kind, actual_kind, p_entry_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.catalog_entry_parent_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_kind text;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.kind INTO parent_kind
  FROM public.organization_catalog_entries e
  WHERE e.id = NEW.parent_id
    AND e.organization_id = NEW.organization_id;
  IF parent_kind IS NULL THEN
    RAISE EXCEPTION 'catalog parent % not found in organization %', NEW.parent_id, NEW.organization_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.kind = 'vendor_specialty' AND parent_kind IS DISTINCT FROM 'vendor_category' THEN
    RAISE EXCEPTION 'vendor_specialty parent must be vendor_category (got %)', parent_kind
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.vendor_catalog_link_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(
    NEW.catalog_entry_id,
    NEW.organization_id,
    NEW.link_kind
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.doc_requirement_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.catalog_entry_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- When a catalog entry is attached, its kind must match context_kind for
  -- vendor_category (and future catalog-backed contexts).
  IF NEW.context_kind = 'vendor_category' THEN
    PERFORM app.assert_catalog_entry_kind(
      NEW.catalog_entry_id,
      NEW.organization_id,
      'vendor_category'
    );
  ELSIF NEW.context_kind IN ('vendor_type', 'subcontract', 'employee', 'project', 'organization') THEN
    -- Non-catalog contexts must not point at a catalog entry.
    RAISE EXCEPTION 'document requirement context % cannot reference a catalog entry', NEW.context_kind
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.clients_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.client_type_id, NEW.organization_id, 'client_type');
  PERFORM app.assert_catalog_entry_kind(NEW.default_payment_term_id, NEW.organization_id, 'payment_term');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.vendors_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.default_payment_term_id, NEW.organization_id, 'payment_term');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.vendor_engagements_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.engagement_role_id, NEW.organization_id, 'engagement_role');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.payment_term_ref_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.payment_term_id, NEW.organization_id, 'payment_term');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.crm_leads_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.lead_source_id, NEW.organization_id, 'lead_source');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.crm_opportunities_catalog_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.lost_reason_id, NEW.organization_id, 'lost_reason');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.cost_code_ref_kind_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_catalog_entry_kind(NEW.cost_code_id, NEW.organization_id, 'cost_code');
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- organization_catalog_entries
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  parent_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_catalog_entries_kind_known CHECK (
    kind IN (
      'client_type', 'vendor_category', 'vendor_specialty', 'payment_term',
      'cost_code', 'lead_source', 'lost_reason', 'engagement_role'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS org_catalog_entries_id_org_uq
  ON public.organization_catalog_entries (id, organization_id);
-- Supports kind-aware composite FKs / documentation of (id, org, kind) identity.
CREATE UNIQUE INDEX IF NOT EXISTS org_catalog_entries_id_org_kind_uq
  ON public.organization_catalog_entries (id, organization_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS org_catalog_entries_org_kind_key_uq
  ON public.organization_catalog_entries (organization_id, kind, key);
CREATE INDEX IF NOT EXISTS org_catalog_entries_org_kind_idx
  ON public.organization_catalog_entries (organization_id, kind, is_active);
CREATE INDEX IF NOT EXISTS org_catalog_entries_parent_idx
  ON public.organization_catalog_entries (parent_id);

-- Parent same-org. RESTRICT: do not hard-delete a parent category while specialties exist.
-- (ON DELETE SET NULL on composite (parent_id, organization_id) would also try to null
-- organization_id, which is NOT NULL — forbidden.)
ALTER TABLE public.organization_catalog_entries
  DROP CONSTRAINT IF EXISTS org_catalog_entries_parent_org_fk;
ALTER TABLE public.organization_catalog_entries
  ADD CONSTRAINT org_catalog_entries_parent_org_fk
  FOREIGN KEY (parent_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS org_catalog_entries_parent_kind_trg ON public.organization_catalog_entries;
CREATE TRIGGER org_catalog_entries_parent_kind_trg
  BEFORE INSERT OR UPDATE OF parent_id, kind, organization_id
  ON public.organization_catalog_entries
  FOR EACH ROW
  EXECUTE FUNCTION app.catalog_entry_parent_kind_check();

--------------------------------------------------------------------------------
-- vendor_catalog_links
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendor_catalog_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  catalog_entry_id uuid NOT NULL,
  link_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_catalog_links_kind_known CHECK (
    link_kind IN ('vendor_category', 'vendor_specialty')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_catalog_links_uq
  ON public.vendor_catalog_links (vendor_id, catalog_entry_id, link_kind);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_catalog_links_id_org_uq
  ON public.vendor_catalog_links (id, organization_id);
CREATE INDEX IF NOT EXISTS vendor_catalog_links_vendor_idx
  ON public.vendor_catalog_links (organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS vendor_catalog_links_entry_idx
  ON public.vendor_catalog_links (organization_id, catalog_entry_id);

ALTER TABLE public.vendor_catalog_links
  DROP CONSTRAINT IF EXISTS vendor_catalog_links_vendor_org_fk;
ALTER TABLE public.vendor_catalog_links
  ADD CONSTRAINT vendor_catalog_links_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.vendor_catalog_links
  DROP CONSTRAINT IF EXISTS vendor_catalog_links_entry_org_fk;
ALTER TABLE public.vendor_catalog_links
  ADD CONSTRAINT vendor_catalog_links_entry_org_fk
  FOREIGN KEY (catalog_entry_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS vendor_catalog_links_kind_trg ON public.vendor_catalog_links;
CREATE TRIGGER vendor_catalog_links_kind_trg
  BEFORE INSERT OR UPDATE OF catalog_entry_id, link_kind, organization_id
  ON public.vendor_catalog_links
  FOR EACH ROW
  EXECUTE FUNCTION app.vendor_catalog_link_kind_check();

--------------------------------------------------------------------------------
-- document_requirement_rules
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_requirement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  context_kind text NOT NULL,
  catalog_entry_id uuid,
  context_key text,
  document_type_key text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  warn_days_before_expiry integer,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doc_requirement_rules_context_known CHECK (
    context_kind IN (
      'vendor_category', 'vendor_type', 'subcontract', 'employee', 'project', 'organization'
    )
  ),
  CONSTRAINT doc_requirement_rules_target_present CHECK (
    num_nonnulls(catalog_entry_id, context_key) >= 1
    OR context_kind IN ('subcontract', 'organization')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS doc_requirement_rules_id_org_uq
  ON public.document_requirement_rules (id, organization_id);
CREATE INDEX IF NOT EXISTS doc_requirement_rules_org_ctx_idx
  ON public.document_requirement_rules (organization_id, context_kind);

ALTER TABLE public.document_requirement_rules
  DROP CONSTRAINT IF EXISTS doc_requirement_rules_entry_org_fk;
ALTER TABLE public.document_requirement_rules
  ADD CONSTRAINT doc_requirement_rules_entry_org_fk
  FOREIGN KEY (catalog_entry_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS doc_requirement_rules_kind_trg ON public.document_requirement_rules;
CREATE TRIGGER doc_requirement_rules_kind_trg
  BEFORE INSERT OR UPDATE OF catalog_entry_id, context_kind, organization_id
  ON public.document_requirement_rules
  FOR EACH ROW
  EXECUTE FUNCTION app.doc_requirement_catalog_kind_check();

--------------------------------------------------------------------------------
-- daily_log party links
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_log_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  daily_log_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_log_vendors_uq
  ON public.daily_log_vendors (daily_log_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_log_vendors_id_org_uq
  ON public.daily_log_vendors (id, organization_id);
CREATE INDEX IF NOT EXISTS daily_log_vendors_log_idx
  ON public.daily_log_vendors (organization_id, daily_log_id);

ALTER TABLE public.daily_log_vendors
  DROP CONSTRAINT IF EXISTS daily_log_vendors_log_org_fk;
ALTER TABLE public.daily_log_vendors
  ADD CONSTRAINT daily_log_vendors_log_org_fk
  FOREIGN KEY (daily_log_id, organization_id)
  REFERENCES public.daily_logs (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.daily_log_vendors
  DROP CONSTRAINT IF EXISTS daily_log_vendors_vendor_org_fk;
ALTER TABLE public.daily_log_vendors
  ADD CONSTRAINT daily_log_vendors_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.daily_log_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  daily_log_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_log_employees_uq
  ON public.daily_log_employees (daily_log_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_log_employees_id_org_uq
  ON public.daily_log_employees (id, organization_id);
CREATE INDEX IF NOT EXISTS daily_log_employees_log_idx
  ON public.daily_log_employees (organization_id, daily_log_id);

ALTER TABLE public.daily_log_employees
  DROP CONSTRAINT IF EXISTS daily_log_employees_log_org_fk;
ALTER TABLE public.daily_log_employees
  ADD CONSTRAINT daily_log_employees_log_org_fk
  FOREIGN KEY (daily_log_id, organization_id)
  REFERENCES public.daily_logs (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.daily_log_employees
  DROP CONSTRAINT IF EXISTS daily_log_employees_employee_org_fk;
ALTER TABLE public.daily_log_employees
  ADD CONSTRAINT daily_log_employees_employee_org_fk
  FOREIGN KEY (employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.daily_log_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  daily_log_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_log_assets_uq
  ON public.daily_log_assets (daily_log_id, asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_log_assets_id_org_uq
  ON public.daily_log_assets (id, organization_id);
CREATE INDEX IF NOT EXISTS daily_log_assets_log_idx
  ON public.daily_log_assets (organization_id, daily_log_id);

ALTER TABLE public.daily_log_assets
  DROP CONSTRAINT IF EXISTS daily_log_assets_log_org_fk;
ALTER TABLE public.daily_log_assets
  ADD CONSTRAINT daily_log_assets_log_org_fk
  FOREIGN KEY (daily_log_id, organization_id)
  REFERENCES public.daily_logs (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.daily_log_assets
  DROP CONSTRAINT IF EXISTS daily_log_assets_asset_org_fk;
ALTER TABLE public.daily_log_assets
  ADD CONSTRAINT daily_log_assets_asset_org_fk
  FOREIGN KEY (asset_id, organization_id)
  REFERENCES public.assets (id, organization_id)
  ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- Approvals 2.0 steps (rule template + immutable request snapshots)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.approval_rule_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  step_order integer NOT NULL,
  name text,
  approver_strategy text NOT NULL,
  role_template_key text,
  permission_key text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_rule_steps_strategy_known CHECK (
    approver_strategy IN ('role_template', 'permission', 'user')
  ),
  CONSTRAINT approval_rule_steps_order_positive CHECK (step_order >= 1),
  CONSTRAINT approval_rule_steps_strategy_complete CHECK (
    (
      approver_strategy = 'role_template'
      AND role_template_key IS NOT NULL
      AND permission_key IS NULL
      AND user_id IS NULL
    )
    OR (
      approver_strategy = 'permission'
      AND permission_key IS NOT NULL
      AND role_template_key IS NULL
      AND user_id IS NULL
    )
    OR (
      approver_strategy = 'user'
      AND user_id IS NOT NULL
      AND role_template_key IS NULL
      AND permission_key IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_rule_steps_id_org_uq
  ON public.approval_rule_steps (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS approval_rule_steps_rule_order_uq
  ON public.approval_rule_steps (rule_id, step_order);
CREATE INDEX IF NOT EXISTS approval_rule_steps_rule_idx
  ON public.approval_rule_steps (organization_id, rule_id);

ALTER TABLE public.approval_rule_steps
  DROP CONSTRAINT IF EXISTS approval_rule_steps_rule_org_fk;
ALTER TABLE public.approval_rule_steps
  ADD CONSTRAINT approval_rule_steps_rule_org_fk
  FOREIGN KEY (rule_id, organization_id)
  REFERENCES public.approval_rules (id, organization_id)
  ON DELETE CASCADE;

-- Same-org membership when strategy = user (memberships unique on user+org).
ALTER TABLE public.approval_rule_steps
  DROP CONSTRAINT IF EXISTS approval_rule_steps_user_org_fk;
ALTER TABLE public.approval_rule_steps
  ADD CONSTRAINT approval_rule_steps_user_org_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_memberships (organization_id, user_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.approval_request_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  step_order integer NOT NULL,
  -- Immutable snapshot of the rule step at submit time (rule edits do not rewrite).
  name text,
  approver_strategy text NOT NULL,
  role_template_key text,
  permission_key text,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  decided_by_user_id uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_request_steps_status_known CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT approval_request_steps_order_positive CHECK (step_order >= 1),
  CONSTRAINT approval_request_steps_strategy_known CHECK (
    approver_strategy IN ('role_template', 'permission', 'user')
  ),
  CONSTRAINT approval_request_steps_strategy_complete CHECK (
    (
      approver_strategy = 'role_template'
      AND role_template_key IS NOT NULL
      AND permission_key IS NULL
      AND user_id IS NULL
    )
    OR (
      approver_strategy = 'permission'
      AND permission_key IS NOT NULL
      AND role_template_key IS NULL
      AND user_id IS NULL
    )
    OR (
      approver_strategy = 'user'
      AND user_id IS NOT NULL
      AND role_template_key IS NULL
      AND permission_key IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_request_steps_id_org_uq
  ON public.approval_request_steps (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS approval_request_steps_req_order_uq
  ON public.approval_request_steps (request_id, step_order);
CREATE INDEX IF NOT EXISTS approval_request_steps_req_idx
  ON public.approval_request_steps (organization_id, request_id);

ALTER TABLE public.approval_request_steps
  DROP CONSTRAINT IF EXISTS approval_request_steps_req_org_fk;
ALTER TABLE public.approval_request_steps
  ADD CONSTRAINT approval_request_steps_req_org_fk
  FOREIGN KEY (request_id, organization_id)
  REFERENCES public.approval_requests (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.approval_request_steps
  DROP CONSTRAINT IF EXISTS approval_request_steps_user_org_fk;
ALTER TABLE public.approval_request_steps
  ADD CONSTRAINT approval_request_steps_user_org_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_memberships (organization_id, user_id)
  ON DELETE RESTRICT;

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS current_step_order integer;
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS total_steps integer;

--------------------------------------------------------------------------------
-- Column adds: clients / vendors / contracts / billing / AP / CRM / budgets /
-- timesheets / subcontracts / PO / cost-code attribution lines
--------------------------------------------------------------------------------

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type_id uuid;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_payment_term_id uuid;

CREATE INDEX IF NOT EXISTS clients_org_type_idx
  ON public.clients (organization_id, client_type_id);

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_client_type_org_fk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_client_type_org_fk
  FOREIGN KEY (client_type_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_payment_term_org_fk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_payment_term_org_fk
  FOREIGN KEY (default_payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS clients_catalog_kind_trg ON public.clients;
CREATE TRIGGER clients_catalog_kind_trg
  BEFORE INSERT OR UPDATE OF client_type_id, default_payment_term_id, organization_id
  ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION app.clients_catalog_kind_check();

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS default_payment_term_id uuid;

CREATE INDEX IF NOT EXISTS vendors_org_payment_term_idx
  ON public.vendors (organization_id, default_payment_term_id);

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_payment_term_org_fk;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_payment_term_org_fk
  FOREIGN KEY (default_payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS vendors_catalog_kind_trg ON public.vendors;
CREATE TRIGGER vendors_catalog_kind_trg
  BEFORE INSERT OR UPDATE OF default_payment_term_id, organization_id
  ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION app.vendors_catalog_kind_check();

ALTER TABLE public.vendor_engagements
  ADD COLUMN IF NOT EXISTS engagement_role_id uuid;

ALTER TABLE public.vendor_engagements
  DROP CONSTRAINT IF EXISTS vendor_engagements_role_org_fk;
ALTER TABLE public.vendor_engagements
  ADD CONSTRAINT vendor_engagements_role_org_fk
  FOREIGN KEY (engagement_role_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS vendor_engagements_catalog_kind_trg ON public.vendor_engagements;
CREATE TRIGGER vendor_engagements_catalog_kind_trg
  BEFORE INSERT OR UPDATE OF engagement_role_id, organization_id
  ON public.vendor_engagements
  FOR EACH ROW
  EXECUTE FUNCTION app.vendor_engagements_catalog_kind_check();

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_payment_term_org_fk;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_payment_term_org_fk
  FOREIGN KEY (payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS contracts_payment_term_kind_trg ON public.contracts;
CREATE TRIGGER contracts_payment_term_kind_trg
  BEFORE INSERT OR UPDATE OF payment_term_id, organization_id
  ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_term_ref_kind_check();

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

ALTER TABLE public.billing_records
  DROP CONSTRAINT IF EXISTS billing_records_payment_term_org_fk;
ALTER TABLE public.billing_records
  ADD CONSTRAINT billing_records_payment_term_org_fk
  FOREIGN KEY (payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS billing_records_payment_term_kind_trg ON public.billing_records;
CREATE TRIGGER billing_records_payment_term_kind_trg
  BEFORE INSERT OR UPDATE OF payment_term_id, organization_id
  ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_term_ref_kind_check();

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

ALTER TABLE public.ap_bills
  DROP CONSTRAINT IF EXISTS ap_bills_payment_term_org_fk;
ALTER TABLE public.ap_bills
  ADD CONSTRAINT ap_bills_payment_term_org_fk
  FOREIGN KEY (payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS ap_bills_payment_term_kind_trg ON public.ap_bills;
CREATE TRIGGER ap_bills_payment_term_kind_trg
  BEFORE INSERT OR UPDATE OF payment_term_id, organization_id
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_term_ref_kind_check();

ALTER TABLE public.subcontract_agreements
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

CREATE INDEX IF NOT EXISTS subcontract_agreements_payment_term_idx
  ON public.subcontract_agreements (organization_id, payment_term_id);

ALTER TABLE public.subcontract_agreements
  DROP CONSTRAINT IF EXISTS subcontract_agreements_payment_term_org_fk;
ALTER TABLE public.subcontract_agreements
  ADD CONSTRAINT subcontract_agreements_payment_term_org_fk
  FOREIGN KEY (payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS subcontract_agreements_payment_term_kind_trg ON public.subcontract_agreements;
CREATE TRIGGER subcontract_agreements_payment_term_kind_trg
  BEFORE INSERT OR UPDATE OF payment_term_id, organization_id
  ON public.subcontract_agreements
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_term_ref_kind_check();

-- Purchase orders: payment term override (Vendor → PO → Commitment → AP Bill).
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

CREATE INDEX IF NOT EXISTS purchase_orders_payment_term_idx
  ON public.purchase_orders (organization_id, payment_term_id);

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_payment_term_org_fk;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_payment_term_org_fk
  FOREIGN KEY (payment_term_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS purchase_orders_payment_term_kind_trg ON public.purchase_orders;
CREATE TRIGGER purchase_orders_payment_term_kind_trg
  BEFORE INSERT OR UPDATE OF payment_term_id, organization_id
  ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION app.payment_term_ref_kind_check();

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS lead_source_id uuid;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_source_org_fk;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_source_org_fk
  FOREIGN KEY (lead_source_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS crm_leads_catalog_kind_trg ON public.crm_leads;
CREATE TRIGGER crm_leads_catalog_kind_trg
  BEFORE INSERT OR UPDATE OF lead_source_id, organization_id
  ON public.crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION app.crm_leads_catalog_kind_check();

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS lost_reason_id uuid;

ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_lost_reason_org_fk;
ALTER TABLE public.crm_opportunities
  ADD CONSTRAINT crm_opportunities_lost_reason_org_fk
  FOREIGN KEY (lost_reason_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS crm_opportunities_catalog_kind_trg ON public.crm_opportunities;
CREATE TRIGGER crm_opportunities_catalog_kind_trg
  BEFORE INSERT OR UPDATE OF lost_reason_id, organization_id
  ON public.crm_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION app.crm_opportunities_catalog_kind_check();

ALTER TABLE public.project_budget_lines
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.project_budget_lines
  DROP CONSTRAINT IF EXISTS project_budget_lines_cost_code_org_fk;
ALTER TABLE public.project_budget_lines
  ADD CONSTRAINT project_budget_lines_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS project_budget_lines_cost_code_kind_trg ON public.project_budget_lines;
CREATE TRIGGER project_budget_lines_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.project_budget_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();

-- Cost code attribution path: Budget / Commitment (PO line) / Actual (expense alloc + AP line).
ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS purchase_order_lines_cost_code_org_fk;
ALTER TABLE public.purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS purchase_order_lines_cost_code_kind_trg ON public.purchase_order_lines;
CREATE TRIGGER purchase_order_lines_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.purchase_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();

ALTER TABLE public.expense_allocations
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.expense_allocations
  DROP CONSTRAINT IF EXISTS expense_allocations_cost_code_org_fk;
ALTER TABLE public.expense_allocations
  ADD CONSTRAINT expense_allocations_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS expense_allocations_cost_code_kind_trg ON public.expense_allocations;
CREATE TRIGGER expense_allocations_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.expense_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS cost_code_id uuid;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_cost_code_org_fk;
ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_cost_code_org_fk
  FOREIGN KEY (cost_code_id, organization_id)
  REFERENCES public.organization_catalog_entries (id, organization_id)
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS ap_bill_lines_cost_code_kind_trg ON public.ap_bill_lines;
CREATE TRIGGER ap_bill_lines_cost_code_kind_trg
  BEFORE INSERT OR UPDATE OF cost_code_id, organization_id
  ON public.ap_bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_code_ref_kind_check();

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

--------------------------------------------------------------------------------
-- Existing-org idempotent universal catalog seed (does not overwrite customizations)
--------------------------------------------------------------------------------

-- Keys/metadata MUST stay aligned with src/modules/business-catalog/domain/types.ts
-- DEFAULT_* constants (application seedUniversalBusinessCatalogs).
INSERT INTO public.organization_catalog_entries (
  organization_id, kind, key, name, metadata, sort_order, is_system, is_active
)
SELECT o.id, v.kind, v.key, v.name, v.metadata::jsonb, v.sort_order, true, true
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('client_type', 'private', 'Private', '{}', 10),
    ('client_type', 'company', 'Company', '{}', 20),
    ('client_type', 'developer', 'Developer', '{}', 30),
    ('client_type', 'main_contractor', 'Main contractor', '{}', 40),
    ('client_type', 'property_manager', 'Property manager', '{}', 50),
    ('client_type', 'municipality', 'Municipality', '{}', 60),
    ('client_type', 'government', 'Government / Public', '{}', 70),
    ('client_type', 'institution', 'Institution', '{}', 80),
    ('client_type', 'building_committee', 'Building committee', '{}', 90),
    ('client_type', 'architect', 'Architect', '{}', 100),
    ('client_type', 'facility_company', 'Facility company', '{}', 110),
    ('client_type', 'other', 'Other', '{}', 120),
    ('payment_term', 'immediate', 'Immediate', '{"strategy":"immediate"}', 10),
    ('payment_term', 'net_7', 'Net 7', '{"strategy":"net_days","netDays":7}', 20),
    ('payment_term', 'net_14', 'Net 14', '{"strategy":"net_days","netDays":14}', 30),
    ('payment_term', 'net_30', 'Net 30', '{"strategy":"net_days","netDays":30}', 40),
    ('payment_term', 'net_45', 'Net 45', '{"strategy":"net_days","netDays":45}', 50),
    ('payment_term', 'net_60', 'Net 60', '{"strategy":"net_days","netDays":60}', 60),
    ('payment_term', 'eom', 'End of month', '{"strategy":"end_of_month"}', 70),
    ('payment_term', 'eom_30', 'EOM + 30', '{"strategy":"eom_plus_days","eomOffsetDays":30}', 80),
    ('payment_term', 'eom_45', 'EOM + 45', '{"strategy":"eom_plus_days","eomOffsetDays":45}', 90),
    ('payment_term', 'eom_60', 'EOM + 60', '{"strategy":"eom_plus_days","eomOffsetDays":60}', 100),
    ('payment_term', 'milestone', 'Milestone-based', '{"strategy":"milestone"}', 110),
    ('payment_term', 'custom', 'Custom', '{"strategy":"custom"}', 120),
    ('lead_source', 'referral', 'Referral', '{}', 10),
    ('lead_source', 'website', 'Website', '{}', 20),
    ('lead_source', 'walk_in', 'Walk-in', '{}', 30),
    ('lead_source', 'tender', 'Tender', '{}', 40),
    ('lead_source', 'repeat', 'Repeat customer', '{}', 50),
    ('lead_source', 'partner', 'Partner', '{}', 60),
    ('lead_source', 'other', 'Other', '{}', 70),
    ('lost_reason', 'price', 'Price', '{}', 10),
    ('lost_reason', 'timing', 'Timing', '{}', 20),
    ('lost_reason', 'competitor', 'Competitor', '{}', 30),
    ('lost_reason', 'scope', 'Scope mismatch', '{}', 40),
    ('lost_reason', 'no_budget', 'No budget', '{}', 50),
    ('lost_reason', 'no_response', 'No response', '{}', 60),
    ('lost_reason', 'other', 'Other', '{}', 70),
    ('engagement_role', 'supplier', 'Supplier', '{}', 10),
    ('engagement_role', 'subcontractor', 'Subcontractor', '{}', 20),
    ('engagement_role', 'consultant', 'Consultant', '{}', 30),
    ('engagement_role', 'installer', 'Installer', '{}', 40),
    ('engagement_role', 'maintenance', 'Maintenance', '{}', 50)
) AS v(kind, key, name, metadata, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_catalog_entries e
  WHERE e.organization_id = o.id
    AND e.kind = v.kind
    AND e.key = v.key
);

-- Organization default payment term = net_30 when unset (setting key only; never overwrite).
INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'default_payment_term_key', '"net_30"'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_settings s
  WHERE s.organization_id = o.id
    AND s.key = 'default_payment_term_key'
);

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls('organization_catalog_entries', 'org.read', 'settings.manage', NULL);
SELECT app.install_org_table_rls('vendor_catalog_links', 'vendors.read', 'vendors.manage', NULL);
SELECT app.install_org_table_rls('document_requirement_rules', 'org.read', 'settings.manage', NULL);
SELECT app.install_org_table_rls('daily_log_vendors', 'field_ops.read', 'field_ops.manage', NULL);
SELECT app.install_org_table_rls('daily_log_employees', 'field_ops.read', 'field_ops.manage', NULL);
SELECT app.install_org_table_rls('daily_log_assets', 'field_ops.read', 'field_ops.manage', NULL);
SELECT app.install_org_table_rls('approval_rule_steps', 'approvals.read', 'approvals.manage', NULL);
SELECT app.install_org_table_rls('approval_request_steps', 'approvals.read', 'approvals.decide', NULL);
