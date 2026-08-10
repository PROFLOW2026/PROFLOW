-- Overnight wave foundations (Lead integrator).
-- Additive only. Does NOT edit 0000–0019.
-- Vendor payments ≠ Actual Cost. OCR/bank/ops/portal candidates never silent-finalize.
-- Hardened with 0018_allocation_run_integrity philosophy: tenant anchors,
-- same-org composite FKs, immutability + allocation guards.

--------------------------------------------------------------------------------
-- Permissions (catalog keys also seeded via drizzle/seed/system.ts)
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('banking.read', 'financials', 'View bank accounts, transactions and match suggestions'),
  ('banking.manage', 'financials', 'Manage bank accounts, imports and match decisions'),
  ('planning.read', 'projects', 'View project planning work items and dependencies'),
  ('planning.write', 'projects', 'Create and update project planning work items and dependencies')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- Tenant identity anchors for composite FKs
-- (expenses / projects already from 0018 — IF NOT EXISTS keeps idempotent)
-- NOTE: external_principals has NO organization_id → do NOT invent an org column;
--       principal_id integrity is APP GUARD only (polymorphic/org-scoped by grant).
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "vendors_id_organization_id_uq"
  ON "vendors" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "documents_id_organization_id_uq"
  ON "documents" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_records_id_organization_id_uq"
  ON "billing_records" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "expenses_id_organization_id_uq"
  ON "expenses" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ap_bills_id_organization_id_uq"
  ON "ap_bills" ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "phases_id_organization_id_project_id_uq"
  ON "phases" ("id", "organization_id", "project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "work_packages_id_organization_id_project_id_uq"
  ON "work_packages" ("id", "organization_id", "project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "external_access_grants_id_organization_id_uq"
  ON "external_access_grants" ("id", "organization_id");

--------------------------------------------------------------------------------
-- Agent 1 — Vendor payments / AP cash (priority)
-- Same-org composite FKs mirror 0018_allocation_run_integrity.sql
--------------------------------------------------------------------------------

CREATE TABLE "ap_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "payment_date" date NOT NULL,
  "method" text,
  "reference" text,
  "notes" text,
  "status" text DEFAULT 'recorded' NOT NULL,
  "voided_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_payments_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "ap_payments_status_known" CHECK ("status" IN ('recorded', 'void')),
  CONSTRAINT "ap_payments_vendor_org_fk"
    FOREIGN KEY ("vendor_id", "organization_id")
    REFERENCES "vendors" ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "ap_payments_id_organization_id_uq"
  ON "ap_payments" ("id", "organization_id");
CREATE INDEX "ap_payments_org_idx" ON "ap_payments" ("organization_id");
CREATE INDEX "ap_payments_vendor_idx" ON "ap_payments" ("vendor_id");
CREATE INDEX "ap_payments_org_date_idx" ON "ap_payments" ("organization_id", "payment_date");

CREATE TABLE "ap_payment_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ap_payment_id" uuid NOT NULL,
  "ap_bill_id" uuid NOT NULL,
  "applied_amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_payment_applications_amount_positive" CHECK ("applied_amount" > 0),
  CONSTRAINT "ap_payment_applications_payment_bill_uq" UNIQUE ("ap_payment_id", "ap_bill_id"),
  CONSTRAINT "ap_payment_applications_payment_org_fk"
    FOREIGN KEY ("ap_payment_id", "organization_id")
    REFERENCES "ap_payments" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "ap_payment_applications_bill_org_fk"
    FOREIGN KEY ("ap_bill_id", "organization_id")
    REFERENCES "ap_bills" ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE INDEX "ap_payment_applications_payment_idx" ON "ap_payment_applications" ("ap_payment_id");
CREATE INDEX "ap_payment_applications_bill_idx" ON "ap_payment_applications" ("ap_bill_id");
CREATE INDEX "ap_payment_applications_org_idx" ON "ap_payment_applications" ("organization_id");

-- payment.vendor_id must match bill.vendor_id; currencies must match across payment/bill/application
CREATE OR REPLACE FUNCTION app.ap_payment_applications_vendor_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_vendor uuid;
  payment_currency char(3);
  bill_vendor uuid;
  bill_currency char(3);
BEGIN
  SELECT vendor_id, currency INTO payment_vendor, payment_currency
  FROM public.ap_payments
  WHERE id = NEW.ap_payment_id;

  SELECT vendor_id, currency INTO bill_vendor, bill_currency
  FROM public.ap_bills
  WHERE id = NEW.ap_bill_id;

  IF payment_vendor IS NULL OR bill_vendor IS NULL THEN
    RAISE EXCEPTION 'ap_payment_applications: payment and bill must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF payment_vendor IS DISTINCT FROM bill_vendor THEN
    RAISE EXCEPTION 'ap_payment_applications: payment vendor must match bill vendor'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.currency IS DISTINCT FROM payment_currency
     OR NEW.currency IS DISTINCT FROM bill_currency
     OR payment_currency IS DISTINCT FROM bill_currency
  THEN
    RAISE EXCEPTION 'ap_payment_applications: payment, bill, and application currency must match'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_payment_applications_vendor_guard ON public.ap_payment_applications;
CREATE TRIGGER ap_payment_applications_vendor_guard
  BEFORE INSERT ON public.ap_payment_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_payment_applications_vendor_guard();

-- Allocation invariants: recorded payment, sum caps, row locks
CREATE OR REPLACE FUNCTION app.ap_payment_applications_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_amount numeric(18, 6);
  payment_status text;
  payment_voided_at timestamptz;
  bill_total numeric(18, 6);
  applied_to_payment numeric(18, 6);
  applied_to_bill numeric(18, 6);
BEGIN
  SELECT amount, status, voided_at
    INTO payment_amount, payment_status, payment_voided_at
  FROM public.ap_payments
  WHERE id = NEW.ap_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_payment_applications: payment must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF payment_status IS DISTINCT FROM 'recorded' OR payment_voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'ap_payment_applications: payment must be recorded and not void'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT total_amount INTO bill_total
  FROM public.ap_bills
  WHERE id = NEW.ap_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_payment_applications: bill must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT COALESCE(SUM(applied_amount), 0) INTO applied_to_payment
  FROM public.ap_payment_applications
  WHERE ap_payment_id = NEW.ap_payment_id
    AND id IS DISTINCT FROM NEW.id;

  IF applied_to_payment + NEW.applied_amount > payment_amount THEN
    RAISE EXCEPTION 'ap_payment_applications: applied sum exceeds payment amount'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(a.applied_amount), 0) INTO applied_to_bill
  FROM public.ap_payment_applications a
  INNER JOIN public.ap_payments p ON p.id = a.ap_payment_id
  WHERE a.ap_bill_id = NEW.ap_bill_id
    AND p.status = 'recorded'
    AND a.id IS DISTINCT FROM NEW.id;

  IF applied_to_bill + NEW.applied_amount > bill_total THEN
    RAISE EXCEPTION 'ap_payment_applications: applied sum exceeds bill total for recorded payments'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_payment_applications_allocation_guard ON public.ap_payment_applications;
CREATE TRIGGER ap_payment_applications_allocation_guard
  BEFORE INSERT ON public.ap_payment_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_payment_applications_allocation_guard();

-- AP payment immutability (like allocation_runs_guard)
CREATE OR REPLACE FUNCTION app.ap_payments_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Allow FK cascade from parent org (depth > 1); block direct deletes.
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'ap_payments: deletes are forbidden'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'void' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ap_payments: void payments are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- recorded: forbid financial / identity rewrites
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ap_payments: financial and identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'recorded' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'ap_payments: only recorded→void status transition is allowed'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- Allowed while recorded: method, reference, notes, updated_at, status→void, voided_at
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_payments_guard ON public.ap_payments;
CREATE TRIGGER ap_payments_guard
  BEFORE UPDATE OR DELETE ON public.ap_payments
  FOR EACH ROW EXECUTE FUNCTION app.ap_payments_guard();

-- Applications are insert-only (correction = void payment + new payment)
CREATE OR REPLACE FUNCTION app.ap_payment_applications_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'ap_payment_applications: deletes are forbidden'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'ap_payment_applications: updates are forbidden'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS ap_payment_applications_immutable_guard ON public.ap_payment_applications;
CREATE TRIGGER ap_payment_applications_immutable_guard
  BEFORE UPDATE OR DELETE ON public.ap_payment_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_payment_applications_immutable_guard();

--------------------------------------------------------------------------------
-- Agent 3 — Banking / reconciliation
--------------------------------------------------------------------------------

CREATE TABLE "bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "currency" char(3) NOT NULL,
  "account_mask" text,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_accounts_status_known" CHECK ("status" IN ('active', 'archived'))
);

