-- 0166: Developer / GC layer - Track P: contractor compliance, contractor site safety, critical deliveries.
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 (project capabilities) and
-- 0155 (external scope helpers, project_locations, domain_events). Additive; existing tables only gain
-- extra (permissive) policies, one unique-free consistency trigger and nothing is renamed or dropped.
--
-- PURPOSE
--   1. contractor_compliance_requirements  - requirement set per subcontract agreement (insurance,
--      guarantee, tax / bookkeeping certificates, safety certification, license, custom)
--   2. contractor_compliance_documents     - submissions (contractor or internal) with a one-time
--      internal review; core columns immutable, never deleted
--   3. contractor_compliance_reminders     - dedupe ledger for expiring / expired reminder events
--   4. safety_record_contractor_links      - 1:1 contractor linkage of EXISTING safety_records
--      (vendor, agreement, location, due date, reporter actor, closure verification)
--   5. safety_action_task_links            - EXISTING safety_corrective_actions -> follow-up task
--   6. delivery_items + delivery_item_reports - critical material / equipment delivery tracking
--   7. Capability / external policies on safety_records + safety_corrective_actions (additive OR)
--
-- NO MONEY COLUMNS anywhere in this migration (guarantee amounts stay in contracts / claims).

--------------------------------------------------------------------------------
-- 1. contractor_compliance_requirements
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  blocks_payment boolean NOT NULL DEFAULT true,
  requires_expiry boolean NOT NULL DEFAULT true,
  warning_days integer NOT NULL DEFAULT 30,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_compliance_requirements_kind_known CHECK (kind IN (
    'insurance', 'guarantee', 'tax_certificate', 'bookkeeping_certificate',
    'safety_certification', 'license', 'custom')),
  CONSTRAINT contractor_compliance_requirements_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT contractor_compliance_requirements_warning_range CHECK (warning_days BETWEEN 0 AND 365),
  CONSTRAINT contractor_compliance_requirements_optional_never_blocks CHECK (is_required OR NOT blocks_payment),
  CONSTRAINT contractor_compliance_requirements_agreement_project_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
    REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE,
  CONSTRAINT contractor_compliance_requirements_agreement_vendor_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_compliance_requirements_id_org_uq
  ON public.contractor_compliance_requirements (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_compliance_requirements_scope_uq
  ON public.contractor_compliance_requirements (id, organization_id, project_id, vendor_id, subcontract_agreement_id);
CREATE INDEX IF NOT EXISTS contractor_compliance_requirements_agreement_idx
  ON public.contractor_compliance_requirements (organization_id, subcontract_agreement_id, sort_order)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS contractor_compliance_requirements_project_idx
  ON public.contractor_compliance_requirements (organization_id, project_id)
  WHERE archived_at IS NULL;

--------------------------------------------------------------------------------
-- 2. contractor_compliance_documents (submissions + one-time review)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  requirement_id uuid NOT NULL,
  reference_number text,
  issuer text,
  issued_on date,
  expires_on date,
  notes text,
  document_id uuid,
  -- Soft reference to an existing org-level compliance_artifacts row reused as evidence.
  compliance_artifact_id uuid,
  submitted_actor_type text NOT NULL DEFAULT 'internal',
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT contractor_compliance_documents_review_known
    CHECK (review_status IN ('pending_review', 'approved', 'rejected')),
  CONSTRAINT contractor_compliance_documents_review_shape CHECK (
    (review_status = 'pending_review' AND reviewed_at IS NULL)
    OR (review_status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL)),
  CONSTRAINT contractor_compliance_documents_rejection_reason
    CHECK (review_status <> 'rejected' OR length(btrim(coalesce(review_note, ''))) > 0),
  CONSTRAINT contractor_compliance_documents_dates CHECK (
    issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on),
  CONSTRAINT contractor_compliance_documents_actor_shape CHECK (
    (submitted_actor_type = 'internal' AND submitted_by_principal_id IS NULL)
    OR (submitted_actor_type = 'external' AND submitted_by_principal_id IS NOT NULL AND submitted_by_user_id IS NULL)
    OR (submitted_actor_type = 'system' AND submitted_by_user_id IS NULL AND submitted_by_principal_id IS NULL)),
  CONSTRAINT contractor_compliance_documents_requirement_fk
    FOREIGN KEY (requirement_id, organization_id, project_id, vendor_id, subcontract_agreement_id)
    REFERENCES public.contractor_compliance_requirements (id, organization_id, project_id, vendor_id, subcontract_agreement_id)
    ON DELETE CASCADE,
  CONSTRAINT contractor_compliance_documents_document_fk
    FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents (id, organization_id) ON DELETE SET NULL (document_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_compliance_documents_id_org_uq
  ON public.contractor_compliance_documents (id, organization_id);
CREATE INDEX IF NOT EXISTS contractor_compliance_documents_requirement_idx
  ON public.contractor_compliance_documents (organization_id, requirement_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS contractor_compliance_documents_agreement_idx
  ON public.contractor_compliance_documents (organization_id, subcontract_agreement_id);
CREATE INDEX IF NOT EXISTS contractor_compliance_documents_pending_idx
  ON public.contractor_compliance_documents (organization_id, project_id)
  WHERE review_status = 'pending_review';
CREATE INDEX IF NOT EXISTS contractor_compliance_documents_expiry_idx
  ON public.contractor_compliance_documents (expires_on)
  WHERE review_status = 'approved' AND expires_on IS NOT NULL;

-- Submissions are facts: only the review columns may change, once, from pending_review.
CREATE OR REPLACE FUNCTION app.contractor_compliance_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contractor_compliance_documents are append-only' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.vendor_id, NEW.subcontract_agreement_id,
      NEW.requirement_id, NEW.reference_number, NEW.issuer, NEW.issued_on, NEW.expires_on, NEW.notes,
      NEW.compliance_artifact_id, NEW.submitted_actor_type, NEW.submitted_by_principal_id, NEW.submitted_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.vendor_id, OLD.subcontract_agreement_id,
      OLD.requirement_id, OLD.reference_number, OLD.issuer, OLD.issued_on, OLD.expires_on, OLD.notes,
      OLD.compliance_artifact_id, OLD.submitted_actor_type, OLD.submitted_by_principal_id, OLD.submitted_at) THEN
    RAISE EXCEPTION 'compliance submissions are immutable (submit a new document instead)' USING ERRCODE = '42501';
  END IF;
  IF OLD.review_status <> 'pending_review'
     AND (NEW.review_status, NEW.reviewed_at, NEW.review_note)
         IS DISTINCT FROM (OLD.review_status, OLD.reviewed_at, OLD.review_note) THEN
    RAISE EXCEPTION 'compliance review decisions are final' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS contractor_compliance_documents_guard ON public.contractor_compliance_documents;
CREATE TRIGGER contractor_compliance_documents_guard
  BEFORE UPDATE OR DELETE ON public.contractor_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION app.contractor_compliance_documents_guard();

--------------------------------------------------------------------------------
-- 3. contractor_compliance_reminders (scan dedupe ledger; written by the system scan only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_compliance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  requirement_id uuid NOT NULL,
  document_id uuid NOT NULL,
  reminder_kind text NOT NULL,
  for_expiry date NOT NULL,
  emitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_compliance_reminders_kind_known CHECK (reminder_kind IN ('expiring', 'expired')),
  CONSTRAINT contractor_compliance_reminders_document_fk
    FOREIGN KEY (document_id, organization_id)
    REFERENCES public.contractor_compliance_documents (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT contractor_compliance_reminders_requirement_fk
    FOREIGN KEY (requirement_id, organization_id)
    REFERENCES public.contractor_compliance_requirements (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_compliance_reminders_dedupe_uq
  ON public.contractor_compliance_reminders (organization_id, document_id, reminder_kind, for_expiry);

--------------------------------------------------------------------------------
-- 4. safety_record_contractor_links (contractor linkage of existing safety_records)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_record_contractor_links (
  safety_record_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  location_id uuid,
  due_date date,
  contractor_visible boolean NOT NULL DEFAULT true,
  reported_actor_type text NOT NULL DEFAULT 'internal',
  reported_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reported_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  closure_verified_at timestamptz,
  closure_verified_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  closure_verification_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_record_contractor_links_actor_shape CHECK (
    (reported_actor_type = 'internal' AND reported_by_principal_id IS NULL)
    OR (reported_actor_type = 'external' AND reported_by_principal_id IS NOT NULL AND reported_by_user_id IS NULL)
    OR (reported_actor_type = 'system' AND reported_by_user_id IS NULL AND reported_by_principal_id IS NULL)),
  CONSTRAINT safety_record_contractor_links_verification_shape CHECK (
    (closure_verified_at IS NULL AND closure_verification_note IS NULL)
    OR (closure_verified_at IS NOT NULL AND length(btrim(coalesce(closure_verification_note, ''))) > 0)),
  CONSTRAINT safety_record_contractor_links_record_fk
    FOREIGN KEY (safety_record_id, organization_id)
    REFERENCES public.safety_records (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT safety_record_contractor_links_project_fk
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT safety_record_contractor_links_vendor_fk
    FOREIGN KEY (vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT safety_record_contractor_links_agreement_vendor_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE SET NULL (subcontract_agreement_id),
  CONSTRAINT safety_record_contractor_links_agreement_project_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
    REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE SET NULL (subcontract_agreement_id),
  CONSTRAINT safety_record_contractor_links_location_fk
    FOREIGN KEY (location_id, organization_id, project_id)
    REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id)
);

CREATE INDEX IF NOT EXISTS safety_record_contractor_links_project_idx
  ON public.safety_record_contractor_links (organization_id, project_id, vendor_id);
CREATE INDEX IF NOT EXISTS safety_record_contractor_links_vendor_idx
  ON public.safety_record_contractor_links (organization_id, vendor_id);

-- The link must point at a safety record of the same project (the base row is RLS-hidden from
-- external principals, so the check runs as definer).
CREATE OR REPLACE FUNCTION app.safety_record_contractor_links_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  SELECT s.project_id INTO v_project
  FROM public.safety_records s
  WHERE s.id = NEW.safety_record_id AND s.organization_id = NEW.organization_id;
  IF v_project IS NULL OR v_project <> NEW.project_id THEN
    RAISE EXCEPTION 'safety record project mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.safety_record_id, NEW.organization_id, NEW.project_id,
      NEW.reported_actor_type, NEW.reported_by_principal_id)
      IS DISTINCT FROM (OLD.safety_record_id, OLD.organization_id, OLD.project_id,
      OLD.reported_actor_type, OLD.reported_by_principal_id) THEN
    RAISE EXCEPTION 'safety record contractor link identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS safety_record_contractor_links_consistency ON public.safety_record_contractor_links;
CREATE TRIGGER safety_record_contractor_links_consistency
  BEFORE INSERT OR UPDATE ON public.safety_record_contractor_links
  FOR EACH ROW EXECUTE FUNCTION app.safety_record_contractor_links_consistency();

-- A contractor-linked safety record cannot silently move to another project.
CREATE OR REPLACE FUNCTION app.safety_records_contractor_project_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.safety_record_contractor_links l
    WHERE l.safety_record_id = OLD.id AND l.organization_id = OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'contractor-linked safety record cannot change project' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS safety_records_contractor_project_lock ON public.safety_records;
CREATE TRIGGER safety_records_contractor_project_lock
  BEFORE UPDATE OF project_id ON public.safety_records
  FOR EACH ROW EXECUTE FUNCTION app.safety_records_contractor_project_lock();

--------------------------------------------------------------------------------
-- 5. safety_action_task_links (existing corrective action -> follow-up task)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_action_task_links (
  corrective_action_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  safety_record_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_action_task_links_action_fk
    FOREIGN KEY (corrective_action_id, organization_id)
    REFERENCES public.safety_corrective_actions (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT safety_action_task_links_record_fk
    FOREIGN KEY (safety_record_id, organization_id)
    REFERENCES public.safety_records (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS safety_action_task_links_record_idx
  ON public.safety_action_task_links (organization_id, safety_record_id);

--------------------------------------------------------------------------------
-- 6. delivery_items + delivery_item_reports
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  item_name text NOT NULL,
  description text,
  item_kind text NOT NULL DEFAULT 'material',
  is_critical boolean NOT NULL DEFAULT true,
  supplier_vendor_id uuid,
  supplier_name text,
  quantity numeric(18, 6),
  unit text,
  order_date date,
  original_expected_date date,
  expected_date date,
  actual_date date,
  state text NOT NULL DEFAULT 'planned',
  location_id uuid,
  work_package_id uuid,
  purchase_order_id uuid,
  notes text,
  contractor_visible boolean NOT NULL DEFAULT true,
  delay_notified_for date,
  created_actor_type text NOT NULL DEFAULT 'internal',
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_items_kind_known CHECK (item_kind IN ('material', 'equipment')),
  CONSTRAINT delivery_items_state_known CHECK (state IN (
    'planned', 'ordered', 'in_transit', 'partially_delivered', 'delivered', 'rejected', 'cancelled')),
  CONSTRAINT delivery_items_name_not_blank CHECK (length(btrim(item_name)) > 0),
  CONSTRAINT delivery_items_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT delivery_items_actual_when_delivered CHECK (
    state NOT IN ('delivered', 'partially_delivered') OR actual_date IS NOT NULL),
  CONSTRAINT delivery_items_agreement_needs_vendor CHECK (subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL),
  CONSTRAINT delivery_items_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_principal_id IS NOT NULL AND created_by_user_id IS NULL)
    OR (created_actor_type = 'system' AND created_by_user_id IS NULL AND created_by_principal_id IS NULL)),
  CONSTRAINT delivery_items_project_fk
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT delivery_items_vendor_fk
    FOREIGN KEY (vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id) ON DELETE SET NULL (vendor_id),
  CONSTRAINT delivery_items_supplier_fk
    FOREIGN KEY (supplier_vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id) ON DELETE SET NULL (supplier_vendor_id),
  CONSTRAINT delivery_items_agreement_vendor_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE SET NULL (subcontract_agreement_id),
  CONSTRAINT delivery_items_agreement_project_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
    REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE SET NULL (subcontract_agreement_id),
  CONSTRAINT delivery_items_location_fk
    FOREIGN KEY (location_id, organization_id, project_id)
    REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id),
  CONSTRAINT delivery_items_work_package_fk
    FOREIGN KEY (work_package_id, organization_id, project_id)
    REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL (work_package_id),
  CONSTRAINT delivery_items_purchase_order_fk
    FOREIGN KEY (purchase_order_id, organization_id)
    REFERENCES public.purchase_orders (id, organization_id) ON DELETE SET NULL (purchase_order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_items_id_org_uq
  ON public.delivery_items (id, organization_id);
CREATE INDEX IF NOT EXISTS delivery_items_project_idx
  ON public.delivery_items (organization_id, project_id, expected_date)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS delivery_items_vendor_idx
  ON public.delivery_items (organization_id, vendor_id)
  WHERE vendor_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS delivery_items_open_expected_idx
  ON public.delivery_items (expected_date)
  WHERE archived_at IS NULL AND state IN ('planned', 'ordered', 'in_transit', 'partially_delivered');

-- External principals (contractor portal) may only move the delivery state / dates of their own items.
-- Not SECURITY DEFINER on purpose: current_user must be the caller's role.
CREATE OR REPLACE FUNCTION app.delivery_items_external_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user = 'authenticated' AND app.external_principal_id() IS NOT NULL
     AND NOT app.is_org_member(OLD.organization_id) THEN
    IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.vendor_id, NEW.subcontract_agreement_id,
        NEW.item_name, NEW.description, NEW.item_kind, NEW.is_critical, NEW.supplier_vendor_id,
        NEW.supplier_name, NEW.quantity, NEW.unit, NEW.order_date, NEW.original_expected_date,
        NEW.location_id, NEW.work_package_id, NEW.purchase_order_id, NEW.notes, NEW.contractor_visible,
        NEW.created_actor_type, NEW.created_by_user_id, NEW.created_by_principal_id, NEW.archived_at,
        NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.organization_id, OLD.project_id, OLD.vendor_id, OLD.subcontract_agreement_id,
        OLD.item_name, OLD.description, OLD.item_kind, OLD.is_critical, OLD.supplier_vendor_id,
        OLD.supplier_name, OLD.quantity, OLD.unit, OLD.order_date, OLD.original_expected_date,
        OLD.location_id, OLD.work_package_id, OLD.purchase_order_id, OLD.notes, OLD.contractor_visible,
        OLD.created_actor_type, OLD.created_by_user_id, OLD.created_by_principal_id, OLD.archived_at,
        OLD.created_at) THEN
      RAISE EXCEPTION 'contractors may only report delivery state and dates' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS delivery_items_external_guard ON public.delivery_items;
CREATE TRIGGER delivery_items_external_guard
  BEFORE UPDATE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION app.delivery_items_external_guard();

CREATE TABLE IF NOT EXISTS public.delivery_item_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  delivery_item_id uuid NOT NULL,
  report_kind text NOT NULL,
  reported_state text,
  new_expected_date date,
  actual_date date,
  note text,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_item_reports_kind_known CHECK (report_kind IN (
    'status_update', 'delay_notice', 'arrived', 'issue', 'note')),
  CONSTRAINT delivery_item_reports_state_known CHECK (reported_state IS NULL OR reported_state IN (
    'planned', 'ordered', 'in_transit', 'partially_delivered', 'delivered', 'rejected', 'cancelled')),
  CONSTRAINT delivery_item_reports_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)),
  CONSTRAINT delivery_item_reports_item_fk
    FOREIGN KEY (delivery_item_id, organization_id)
    REFERENCES public.delivery_items (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS delivery_item_reports_item_idx
  ON public.delivery_item_reports (organization_id, delivery_item_id, created_at DESC);

CREATE OR REPLACE FUNCTION app.delivery_item_reports_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'delivery_item_reports are append-only' USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS delivery_item_reports_immutable ON public.delivery_item_reports;
CREATE TRIGGER delivery_item_reports_immutable
  BEFORE UPDATE OR DELETE ON public.delivery_item_reports
  FOR EACH ROW EXECUTE FUNCTION app.delivery_item_reports_immutable();

--------------------------------------------------------------------------------
-- 6b. Operational agreement scope (NO money) for project-capability holders and contractors.
--     subcontract_agreements itself stays gated by the org permission vendors.read (it carries
--     contract money); this projection only exposes identity/title/status/vendor name.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.dg_contractor_agreement_scope(
  p_organization_id uuid,
  p_project_id uuid,
  p_agreement_id uuid
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  project_id uuid,
  vendor_id uuid,
  title text,
  status text,
  vendor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id, a.organization_id, a.project_id, a.vendor_id, a.title, a.status, v.name
  FROM public.subcontract_agreements a
  JOIN public.vendors v ON v.id = a.vendor_id AND v.organization_id = a.organization_id
  WHERE a.organization_id = p_organization_id
    AND (p_project_id IS NULL OR a.project_id = p_project_id)
    AND (p_agreement_id IS NULL OR a.id = p_agreement_id)
    AND (p_project_id IS NOT NULL OR p_agreement_id IS NOT NULL)
    AND a.archived_at IS NULL
    AND (
      (app.is_org_member(a.organization_id)
        AND app.has_project_capability(a.organization_id, a.project_id, 'contractor.view'))
      OR app.external_has_scope(a.organization_id, a.project_id, a.vendor_id, a.id, 'ext.project.view')
    )
$fn$;

REVOKE ALL ON FUNCTION app.dg_contractor_agreement_scope(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_contractor_agreement_scope(uuid, uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 7. RLS
--------------------------------------------------------------------------------

ALTER TABLE public.contractor_compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_compliance_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_compliance_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_compliance_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_compliance_reminders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_record_contractor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_record_contractor_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_action_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_action_task_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_item_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_item_reports FORCE ROW LEVEL SECURITY;

-- contractor_compliance_requirements: contractor.view reads, contractor.coordinate writes;
-- the contractor reads its own (active) requirements with ext.compliance.submit.
DROP POLICY IF EXISTS contractor_compliance_requirements_select ON public.contractor_compliance_requirements;
CREATE POLICY contractor_compliance_requirements_select ON public.contractor_compliance_requirements
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR (archived_at IS NULL AND app.external_has_scope(organization_id, project_id, vendor_id,
      subcontract_agreement_id, 'ext.compliance.submit'))
  );
DROP POLICY IF EXISTS contractor_compliance_requirements_insert ON public.contractor_compliance_requirements;
CREATE POLICY contractor_compliance_requirements_insert ON public.contractor_compliance_requirements
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS contractor_compliance_requirements_update ON public.contractor_compliance_requirements;
CREATE POLICY contractor_compliance_requirements_update ON public.contractor_compliance_requirements
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS contractor_compliance_requirements_service_all ON public.contractor_compliance_requirements;
CREATE POLICY contractor_compliance_requirements_service_all ON public.contractor_compliance_requirements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- contractor_compliance_documents: same read rule; the contractor submits as itself only, always pending.
DROP POLICY IF EXISTS contractor_compliance_documents_select ON public.contractor_compliance_documents;
CREATE POLICY contractor_compliance_documents_select ON public.contractor_compliance_documents
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.compliance.submit')
  );
DROP POLICY IF EXISTS contractor_compliance_documents_insert_internal ON public.contractor_compliance_documents;
CREATE POLICY contractor_compliance_documents_insert_internal ON public.contractor_compliance_documents
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND submitted_actor_type = 'internal'
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS contractor_compliance_documents_insert_external ON public.contractor_compliance_documents;
CREATE POLICY contractor_compliance_documents_insert_external ON public.contractor_compliance_documents
  FOR INSERT TO authenticated
  WITH CHECK (submitted_actor_type = 'external'
    AND submitted_by_principal_id = app.external_principal_id()
    AND review_status = 'pending_review'
    AND document_id IS NULL AND compliance_artifact_id IS NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.compliance.submit'));
DROP POLICY IF EXISTS contractor_compliance_documents_review ON public.contractor_compliance_documents;
CREATE POLICY contractor_compliance_documents_review ON public.contractor_compliance_documents
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS contractor_compliance_documents_service_all ON public.contractor_compliance_documents;
CREATE POLICY contractor_compliance_documents_service_all ON public.contractor_compliance_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- contractor_compliance_reminders: internal read; written by the system scan (service role).
DROP POLICY IF EXISTS contractor_compliance_reminders_select ON public.contractor_compliance_reminders;
CREATE POLICY contractor_compliance_reminders_select ON public.contractor_compliance_reminders
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.view'));
DROP POLICY IF EXISTS contractor_compliance_reminders_service_all ON public.contractor_compliance_reminders;
CREATE POLICY contractor_compliance_reminders_service_all ON public.contractor_compliance_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- safety_record_contractor_links: safety.manage reads/writes; the contractor reads its own visible
-- records and creates links only for its own reports (ext.safety.report).
DROP POLICY IF EXISTS safety_record_contractor_links_select ON public.safety_record_contractor_links;
CREATE POLICY safety_record_contractor_links_select ON public.safety_record_contractor_links
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'safety.manage'))
    OR (contractor_visible AND app.external_has_scope(organization_id, project_id, vendor_id,
      subcontract_agreement_id, 'ext.safety.report'))
  );
DROP POLICY IF EXISTS safety_record_contractor_links_insert_internal ON public.safety_record_contractor_links;
CREATE POLICY safety_record_contractor_links_insert_internal ON public.safety_record_contractor_links
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND reported_actor_type = 'internal'
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'));
DROP POLICY IF EXISTS safety_record_contractor_links_insert_external ON public.safety_record_contractor_links;
CREATE POLICY safety_record_contractor_links_insert_external ON public.safety_record_contractor_links
  FOR INSERT TO authenticated
  WITH CHECK (reported_actor_type = 'external'
    AND reported_by_principal_id = app.external_principal_id()
    AND contractor_visible
    AND closure_verified_at IS NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.safety.report'));
DROP POLICY IF EXISTS safety_record_contractor_links_update ON public.safety_record_contractor_links;
CREATE POLICY safety_record_contractor_links_update ON public.safety_record_contractor_links
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'));
DROP POLICY IF EXISTS safety_record_contractor_links_service_all ON public.safety_record_contractor_links;
CREATE POLICY safety_record_contractor_links_service_all ON public.safety_record_contractor_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- safety_action_task_links: internal safety.manage only (via the parent record's project).
DROP POLICY IF EXISTS safety_action_task_links_select ON public.safety_action_task_links;
CREATE POLICY safety_action_task_links_select ON public.safety_action_task_links
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.safety_record_contractor_links l
    WHERE l.safety_record_id = safety_action_task_links.safety_record_id
      AND l.organization_id = safety_action_task_links.organization_id
      AND app.has_project_capability(l.organization_id, l.project_id, 'safety.manage')));
DROP POLICY IF EXISTS safety_action_task_links_insert ON public.safety_action_task_links;
CREATE POLICY safety_action_task_links_insert ON public.safety_action_task_links
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.safety_record_contractor_links l
    WHERE l.safety_record_id = safety_action_task_links.safety_record_id
      AND l.organization_id = safety_action_task_links.organization_id
      AND app.has_project_capability(l.organization_id, l.project_id, 'safety.manage')));
DROP POLICY IF EXISTS safety_action_task_links_service_all ON public.safety_action_task_links;
CREATE POLICY safety_action_task_links_service_all ON public.safety_action_task_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Existing safety_records / safety_corrective_actions: ADDITIVE permissive policies so project
-- capability holders (Owner app + Employee App) and the reporting contractor can work with
-- contractor-linked records. Existing org-permission policies are untouched.
DROP POLICY IF EXISTS safety_records_dg_capability_select ON public.safety_records;
CREATE POLICY safety_records_dg_capability_select ON public.safety_records
  FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'));
DROP POLICY IF EXISTS safety_records_dg_capability_insert ON public.safety_records;
CREATE POLICY safety_records_dg_capability_insert ON public.safety_records
  FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'));
DROP POLICY IF EXISTS safety_records_dg_capability_update ON public.safety_records;
CREATE POLICY safety_records_dg_capability_update ON public.safety_records
  FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'))
  WITH CHECK (project_id IS NOT NULL AND app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'safety.manage'));