CREATE UNIQUE INDEX "bank_accounts_id_organization_id_uq"
  ON "bank_accounts" ("id", "organization_id");
CREATE INDEX "bank_accounts_org_idx" ON "bank_accounts" ("organization_id");
CREATE INDEX "bank_accounts_org_status_idx" ON "bank_accounts" ("organization_id", "status");

CREATE TABLE "bank_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_account_id" uuid NOT NULL,
  "source" text NOT NULL,
  "file_name" text,
  "row_count" integer NOT NULL,
  "imported_count" integer NOT NULL,
  "duplicate_count" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_import_batches_source_known" CHECK ("source" IN ('csv_import', 'xlsx_import')),
  CONSTRAINT "bank_import_batches_account_org_fk"
    FOREIGN KEY ("bank_account_id", "organization_id")
    REFERENCES "bank_accounts" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX "bank_import_batches_id_organization_id_uq"
  ON "bank_import_batches" ("id", "organization_id");
CREATE INDEX "bank_import_batches_org_account_created_idx"
  ON "bank_import_batches" ("organization_id", "bank_account_id", "created_at" DESC);

CREATE TABLE "bank_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_account_id" uuid NOT NULL,
  "date" date NOT NULL,
  "value_date" date,
  "description" text NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "direction" text NOT NULL,
  "reference" text,
  "source" text NOT NULL,
  "fingerprint" text NOT NULL,
  "match_status" text NOT NULL,
  -- Nullable composite FK: MATCH SIMPLE skips check when import_batch_id IS NULL
  "import_batch_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_transactions_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "bank_transactions_direction_known" CHECK ("direction" IN ('credit', 'debit')),
  CONSTRAINT "bank_transactions_source_known" CHECK ("source" IN ('csv_import', 'xlsx_import', 'live_feed')),
  CONSTRAINT "bank_transactions_match_status_known" CHECK (
    "match_status" IN ('unmatched', 'partially_matched', 'matched', 'ignored')
  ),
  CONSTRAINT "bank_transactions_fingerprint_uq" UNIQUE ("organization_id", "bank_account_id", "fingerprint"),
  CONSTRAINT "bank_transactions_account_org_fk"
    FOREIGN KEY ("bank_account_id", "organization_id")
    REFERENCES "bank_accounts" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "bank_transactions_import_batch_org_fk"
    FOREIGN KEY ("import_batch_id", "organization_id")
    REFERENCES "bank_import_batches" ("id", "organization_id")
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX "bank_transactions_id_organization_id_uq"
  ON "bank_transactions" ("id", "organization_id");
CREATE INDEX "bank_transactions_org_account_match_idx"
  ON "bank_transactions" ("organization_id", "bank_account_id", "match_status");
CREATE INDEX "bank_transactions_org_date_idx"
  ON "bank_transactions" ("organization_id", "date" DESC);

CREATE TABLE "bank_match_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_transaction_id" uuid NOT NULL,
  "target_kind" text NOT NULL,
  -- INTENTIONALLY POLYMORPHIC: target_id is not FK'd (customer_payment|billing_record|vendor_payment|vendor_bill)
  "target_id" uuid NOT NULL,
  "suggested_amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "score" integer NOT NULL,
  "rationale" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_match_suggestions_target_kind_known" CHECK (
    "target_kind" IN ('customer_payment', 'billing_record', 'vendor_payment', 'vendor_bill')
  ),
  CONSTRAINT "bank_match_suggestions_score_range" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "bank_match_suggestions_tx_org_fk"
    FOREIGN KEY ("bank_transaction_id", "organization_id")
    REFERENCES "bank_transactions" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE INDEX "bank_match_suggestions_tx_score_idx"
  ON "bank_match_suggestions" ("bank_transaction_id", "score" DESC);

CREATE TABLE "bank_match_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_transaction_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "target_kind" text,
  -- INTENTIONALLY POLYMORPHIC: target_id is not FK'd (resolved by target_kind in app)
  "target_id" uuid,
  "applied_amount" numeric(18, 6),
  "currency" char(3),
  "notes" text,
  "mutates_financials" boolean DEFAULT false NOT NULL,
  "creates_project_cost" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_match_decisions_decision_known" CHECK ("decision" IN ('approve', 'change', 'ignore')),
  CONSTRAINT "bank_match_decisions_no_financial_mutation" CHECK ("mutates_financials" = false),
  CONSTRAINT "bank_match_decisions_no_project_cost" CHECK ("creates_project_cost" = false),
  CONSTRAINT "bank_match_decisions_target_shape" CHECK (
    ("decision" = 'ignore' AND "target_id" IS NULL)
    OR (
      "decision" IN ('approve', 'change')
      AND "target_kind" IS NOT NULL
      AND "target_id" IS NOT NULL
    )
  ),
  CONSTRAINT "bank_match_decisions_tx_org_fk"
    FOREIGN KEY ("bank_transaction_id", "organization_id")
    REFERENCES "bank_transactions" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE INDEX "bank_match_decisions_tx_idx" ON "bank_match_decisions" ("bank_transaction_id");