DROP POLICY IF EXISTS safety_records_dg_external_select ON public.safety_records;
CREATE POLICY safety_records_dg_external_select ON public.safety_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.safety_record_contractor_links l
    WHERE l.safety_record_id = safety_records.id
      AND l.organization_id = safety_records.organization_id
      AND l.contractor_visible
      AND app.external_has_scope(l.organization_id, l.project_id, l.vendor_id,
        l.subcontract_agreement_id, 'ext.safety.report')));

DROP POLICY IF EXISTS safety_corrective_actions_dg_capability_all ON public.safety_corrective_actions;
CREATE POLICY safety_corrective_actions_dg_capability_all ON public.safety_corrective_actions
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.safety_records r
    WHERE r.id = safety_corrective_actions.safety_record_id
      AND r.organization_id = safety_corrective_actions.organization_id
      AND r.project_id IS NOT NULL
      AND app.has_project_capability(r.organization_id, r.project_id, 'safety.manage')))
  WITH CHECK (app.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.safety_records r
    WHERE r.id = safety_corrective_actions.safety_record_id
      AND r.organization_id = safety_corrective_actions.organization_id
      AND r.project_id IS NOT NULL
      AND app.has_project_capability(r.organization_id, r.project_id, 'safety.manage')));
DROP POLICY IF EXISTS safety_corrective_actions_dg_external_select ON public.safety_corrective_actions;
CREATE POLICY safety_corrective_actions_dg_external_select ON public.safety_corrective_actions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.safety_record_contractor_links l
    WHERE l.safety_record_id = safety_corrective_actions.safety_record_id
      AND l.organization_id = safety_corrective_actions.organization_id
      AND l.contractor_visible
      AND app.external_has_scope(l.organization_id, l.project_id, l.vendor_id,
        l.subcontract_agreement_id, 'ext.safety.report')));