--------------------------------------------------------------------------------
-- Agent 4 — External statutory invoicing integration
--------------------------------------------------------------------------------

CREATE TABLE "external_statutory_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "billing_record_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "external_id" text,
  "external_number" text,
  "external_url" text,
  "pdf_content_type" text,
  "pdf_byte_size" integer,
  "pdf_checksum_sha256" text,
  -- Nullable composite FK: MATCH SIMPLE when pdf_storage_document_id IS NULL
  "pdf_storage_document_id" uuid,
  "pdf_file_name" text,
  "allocation_reference" text,
  "last_error_code" text,
  "last_error_message" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issued_at" timestamp with time zone,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  CONSTRAINT "external_statutory_documents_provider_not_local" CHECK (
    "provider_id" NOT IN ('local', 'projectflow-local')
  ),
  CONSTRAINT "external_statutory_documents_kind_known" CHECK (
    "kind" IN ('tax_invoice', 'credit_note', 'receipt', 'proforma', 'other')
  ),
  CONSTRAINT "external_statutory_documents_status_known" CHECK (
    "status" IN ('requested', 'pending', 'issued', 'allocated', 'credited', 'cancelled', 'failed')
  ),
  CONSTRAINT "external_statutory_documents_billing_org_fk"
    FOREIGN KEY ("billing_record_id", "organization_id")
    REFERENCES "billing_records" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "external_statutory_documents_pdf_doc_org_fk"
    FOREIGN KEY ("pdf_storage_document_id", "organization_id")
    REFERENCES "documents" ("id", "organization_id")
    ON DELETE SET NULL
);

CREATE INDEX "idx_ext_stat_docs_org_billing"
  ON "external_statutory_documents" ("organization_id", "billing_record_id");
CREATE UNIQUE INDEX "idx_ext_stat_docs_org_external"
  ON "external_statutory_documents" ("organization_id", "provider_id", "external_id")
  WHERE "external_id" IS NOT NULL;
CREATE INDEX "idx_ext_stat_docs_org_status"
  ON "external_statutory_documents" ("organization_id", "status");

CREATE TABLE "external_invoicing_provider_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider_id" text NOT NULL,
  "status" text NOT NULL,
  "credentials_ref" text,
  "capabilities_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "connected_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_invoicing_provider_connections_org_uq" UNIQUE ("organization_id"),
  CONSTRAINT "external_invoicing_provider_connections_provider_not_local" CHECK (
    "provider_id" NOT IN ('local', 'projectflow-local')
  ),
  CONSTRAINT "external_invoicing_provider_connections_status_known" CHECK (
    "status" IN ('disconnected', 'connected', 'error')
  )
);

--------------------------------------------------------------------------------
-- Agent 5 — Portal durable candidates + explicit share markers
-- Public login / external_portal_sessions deferred (DISABLED by design)
-- principal_id → APP GUARD only (external_principals has no organization_id) — INTENTIONALLY
--------------------------------------------------------------------------------

CREATE TABLE "vendor_portal_ap_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL,
  "grant_id" uuid NOT NULL,
  -- APP GUARD REQUIRED: principal must belong to grant; no org column on external_principals
  "principal_id" uuid NOT NULL REFERENCES "external_principals"("id") ON DELETE CASCADE,
  "reference" text,
  "currency" char(3) NOT NULL,
  "total_amount" numeric(18, 6) NOT NULL,
  "bill_date" date,
  "notes" text,
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'candidate' NOT NULL,
  "mutates_financial_truth" boolean DEFAULT false NOT NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_portal_ap_candidates_status_known" CHECK (
    "status" IN ('candidate', 'accepted_for_review', 'rejected')
  ),
  CONSTRAINT "vendor_portal_ap_candidates_no_financial_mutation" CHECK (
    "mutates_financial_truth" = false
  ),
  CONSTRAINT "vendor_portal_ap_candidates_vendor_org_fk"
    FOREIGN KEY ("vendor_id", "organization_id")
    REFERENCES "vendors" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "vendor_portal_ap_candidates_grant_org_fk"
    FOREIGN KEY ("grant_id", "organization_id")
    REFERENCES "external_access_grants" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE INDEX "vendor_portal_ap_candidates_org_idx"
  ON "vendor_portal_ap_candidates" ("organization_id");
CREATE INDEX "vendor_portal_ap_candidates_org_vendor_idx"
  ON "vendor_portal_ap_candidates" ("organization_id", "vendor_id");
CREATE INDEX "vendor_portal_ap_candidates_grant_idx"
  ON "vendor_portal_ap_candidates" ("grant_id");

CREATE TABLE "vendor_portal_compliance_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL,
  "grant_id" uuid NOT NULL,
  -- APP GUARD REQUIRED: principal must belong to grant; no org column on external_principals
  "principal_id" uuid NOT NULL REFERENCES "external_principals"("id") ON DELETE CASCADE,
  "artifact_kind" text NOT NULL,
  "name" text NOT NULL,
  "reference_number" text,
  "expires_on" date,
  "notes" text,
  "status" text DEFAULT 'candidate' NOT NULL,
  "mutates_financial_truth" boolean DEFAULT false NOT NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_portal_compliance_candidates_artifact_kind_known" CHECK (
    "artifact_kind" IN ('insurance', 'license', 'certification', 'other')
  ),
  CONSTRAINT "vendor_portal_compliance_candidates_status_known" CHECK (
    "status" IN ('candidate', 'accepted_for_review', 'rejected')
  ),
  CONSTRAINT "vendor_portal_compliance_candidates_no_financial_mutation" CHECK (
    "mutates_financial_truth" = false
  ),
  CONSTRAINT "vendor_portal_compliance_candidates_vendor_org_fk"
    FOREIGN KEY ("vendor_id", "organization_id")
    REFERENCES "vendors" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "vendor_portal_compliance_candidates_grant_org_fk"
    FOREIGN KEY ("grant_id", "organization_id")
    REFERENCES "external_access_grants" ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE INDEX "vendor_portal_compliance_candidates_org_vendor_idx"
  ON "vendor_portal_compliance_candidates" ("organization_id", "vendor_id");

ALTER TABLE "document_links"
  ADD COLUMN IF NOT EXISTS "portal_visible" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "document_links_portal_visible_idx"
  ON "document_links" ("organization_id", "owner_type", "owner_id")
  WHERE "portal_visible" = true;

ALTER TABLE "project_milestones"
  ADD COLUMN IF NOT EXISTS "portal_visible" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "external_access_grants_org_status_idx"
  ON "external_access_grants" ("organization_id", "status");

--------------------------------------------------------------------------------
-- Agent 6 — Planning / Gantt foundations (projects; jobs opt-out in app)
--------------------------------------------------------------------------------

CREATE TABLE "planning_work_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "start_date" date,
  "target_end_date" date,
  "actual_end_date" date,
  "progress_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
  -- Nullable composite FKs: MATCH SIMPLE when phase_id / work_package_id IS NULL
  "phase_id" uuid,
  "work_package_id" uuid,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "planning_work_items_kind_known" CHECK ("kind" IN ('task', 'milestone')),
  CONSTRAINT "planning_work_items_progress_range" CHECK (
    "progress_percent" >= 0 AND "progress_percent" <= 100
  ),
  CONSTRAINT "planning_work_items_date_order" CHECK (
    "start_date" IS NULL
    OR "target_end_date" IS NULL
    OR "target_end_date" >= "start_date"
  ),
  CONSTRAINT "planning_work_items_project_org_fk"
    FOREIGN KEY ("project_id", "organization_id")
    REFERENCES "projects" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "planning_work_items_phase_org_project_fk"
    FOREIGN KEY ("phase_id", "organization_id", "project_id")
    REFERENCES "phases" ("id", "organization_id", "project_id")
    ON DELETE SET NULL,
  CONSTRAINT "planning_work_items_work_package_org_project_fk"
    FOREIGN KEY ("work_package_id", "organization_id", "project_id")
    REFERENCES "work_packages" ("id", "organization_id", "project_id")
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX "planning_work_items_id_org_project_uq"
  ON "planning_work_items" ("id", "organization_id", "project_id");