-- delivery_items: project.view reads, contractor.coordinate / schedule.manage write; the responsible
-- contractor reads, registers and updates (state/dates only - trigger) its own visible items.
DROP POLICY IF EXISTS delivery_items_select ON public.delivery_items;
CREATE POLICY delivery_items_select ON public.delivery_items
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR (contractor_visible AND archived_at IS NULL AND vendor_id IS NOT NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.delivery.report'))
  );
DROP POLICY IF EXISTS delivery_items_insert_internal ON public.delivery_items;
CREATE POLICY delivery_items_insert_internal ON public.delivery_items
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND created_actor_type = 'internal' AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'schedule.manage')));
DROP POLICY IF EXISTS delivery_items_insert_external ON public.delivery_items;
CREATE POLICY delivery_items_insert_external ON public.delivery_items
  FOR INSERT TO authenticated
  WITH CHECK (created_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND vendor_id IS NOT NULL AND contractor_visible AND archived_at IS NULL
    AND purchase_order_id IS NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.delivery.report'));
DROP POLICY IF EXISTS delivery_items_update_internal ON public.delivery_items;
CREATE POLICY delivery_items_update_internal ON public.delivery_items
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'schedule.manage')))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'schedule.manage')));
DROP POLICY IF EXISTS delivery_items_update_external ON public.delivery_items;
CREATE POLICY delivery_items_update_external ON public.delivery_items
  FOR UPDATE TO authenticated
  USING (contractor_visible AND archived_at IS NULL AND vendor_id IS NOT NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.delivery.report'))
  WITH CHECK (contractor_visible AND archived_at IS NULL AND vendor_id IS NOT NULL
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.delivery.report'));
DROP POLICY IF EXISTS delivery_items_service_all ON public.delivery_items;
CREATE POLICY delivery_items_service_all ON public.delivery_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- delivery_item_reports: visible with the item; appended by internal writers or the contractor (as itself).
DROP POLICY IF EXISTS delivery_item_reports_select ON public.delivery_item_reports;
CREATE POLICY delivery_item_reports_select ON public.delivery_item_reports
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.delivery_items i
      WHERE i.id = delivery_item_reports.delivery_item_id
        AND i.organization_id = delivery_item_reports.organization_id
        AND i.contractor_visible AND i.archived_at IS NULL AND i.vendor_id IS NOT NULL
        AND app.external_has_scope(i.organization_id, i.project_id, i.vendor_id,
          i.subcontract_agreement_id, 'ext.delivery.report'))
  );