CREATE INDEX "planning_work_items_org_project_active_idx"
  ON "planning_work_items" ("organization_id", "project_id")
  WHERE "archived_at" IS NULL;
CREATE INDEX "planning_work_items_org_project_wp_idx"
  ON "planning_work_items" ("organization_id", "project_id", "work_package_id");
CREATE INDEX "planning_work_items_org_project_phase_idx"
  ON "planning_work_items" ("organization_id", "project_id", "phase_id");

CREATE TABLE "planning_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL,
  "predecessor_id" uuid NOT NULL,
  "successor_id" uuid NOT NULL,
  "type" text DEFAULT 'finish_to_start' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "planning_dependencies_type_known" CHECK ("type" IN ('finish_to_start')),
  CONSTRAINT "planning_dependencies_not_self" CHECK ("predecessor_id" <> "successor_id"),
  CONSTRAINT "planning_dependencies_edge_uq" UNIQUE ("project_id", "predecessor_id", "successor_id"),
  CONSTRAINT "planning_dependencies_project_org_fk"
    FOREIGN KEY ("project_id", "organization_id")
    REFERENCES "projects" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "planning_dependencies_predecessor_org_project_fk"
    FOREIGN KEY ("predecessor_id", "organization_id", "project_id")
    REFERENCES "planning_work_items" ("id", "organization_id", "project_id")
    ON DELETE CASCADE,
  CONSTRAINT "planning_dependencies_successor_org_project_fk"
    FOREIGN KEY ("successor_id", "organization_id", "project_id")
    REFERENCES "planning_work_items" ("id", "organization_id", "project_id")
    ON DELETE CASCADE
);

CREATE INDEX "planning_dependencies_org_project_idx"
  ON "planning_dependencies" ("organization_id", "project_id");
CREATE INDEX "planning_dependencies_predecessor_idx"
  ON "planning_dependencies" ("predecessor_id");
CREATE INDEX "planning_dependencies_successor_idx"
  ON "planning_dependencies" ("successor_id");

--------------------------------------------------------------------------------
-- Agent 7 — Ops → Finance expense links
-- ops_record_id is INTENTIONALLY POLYMORPHIC (ops_record_kind) — APP GUARD
--------------------------------------------------------------------------------

CREATE TABLE "ops_expense_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ops_record_kind" text NOT NULL,
  -- INTENTIONALLY POLYMORPHIC: resolved by ops_record_kind in application layer
  "ops_record_id" uuid NOT NULL,
  "expense_id" uuid NOT NULL,
  "link_purpose" text DEFAULT 'expense_draft' NOT NULL,
  "created_by_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "ops_expense_links_kind_known" CHECK (
    "ops_record_kind" IN (
      'maintenance_record',
      'compliance_artifact',
      'fleet_vehicle',
      'recurring_business_cost'
    )
  ),
  CONSTRAINT "ops_expense_links_purpose_known" CHECK (
    "link_purpose" IN ('expense_draft', 'overhead_allocation')
  ),
  CONSTRAINT "ops_expense_links_expense_org_fk"
    FOREIGN KEY ("expense_id", "organization_id")
    REFERENCES "expenses" ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "ops_expense_links_active_ops_uq"
  ON "ops_expense_links" ("organization_id", "ops_record_kind", "ops_record_id")
  WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "ops_expense_links_active_expense_uq"
  ON "ops_expense_links" ("organization_id", "expense_id")
  WHERE "archived_at" IS NULL;
CREATE INDEX "ops_expense_links_org_expense_idx"
  ON "ops_expense_links" ("organization_id", "expense_id");
CREATE INDEX "ops_expense_links_org_ops_idx"
  ON "ops_expense_links" ("organization_id", "ops_record_kind", "ops_record_id");

--------------------------------------------------------------------------------
-- Agent 2 — OCR extraction jobs (feature gated OFF by default in app)
--------------------------------------------------------------------------------

CREATE TABLE "ocr_extraction_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- Nullable composite FKs: MATCH SIMPLE when left-side id IS NULL
  "document_id" uuid,
  "source_filename" text,
  "source_mime_type" text,
  "status" text NOT NULL,
  "review_status" text NOT NULL,
  "provider_id" text NOT NULL,
  "overall_confidence" numeric(9, 6),
  "error_code" text,
  "error_message" text,
  "extracted_candidates" jsonb,
  "review_overrides" jsonb,
  "accepted_fields" jsonb,
  "rejected_fields" jsonb,
  "raw_metadata" jsonb,
  "confirmed_expense_id" uuid,
  "confirmed_vendor_bill_id" uuid,
  "confirmed_draft_target" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ocr_extraction_jobs_status_known" CHECK (
    "status" IN ('queued', 'running', 'succeeded', 'failed', 'needs_review', 'rejected')
  ),
  CONSTRAINT "ocr_extraction_jobs_review_status_known" CHECK (
    "review_status" IN ('awaiting_review', 'accepted', 'rejected')
  ),
  CONSTRAINT "ocr_extraction_jobs_draft_target_known" CHECK (
    "confirmed_draft_target" IS NULL
    OR "confirmed_draft_target" IN ('expense', 'vendor_bill')
  ),
  CONSTRAINT "ocr_extraction_jobs_confirmed_target_shape" CHECK (
    (
      "confirmed_draft_target" IS NULL
      AND "confirmed_expense_id" IS NULL
      AND "confirmed_vendor_bill_id" IS NULL
    )
    OR (
      "confirmed_draft_target" = 'expense'
      AND "confirmed_vendor_bill_id" IS NULL
    )
    OR (
      "confirmed_draft_target" = 'vendor_bill'
      AND "confirmed_expense_id" IS NULL
    )
  ),
  CONSTRAINT "ocr_extraction_jobs_confidence_range" CHECK (
    "overall_confidence" IS NULL
    OR ("overall_confidence" >= 0 AND "overall_confidence" <= 1)
  ),
  CONSTRAINT "ocr_extraction_jobs_document_org_fk"
    FOREIGN KEY ("document_id", "organization_id")
    REFERENCES "documents" ("id", "organization_id")
    ON DELETE SET NULL,
  CONSTRAINT "ocr_extraction_jobs_expense_org_fk"
    FOREIGN KEY ("confirmed_expense_id", "organization_id")
    REFERENCES "expenses" ("id", "organization_id")
    ON DELETE SET NULL,
  CONSTRAINT "ocr_extraction_jobs_vendor_bill_org_fk"
    FOREIGN KEY ("confirmed_vendor_bill_id", "organization_id")
    REFERENCES "ap_bills" ("id", "organization_id")
    ON DELETE SET NULL
);

CREATE INDEX "ocr_extraction_jobs_org_status_updated_idx"
  ON "ocr_extraction_jobs" ("organization_id", "status", "updated_at" DESC);
CREATE INDEX "ocr_extraction_jobs_org_review_idx"
  ON "ocr_extraction_jobs" ("organization_id", "review_status");
CREATE INDEX "ocr_extraction_jobs_org_document_idx"
  ON "ocr_extraction_jobs" ("organization_id", "document_id")
  WHERE "document_id" IS NOT NULL;

--------------------------------------------------------------------------------
-- RLS (org membership; app still filters organization_id)
--------------------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'ap_payments',
    'ap_payment_applications',
    'bank_accounts',
    'bank_import_batches',
    'bank_transactions',
    'bank_match_suggestions',
    'bank_match_decisions',
    'external_statutory_documents',
    'external_invoicing_provider_connections',
    'vendor_portal_ap_candidates',
    'vendor_portal_compliance_candidates',
    'planning_work_items',
    'planning_dependencies',
    'ops_expense_links',
    'ocr_extraction_jobs'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_select', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_update', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_tenant_delete', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tenant_table || '_service_all', tenant_table);

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