DROP POLICY IF EXISTS delivery_item_reports_insert_internal ON public.delivery_item_reports;
CREATE POLICY delivery_item_reports_insert_internal ON public.delivery_item_reports
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND actor_type = 'internal' AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'schedule.manage')));
DROP POLICY IF EXISTS delivery_item_reports_insert_external ON public.delivery_item_reports;
CREATE POLICY delivery_item_reports_insert_external ON public.delivery_item_reports
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
    AND EXISTS (
      SELECT 1 FROM public.delivery_items i
      WHERE i.id = delivery_item_reports.delivery_item_id
        AND i.organization_id = delivery_item_reports.organization_id
        AND i.project_id = delivery_item_reports.project_id
        AND i.contractor_visible AND i.archived_at IS NULL AND i.vendor_id IS NOT NULL
        AND app.external_has_scope(i.organization_id, i.project_id, i.vendor_id,
          i.subcontract_agreement_id, 'ext.delivery.report')));
DROP POLICY IF EXISTS delivery_item_reports_service_all ON public.delivery_item_reports;
CREATE POLICY delivery_item_reports_service_all ON public.delivery_item_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.contractor_compliance_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contractor_compliance_documents TO authenticated;
GRANT SELECT ON public.contractor_compliance_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.safety_record_contractor_links TO authenticated;
GRANT SELECT, INSERT ON public.safety_action_task_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_items TO authenticated;
GRANT SELECT, INSERT ON public.delivery_item_reports TO authenticated;
GRANT ALL PRIVILEGES ON public.contractor_compliance_requirements TO service_role;
GRANT ALL PRIVILEGES ON public.contractor_compliance_documents TO service_role;
GRANT ALL PRIVILEGES ON public.contractor_compliance_reminders TO service_role;
GRANT ALL PRIVILEGES ON public.safety_record_contractor_links TO service_role;
GRANT ALL PRIVILEGES ON public.safety_action_task_links TO service_role;
GRANT ALL PRIVILEGES ON public.delivery_items TO service_role;
GRANT ALL PRIVILEGES ON public.delivery_item_reports TO service_role;
