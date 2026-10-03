-- 0158: Developer / GC layer - SUBCONTRACT CORE (Track E).
-- PREPARED ONLY - Owner applies after the Final Gate review. Do not modify 0000-0157.
--
-- PURPOSE
--   1. subcontract_agreements: lifecycle widened (suspended, closed) + project-capability RLS
--      (additive permissive policies; the existing vendors.read / vendors.manage policies are untouched)
--   2. subcontract_value_events: project-capability RLS (financial read / change approval insert)
--   3. subcontract_agreement_profiles (operational 1:1: trade, work package, lifecycle stamps, baseline lock)
--   4. subcontract_agreement_financial_terms (financial 1:1: retention cap, advance rules, VAT, payment terms)
--   5. subcontract_work_line_attributes (operational 1:1 per foundation work line: line type, weight, dates)
--   6. subcontract_changes (operational header) + subcontract_change_versions / _version_lines
--      (financial, append-only negotiation) + subcontract_work_line_adjustments (financial, append-only)
--   7. subcontract_unpriced_work (operational record -> converted to change / rejected / cancelled)
--   8. app.dg_vendor_display_name (vendor name for contractor.view holders / the contractor itself)
--
-- COMPATIBILITY: additive. The deployed app only uses statuses draft/active/completed/cancelled;
-- the widened CHECK accepts every existing row. No column is renamed or dropped.
-- FINANCIAL SEPARATION: money lives only in *_financial_terms, *_versions, *_version_lines,
-- *_adjustments (and the foundation subcontract_work_line_prices / existing value events).

--------------------------------------------------------------------------------
-- 1. subcontract_agreements: lifecycle + project-capability policies
--------------------------------------------------------------------------------

ALTER TABLE public.subcontract_agreements
  DROP CONSTRAINT IF EXISTS subcontract_agreements_status_known;
ALTER TABLE public.subcontract_agreements
  ADD CONSTRAINT subcontract_agreements_status_known
  CHECK (status IN ('draft', 'active', 'suspended', 'completed', 'closed', 'cancelled'));

DROP POLICY IF EXISTS subcontract_agreements_dg_select ON public.subcontract_agreements;
CREATE POLICY subcontract_agreements_dg_select ON public.subcontract_agreements
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, id, 'ext.project.view')
  );
DROP POLICY IF EXISTS subcontract_agreements_dg_insert ON public.subcontract_agreements;
CREATE POLICY subcontract_agreements_dg_insert ON public.subcontract_agreements
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_agreements_dg_update ON public.subcontract_agreements;
CREATE POLICY subcontract_agreements_dg_update ON public.subcontract_agreements
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND (app.has_project_capability(organization_id, project_id, 'contract.manage')
      OR app.has_project_capability(organization_id, project_id, 'change.financial.manage')))
  WITH CHECK (app.is_org_member(organization_id)
    AND (app.has_project_capability(organization_id, project_id, 'contract.manage')
      OR app.has_project_capability(organization_id, project_id, 'change.financial.manage')));

--------------------------------------------------------------------------------
-- 2. subcontract_value_events: financial projection by project capability
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.dg_agreement_access(
  p_organization_id uuid,
  p_agreement_id uuid,
  p_internal_capability text,
  p_external_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontract_agreements a
    WHERE a.id = p_agreement_id
      AND a.organization_id = p_organization_id
      AND (
        (p_internal_capability IS NOT NULL
          AND app.has_project_capability(a.organization_id, a.project_id, p_internal_capability))
        OR (p_external_capability IS NOT NULL
          AND app.external_has_scope(a.organization_id, a.project_id, a.vendor_id, a.id, p_external_capability))
      )
  )
$fn$;

REVOKE ALL ON FUNCTION app.dg_agreement_access(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_agreement_access(uuid, uuid, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS subcontract_value_events_dg_select ON public.subcontract_value_events;
CREATE POLICY subcontract_value_events_dg_select ON public.subcontract_value_events
  FOR SELECT TO authenticated
  USING (
    app.dg_agreement_access(organization_id, subcontract_id, 'contract.financial.view', 'ext.contract.view_value')
  );
DROP POLICY IF EXISTS subcontract_value_events_dg_insert ON public.subcontract_value_events;
CREATE POLICY subcontract_value_events_dg_insert ON public.subcontract_value_events
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND actor_user_id = app.current_user_id()
    AND (
      app.dg_agreement_access(organization_id, subcontract_id, 'contract.manage', NULL)
      OR app.dg_agreement_access(organization_id, subcontract_id, 'change.financial.manage', NULL)
    )
  );

--------------------------------------------------------------------------------
-- 3. subcontract_agreement_profiles (operational, 1:1)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_agreement_profiles (
  agreement_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  trade text,
  work_package_id uuid,
  scope_summary text,
  source_entity_type text,
  source_entity_id uuid,
  baseline_locked_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  completed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  status_changed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_agreement_profiles_trade_len CHECK (trade IS NULL OR length(trade) <= 120),
  CONSTRAINT subcontract_agreement_profiles_source_shape CHECK (
    (source_entity_type IS NULL AND source_entity_id IS NULL)
    OR (source_entity_type ~ '^[a-z][a-z0-9_]*$' AND source_entity_id IS NOT NULL)
  )
);

ALTER TABLE public.subcontract_agreement_profiles DROP CONSTRAINT IF EXISTS subcontract_agreement_profiles_agreement_project_fk;
ALTER TABLE public.subcontract_agreement_profiles
  ADD CONSTRAINT subcontract_agreement_profiles_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_agreement_profiles DROP CONSTRAINT IF EXISTS subcontract_agreement_profiles_agreement_vendor_fk;
ALTER TABLE public.subcontract_agreement_profiles
  ADD CONSTRAINT subcontract_agreement_profiles_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_agreement_profiles DROP CONSTRAINT IF EXISTS subcontract_agreement_profiles_work_package_fk;
ALTER TABLE public.subcontract_agreement_profiles
  ADD CONSTRAINT subcontract_agreement_profiles_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id)
  ON DELETE SET NULL (work_package_id);

CREATE INDEX IF NOT EXISTS subcontract_agreement_profiles_project_idx
  ON public.subcontract_agreement_profiles (organization_id, project_id);
CREATE INDEX IF NOT EXISTS subcontract_agreement_profiles_source_idx
  ON public.subcontract_agreement_profiles (organization_id, source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. subcontract_agreement_financial_terms (financial, 1:1)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_agreement_financial_terms (
  agreement_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  currency char(3) NOT NULL,
  retention_cap_percent numeric(9, 6),
  retention_cap_amount numeric(18, 6),
  advance_percent numeric(9, 6),
  advance_amount numeric(18, 6),
  advance_recovery_method text NOT NULL DEFAULT 'none',
  advance_recovery_percent numeric(9, 6),
  vat_treatment text NOT NULL DEFAULT 'standard',
  payment_terms_days integer,
  payment_terms_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_agreement_financial_terms_percent_range CHECK (
    (retention_cap_percent IS NULL OR (retention_cap_percent >= 0 AND retention_cap_percent <= 100))
    AND (advance_percent IS NULL OR (advance_percent >= 0 AND advance_percent <= 100))
    AND (advance_recovery_percent IS NULL OR (advance_recovery_percent >= 0 AND advance_recovery_percent <= 100))
  ),
  CONSTRAINT subcontract_agreement_financial_terms_amount_non_negative CHECK (
    (retention_cap_amount IS NULL OR retention_cap_amount >= 0)
    AND (advance_amount IS NULL OR advance_amount >= 0)
  ),
  CONSTRAINT subcontract_agreement_financial_terms_recovery_known CHECK (
    advance_recovery_method IN ('none', 'proportional', 'fixed_percent_per_claim')
  ),
  CONSTRAINT subcontract_agreement_financial_terms_vat_known CHECK (
    vat_treatment IN ('standard', 'reverse_charge', 'exempt', 'zero_rated', 'not_applicable')
  ),
  CONSTRAINT subcontract_agreement_financial_terms_days_range CHECK (
    payment_terms_days IS NULL OR (payment_terms_days >= 0 AND payment_terms_days <= 365)
  )
);

ALTER TABLE public.subcontract_agreement_financial_terms DROP CONSTRAINT IF EXISTS subcontract_agreement_financial_terms_agreement_project_fk;
ALTER TABLE public.subcontract_agreement_financial_terms
  ADD CONSTRAINT subcontract_agreement_financial_terms_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_agreement_financial_terms DROP CONSTRAINT IF EXISTS subcontract_agreement_financial_terms_agreement_vendor_fk;
ALTER TABLE public.subcontract_agreement_financial_terms
  ADD CONSTRAINT subcontract_agreement_financial_terms_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

--------------------------------------------------------------------------------
-- 5. subcontract_work_line_attributes (operational, 1:1 per work line)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_work_line_attributes (
  work_line_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  line_type text NOT NULL DEFAULT 'quantity_rate',
  weight_percent numeric(9, 6),
  planned_start date,
  planned_end date,
  is_baseline boolean NOT NULL DEFAULT true,
  origin_change_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_work_line_attributes_type_known CHECK (line_type IN (
    'quantity_rate', 'lump_sum', 'weighted_milestone', 'percentage', 'allowance', 'custom'
  )),
  CONSTRAINT subcontract_work_line_attributes_weight_range CHECK (
    weight_percent IS NULL OR (weight_percent >= 0 AND weight_percent <= 100)
  ),
  CONSTRAINT subcontract_work_line_attributes_date_order CHECK (
    planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
  ),
  CONSTRAINT subcontract_work_line_attributes_origin_shape CHECK (
    is_baseline OR origin_change_id IS NOT NULL
  )
);

ALTER TABLE public.subcontract_work_line_attributes DROP CONSTRAINT IF EXISTS subcontract_work_line_attributes_line_fk;
ALTER TABLE public.subcontract_work_line_attributes
  ADD CONSTRAINT subcontract_work_line_attributes_line_fk
  FOREIGN KEY (work_line_id, organization_id, agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_work_line_attributes DROP CONSTRAINT IF EXISTS subcontract_work_line_attributes_agreement_project_fk;
ALTER TABLE public.subcontract_work_line_attributes
  ADD CONSTRAINT subcontract_work_line_attributes_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_work_line_attributes DROP CONSTRAINT IF EXISTS subcontract_work_line_attributes_agreement_vendor_fk;
ALTER TABLE public.subcontract_work_line_attributes
  ADD CONSTRAINT subcontract_work_line_attributes_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS subcontract_work_line_attributes_agreement_idx
  ON public.subcontract_work_line_attributes (organization_id, agreement_id);

-- Work package on the foundation work line must belong to the same project.
ALTER TABLE public.subcontract_work_lines DROP CONSTRAINT IF EXISTS subcontract_work_lines_work_package_fk;
ALTER TABLE public.subcontract_work_lines
  ADD CONSTRAINT subcontract_work_lines_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id)
  ON DELETE SET NULL (work_package_id);

--------------------------------------------------------------------------------
-- 6. Subcontract changes
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  change_number integer NOT NULL,
  change_type text NOT NULL,
  title text NOT NULL,
  description text,
  origin text NOT NULL DEFAULT 'internal',
  source_entity_type text,
  source_entity_id uuid,
  status text NOT NULL DEFAULT 'draft',
  time_extension_days integer,
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_actor_type text,
  decision_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decision_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  decision_reason text,
  approved_version_id uuid,
  value_event_id uuid,
  created_actor_type text NOT NULL DEFAULT 'internal',
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_changes_type_known CHECK (change_type IN (
    'addition', 'deduction', 'scope', 'quantity', 'rate', 'extension', 'instruction', 'contractor_proposal'
  )),
  CONSTRAINT subcontract_changes_origin_known CHECK (origin IN (
    'internal', 'contractor', 'site_instruction', 'unpriced_work'
  )),
  CONSTRAINT subcontract_changes_status_known CHECK (status IN (
    'draft', 'submitted', 'under_negotiation', 'approved', 'rejected', 'withdrawn'
  )),
  CONSTRAINT subcontract_changes_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT subcontract_changes_number_positive CHECK (change_number > 0),
  CONSTRAINT subcontract_changes_extension_range CHECK (
    time_extension_days IS NULL OR (time_extension_days >= 0 AND time_extension_days <= 3650)
  ),
  CONSTRAINT subcontract_changes_source_shape CHECK (
    (source_entity_type IS NULL AND source_entity_id IS NULL)
    OR (source_entity_type ~ '^[a-z][a-z0-9_]*$' AND source_entity_id IS NOT NULL)
  ),
  CONSTRAINT subcontract_changes_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_principal_id IS NOT NULL AND created_by_user_id IS NULL)
    OR (created_actor_type = 'system' AND created_by_user_id IS NULL AND created_by_principal_id IS NULL)
  ),
  CONSTRAINT subcontract_changes_decision_actor_shape CHECK (
    decision_actor_type IS NULL
    OR (decision_actor_type = 'internal' AND decision_principal_id IS NULL)
    OR (decision_actor_type = 'external' AND decision_principal_id IS NOT NULL AND decision_user_id IS NULL)
    OR (decision_actor_type = 'system' AND decision_user_id IS NULL AND decision_principal_id IS NULL)
  ),
  CONSTRAINT subcontract_changes_contractor_origin CHECK (
    origin <> 'contractor' OR created_actor_type = 'external'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_changes_id_organization_id_uq
  ON public.subcontract_changes (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_changes_id_org_agreement_uq
  ON public.subcontract_changes (id, organization_id, agreement_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_changes_number_uq
  ON public.subcontract_changes (organization_id, agreement_id, change_number);
CREATE INDEX IF NOT EXISTS subcontract_changes_project_status_idx
  ON public.subcontract_changes (organization_id, project_id, status);
CREATE INDEX IF NOT EXISTS subcontract_changes_source_idx
  ON public.subcontract_changes (organization_id, source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

ALTER TABLE public.subcontract_changes DROP CONSTRAINT IF EXISTS subcontract_changes_agreement_project_fk;
ALTER TABLE public.subcontract_changes
  ADD CONSTRAINT subcontract_changes_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_changes DROP CONSTRAINT IF EXISTS subcontract_changes_agreement_vendor_fk;
ALTER TABLE public.subcontract_changes
  ADD CONSTRAINT subcontract_changes_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_changes DROP CONSTRAINT IF EXISTS subcontract_changes_value_event_fk;
ALTER TABLE public.subcontract_changes
  ADD CONSTRAINT subcontract_changes_value_event_fk
  FOREIGN KEY (value_event_id, organization_id)
  REFERENCES public.subcontract_value_events (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.subcontract_work_line_attributes DROP CONSTRAINT IF EXISTS subcontract_work_line_attributes_origin_change_fk;
ALTER TABLE public.subcontract_work_line_attributes
  ADD CONSTRAINT subcontract_work_line_attributes_origin_change_fk
  FOREIGN KEY (origin_change_id, organization_id, agreement_id)
  REFERENCES public.subcontract_changes (id, organization_id, agreement_id)
  ON DELETE RESTRICT;

-- Change numbers are allocated by the database so internal drafts hidden from the contractor never collide.
CREATE OR REPLACE FUNCTION app.next_subcontract_change_number(
  p_organization_id uuid,
  p_agreement_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_next integer;
BEGIN
  IF NOT (
    app.dg_agreement_access(p_organization_id, p_agreement_id, 'contractor.view', 'ext.change.request')
  ) THEN
    RAISE EXCEPTION 'subcontract agreement not accessible' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subcontract_changes:' || p_agreement_id::text, 0));
  SELECT COALESCE(MAX(c.change_number), 0) + 1 INTO v_next
  FROM public.subcontract_changes c
  WHERE c.organization_id = p_organization_id AND c.agreement_id = p_agreement_id;
  RETURN v_next;
END
$fn$;

REVOKE ALL ON FUNCTION app.next_subcontract_change_number(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_subcontract_change_number(uuid, uuid) TO authenticated, service_role;

-- Decided changes are final; approval/rejection needs change.financial.manage even through raw SQL.
CREATE OR REPLACE FUNCTION app.subcontract_changes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'subcontract_changes are never deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('approved', 'rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'subcontract change % is final', OLD.status USING ERRCODE = '23514';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
     OR NEW.change_number IS DISTINCT FROM OLD.change_number
     OR NEW.created_actor_type IS DISTINCT FROM OLD.created_actor_type
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id
     OR NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'subcontract change identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('approved', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status
     AND app.current_user_id() IS NOT NULL
     AND NOT app.has_project_capability(NEW.organization_id, NEW.project_id, 'change.financial.manage') THEN
    RAISE EXCEPTION 'deciding a subcontract change requires change.financial.manage' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.approved_version_id IS NULL THEN
    RAISE EXCEPTION 'an approved change must reference the approved version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_changes_guard ON public.subcontract_changes;
CREATE TRIGGER subcontract_changes_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_changes
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_changes_guard();

-- Negotiation versions (financial, append-only).
CREATE TABLE IF NOT EXISTS public.subcontract_change_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  change_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  version_no integer NOT NULL,
  amount numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  time_extension_days integer,
  note text,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_change_versions_no_positive CHECK (version_no > 0),
  CONSTRAINT subcontract_change_versions_extension_range CHECK (
    time_extension_days IS NULL OR (time_extension_days >= 0 AND time_extension_days <= 3650)
  ),
  CONSTRAINT subcontract_change_versions_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_change_versions_id_organization_id_uq
  ON public.subcontract_change_versions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_change_versions_id_org_change_uq
  ON public.subcontract_change_versions (id, organization_id, change_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_change_versions_no_uq
  ON public.subcontract_change_versions (organization_id, change_id, version_no);

ALTER TABLE public.subcontract_change_versions DROP CONSTRAINT IF EXISTS subcontract_change_versions_change_fk;
ALTER TABLE public.subcontract_change_versions
  ADD CONSTRAINT subcontract_change_versions_change_fk
  FOREIGN KEY (change_id, organization_id, agreement_id)
  REFERENCES public.subcontract_changes (id, organization_id, agreement_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_change_versions DROP CONSTRAINT IF EXISTS subcontract_change_versions_agreement_project_fk;
ALTER TABLE public.subcontract_change_versions
  ADD CONSTRAINT subcontract_change_versions_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_change_versions DROP CONSTRAINT IF EXISTS subcontract_change_versions_agreement_vendor_fk;
ALTER TABLE public.subcontract_change_versions
  ADD CONSTRAINT subcontract_change_versions_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.subcontract_changes DROP CONSTRAINT IF EXISTS subcontract_changes_approved_version_fk;
ALTER TABLE public.subcontract_changes
  ADD CONSTRAINT subcontract_changes_approved_version_fk
  FOREIGN KEY (approved_version_id, organization_id, id)
  REFERENCES public.subcontract_change_versions (id, organization_id, change_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.subcontract_change_version_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  change_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  work_line_id uuid,
  new_line_code text,
  new_line_description text,
  new_line_unit text,
  new_line_type text,
  quantity_delta numeric(18, 6) NOT NULL DEFAULT 0,
  unit_rate numeric(18, 6),
  amount_delta numeric(18, 6) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_change_version_lines_target CHECK (
    (work_line_id IS NOT NULL AND new_line_description IS NULL)
    OR (work_line_id IS NULL AND new_line_description IS NOT NULL AND length(btrim(new_line_description)) > 0)
  ),
  CONSTRAINT subcontract_change_version_lines_new_type_known CHECK (new_line_type IS NULL OR new_line_type IN (
    'quantity_rate', 'lump_sum', 'weighted_milestone', 'percentage', 'allowance', 'custom'
  )),
  CONSTRAINT subcontract_change_version_lines_rate_non_negative CHECK (unit_rate IS NULL OR unit_rate >= 0)
);

CREATE INDEX IF NOT EXISTS subcontract_change_version_lines_version_idx
  ON public.subcontract_change_version_lines (organization_id, version_id, sort_order);

ALTER TABLE public.subcontract_change_version_lines DROP CONSTRAINT IF EXISTS subcontract_change_version_lines_version_fk;
ALTER TABLE public.subcontract_change_version_lines
  ADD CONSTRAINT subcontract_change_version_lines_version_fk
  FOREIGN KEY (version_id, organization_id, change_id)
  REFERENCES public.subcontract_change_versions (id, organization_id, change_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_change_version_lines DROP CONSTRAINT IF EXISTS subcontract_change_version_lines_change_fk;
ALTER TABLE public.subcontract_change_version_lines
  ADD CONSTRAINT subcontract_change_version_lines_change_fk
  FOREIGN KEY (change_id, organization_id, agreement_id)
  REFERENCES public.subcontract_changes (id, organization_id, agreement_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_change_version_lines DROP CONSTRAINT IF EXISTS subcontract_change_version_lines_work_line_fk;
ALTER TABLE public.subcontract_change_version_lines
  ADD CONSTRAINT subcontract_change_version_lines_work_line_fk
  FOREIGN KEY (work_line_id, organization_id, agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE CASCADE;

-- Applied line deltas (financial ledger, append-only). Revised line value = baseline + SUM(amount_delta).
CREATE TABLE IF NOT EXISTS public.subcontract_work_line_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  work_line_id uuid NOT NULL,
  change_id uuid NOT NULL,
  version_line_id uuid NOT NULL,
  quantity_delta numeric(18, 6) NOT NULL DEFAULT 0,
  amount_delta numeric(18, 6) NOT NULL,
  unit_rate numeric(18, 6),
  currency char(3) NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_work_line_adjustments_version_line_uq
  ON public.subcontract_work_line_adjustments (organization_id, version_line_id);
CREATE INDEX IF NOT EXISTS subcontract_work_line_adjustments_line_idx
  ON public.subcontract_work_line_adjustments (organization_id, work_line_id);
CREATE INDEX IF NOT EXISTS subcontract_work_line_adjustments_agreement_idx
  ON public.subcontract_work_line_adjustments (organization_id, agreement_id);

ALTER TABLE public.subcontract_work_line_adjustments DROP CONSTRAINT IF EXISTS subcontract_work_line_adjustments_line_fk;
ALTER TABLE public.subcontract_work_line_adjustments
  ADD CONSTRAINT subcontract_work_line_adjustments_line_fk
  FOREIGN KEY (work_line_id, organization_id, agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_work_line_adjustments DROP CONSTRAINT IF EXISTS subcontract_work_line_adjustments_change_fk;
ALTER TABLE public.subcontract_work_line_adjustments
  ADD CONSTRAINT subcontract_work_line_adjustments_change_fk
  FOREIGN KEY (change_id, organization_id, agreement_id)
  REFERENCES public.subcontract_changes (id, organization_id, agreement_id)
  ON DELETE CASCADE;
ALTER TABLE public.subcontract_work_line_adjustments DROP CONSTRAINT IF EXISTS subcontract_work_line_adjustments_agreement_project_fk;
ALTER TABLE public.subcontract_work_line_adjustments
  ADD CONSTRAINT subcontract_work_line_adjustments_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_work_line_adjustments DROP CONSTRAINT IF EXISTS subcontract_work_line_adjustments_agreement_vendor_fk;
ALTER TABLE public.subcontract_work_line_adjustments
  ADD CONSTRAINT subcontract_work_line_adjustments_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION app.dg_subcontract_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '%: append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND current_user = 'authenticated' THEN
    RAISE EXCEPTION '%: append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_change_versions_append_only ON public.subcontract_change_versions;
CREATE TRIGGER subcontract_change_versions_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_change_versions
  FOR EACH ROW EXECUTE FUNCTION app.dg_subcontract_append_only();
DROP TRIGGER IF EXISTS subcontract_change_version_lines_append_only ON public.subcontract_change_version_lines;
CREATE TRIGGER subcontract_change_version_lines_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_change_version_lines
  FOR EACH ROW EXECUTE FUNCTION app.dg_subcontract_append_only();
DROP TRIGGER IF EXISTS subcontract_work_line_adjustments_append_only ON public.subcontract_work_line_adjustments;
CREATE TRIGGER subcontract_work_line_adjustments_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_work_line_adjustments
  FOR EACH ROW EXECUTE FUNCTION app.dg_subcontract_append_only();

-- Versions may only be appended while the change is open; a counter-offer moves the change to negotiation.
CREATE OR REPLACE FUNCTION app.subcontract_change_versions_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status text;
BEGIN
  SELECT c.status INTO v_status FROM public.subcontract_changes c
    WHERE c.id = NEW.change_id AND c.organization_id = NEW.organization_id
    FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'subcontract change not found' USING ERRCODE = '23503';
  END IF;
  IF v_status NOT IN ('draft', 'submitted', 'under_negotiation') THEN
    RAISE EXCEPTION 'subcontract change % does not accept new versions', v_status USING ERRCODE = '23514';
  END IF;
  IF v_status = 'submitted' AND NEW.version_no > 1 THEN
    UPDATE public.subcontract_changes
      SET status = 'under_negotiation', updated_at = now()
      WHERE id = NEW.change_id AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_change_versions_on_insert ON public.subcontract_change_versions;
CREATE TRIGGER subcontract_change_versions_on_insert
  BEFORE INSERT ON public.subcontract_change_versions
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_change_versions_on_insert();

CREATE OR REPLACE FUNCTION app.next_subcontract_change_version_no(
  p_organization_id uuid,
  p_change_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_agreement uuid;
  v_next integer;
BEGIN
  SELECT c.agreement_id INTO v_agreement FROM public.subcontract_changes c
    WHERE c.id = p_change_id AND c.organization_id = p_organization_id;
  IF v_agreement IS NULL OR NOT (
    app.dg_agreement_access(p_organization_id, v_agreement, 'change.financial.manage', 'ext.change.request')
  ) THEN
    RAISE EXCEPTION 'subcontract change not accessible' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subcontract_change_versions:' || p_change_id::text, 0));
  SELECT COALESCE(MAX(v.version_no), 0) + 1 INTO v_next
  FROM public.subcontract_change_versions v
  WHERE v.organization_id = p_organization_id AND v.change_id = p_change_id;
  RETURN v_next;
END
$fn$;

REVOKE ALL ON FUNCTION app.next_subcontract_change_version_no(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_subcontract_change_version_no(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 7. subcontract_unpriced_work
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_unpriced_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  title text NOT NULL,
  scope_description text,
  location_id uuid,
  work_package_id uuid,
  work_date date NOT NULL,
  issuer_name text,
  issued_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  source_entity_type text,
  source_entity_id uuid,
  status text NOT NULL DEFAULT 'recorded',
  converted_change_id uuid,
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decision_reason text,
  created_actor_type text NOT NULL DEFAULT 'internal',
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_unpriced_work_status_known CHECK (status IN (
    'recorded', 'converted', 'rejected', 'cancelled'
  )),
  CONSTRAINT subcontract_unpriced_work_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT subcontract_unpriced_work_converted_shape CHECK (
    (status = 'converted') = (converted_change_id IS NOT NULL)
  ),
  CONSTRAINT subcontract_unpriced_work_source_shape CHECK (
    (source_entity_type IS NULL AND source_entity_id IS NULL)
    OR (source_entity_type ~ '^[a-z][a-z0-9_]*$' AND source_entity_id IS NOT NULL)
  ),
  CONSTRAINT subcontract_unpriced_work_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_principal_id IS NOT NULL AND created_by_user_id IS NULL)
    OR (created_actor_type = 'system' AND created_by_user_id IS NULL AND created_by_principal_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_unpriced_work_id_organization_id_uq
  ON public.subcontract_unpriced_work (id, organization_id);
CREATE INDEX IF NOT EXISTS subcontract_unpriced_work_project_status_idx
  ON public.subcontract_unpriced_work (organization_id, project_id, status, work_date DESC);
CREATE INDEX IF NOT EXISTS subcontract_unpriced_work_agreement_idx
  ON public.subcontract_unpriced_work (organization_id, agreement_id);

ALTER TABLE public.subcontract_unpriced_work DROP CONSTRAINT IF EXISTS subcontract_unpriced_work_agreement_project_fk;
ALTER TABLE public.subcontract_unpriced_work
  ADD CONSTRAINT subcontract_unpriced_work_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_unpriced_work DROP CONSTRAINT IF EXISTS subcontract_unpriced_work_agreement_vendor_fk;
ALTER TABLE public.subcontract_unpriced_work
  ADD CONSTRAINT subcontract_unpriced_work_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.subcontract_unpriced_work DROP CONSTRAINT IF EXISTS subcontract_unpriced_work_location_fk;
ALTER TABLE public.subcontract_unpriced_work
  ADD CONSTRAINT subcontract_unpriced_work_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id)
  ON DELETE SET NULL (location_id);
ALTER TABLE public.subcontract_unpriced_work DROP CONSTRAINT IF EXISTS subcontract_unpriced_work_work_package_fk;
ALTER TABLE public.subcontract_unpriced_work
  ADD CONSTRAINT subcontract_unpriced_work_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id)
  ON DELETE SET NULL (work_package_id);
ALTER TABLE public.subcontract_unpriced_work DROP CONSTRAINT IF EXISTS subcontract_unpriced_work_change_fk;
ALTER TABLE public.subcontract_unpriced_work
  ADD CONSTRAINT subcontract_unpriced_work_change_fk
  FOREIGN KEY (converted_change_id, organization_id, agreement_id)
  REFERENCES public.subcontract_changes (id, organization_id, agreement_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.subcontract_unpriced_work_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'subcontract_unpriced_work is never deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'recorded' THEN
    RAISE EXCEPTION 'unpriced work % is final', OLD.status USING ERRCODE = '23514';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
     OR NEW.created_actor_type IS DISTINCT FROM OLD.created_actor_type
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id THEN
    RAISE EXCEPTION 'unpriced work identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_unpriced_work_guard ON public.subcontract_unpriced_work;
CREATE TRIGGER subcontract_unpriced_work_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_unpriced_work
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_unpriced_work_guard();

--------------------------------------------------------------------------------
-- 8. Vendor display name (no other vendor column leaks to project-scoped users)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.dg_vendor_display_name(
  p_organization_id uuid,
  p_vendor_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT v.name
  FROM public.vendors v
  WHERE v.id = p_vendor_id
    AND v.organization_id = p_organization_id
    AND (
      (app.is_org_member(p_organization_id) AND app.has_org_permission(p_organization_id, 'vendors.read'))
      OR EXISTS (
        SELECT 1 FROM public.subcontract_agreements a
        WHERE a.organization_id = p_organization_id
          AND a.vendor_id = p_vendor_id
          AND (
            app.has_project_capability(a.organization_id, a.project_id, 'contractor.view')
            OR app.external_has_scope(a.organization_id, a.project_id, a.vendor_id, a.id, 'ext.project.view')
          )
      )
    )
$fn$;

REVOKE ALL ON FUNCTION app.dg_vendor_display_name(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_vendor_display_name(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 9. Additive policies on foundation work lines / prices for change approval
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS subcontract_work_lines_dg_change_insert ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_dg_change_insert ON public.subcontract_work_lines
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'change.financial.manage'));

DROP POLICY IF EXISTS subcontract_work_line_prices_dg_change_insert ON public.subcontract_work_line_prices;
CREATE POLICY subcontract_work_line_prices_dg_change_insert ON public.subcontract_work_line_prices
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_work_lines l
    WHERE l.id = subcontract_work_line_prices.work_line_id
      AND l.organization_id = subcontract_work_line_prices.organization_id
      AND app.is_org_member(l.organization_id)
      AND app.has_project_capability(l.organization_id, l.project_id, 'change.financial.manage')));

--------------------------------------------------------------------------------
-- 10. RLS + grants for the new tables
--------------------------------------------------------------------------------

ALTER TABLE public.subcontract_agreement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_agreement_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_agreement_financial_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_agreement_financial_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_attributes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_change_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_change_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_change_version_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_change_version_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_unpriced_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_unpriced_work FORCE ROW LEVEL SECURITY;

-- profiles (operational)
DROP POLICY IF EXISTS subcontract_agreement_profiles_select ON public.subcontract_agreement_profiles;
CREATE POLICY subcontract_agreement_profiles_select ON public.subcontract_agreement_profiles
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.project.view')
  );
DROP POLICY IF EXISTS subcontract_agreement_profiles_insert ON public.subcontract_agreement_profiles;
CREATE POLICY subcontract_agreement_profiles_insert ON public.subcontract_agreement_profiles
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_agreement_profiles_update ON public.subcontract_agreement_profiles;
CREATE POLICY subcontract_agreement_profiles_update ON public.subcontract_agreement_profiles
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_agreement_profiles_service_all ON public.subcontract_agreement_profiles;
CREATE POLICY subcontract_agreement_profiles_service_all ON public.subcontract_agreement_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- financial terms
DROP POLICY IF EXISTS subcontract_agreement_financial_terms_select ON public.subcontract_agreement_financial_terms;
CREATE POLICY subcontract_agreement_financial_terms_select ON public.subcontract_agreement_financial_terms
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contract.financial.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.contract.view_value')
  );
DROP POLICY IF EXISTS subcontract_agreement_financial_terms_insert ON public.subcontract_agreement_financial_terms;
CREATE POLICY subcontract_agreement_financial_terms_insert ON public.subcontract_agreement_financial_terms
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_agreement_financial_terms_update ON public.subcontract_agreement_financial_terms;
CREATE POLICY subcontract_agreement_financial_terms_update ON public.subcontract_agreement_financial_terms
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_agreement_financial_terms_service_all ON public.subcontract_agreement_financial_terms;
CREATE POLICY subcontract_agreement_financial_terms_service_all ON public.subcontract_agreement_financial_terms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- work line attributes (operational)
DROP POLICY IF EXISTS subcontract_work_line_attributes_select ON public.subcontract_work_line_attributes;
CREATE POLICY subcontract_work_line_attributes_select ON public.subcontract_work_line_attributes
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.project.view')
  );
DROP POLICY IF EXISTS subcontract_work_line_attributes_insert ON public.subcontract_work_line_attributes;
CREATE POLICY subcontract_work_line_attributes_insert ON public.subcontract_work_line_attributes
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'change.financial.manage')));
DROP POLICY IF EXISTS subcontract_work_line_attributes_update ON public.subcontract_work_line_attributes;
CREATE POLICY subcontract_work_line_attributes_update ON public.subcontract_work_line_attributes
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'contractor.coordinate')))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'contractor.coordinate')));
DROP POLICY IF EXISTS subcontract_work_line_attributes_service_all ON public.subcontract_work_line_attributes;
CREATE POLICY subcontract_work_line_attributes_service_all ON public.subcontract_work_line_attributes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- changes (operational header). The contractor never sees internal drafts.
DROP POLICY IF EXISTS subcontract_changes_select ON public.subcontract_changes;
CREATE POLICY subcontract_changes_select ON public.subcontract_changes
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR ((status <> 'draft' OR created_actor_type = 'external')
      AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.project.view'))
  );
DROP POLICY IF EXISTS subcontract_changes_insert_internal ON public.subcontract_changes;
CREATE POLICY subcontract_changes_insert_internal ON public.subcontract_changes
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND created_actor_type = 'internal'
    AND created_by_user_id = app.current_user_id()
    AND (app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
      OR app.has_project_capability(organization_id, project_id, 'contract.manage')
      OR app.has_project_capability(organization_id, project_id, 'change.financial.manage'))
  );
DROP POLICY IF EXISTS subcontract_changes_insert_external ON public.subcontract_changes;
CREATE POLICY subcontract_changes_insert_external ON public.subcontract_changes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND origin = 'contractor'
    AND status = 'submitted'
    AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.change.request')
  );
DROP POLICY IF EXISTS subcontract_changes_update ON public.subcontract_changes;
CREATE POLICY subcontract_changes_update ON public.subcontract_changes
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'change.financial.manage')))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contractor.coordinate')
    OR app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'change.financial.manage')));
DROP POLICY IF EXISTS subcontract_changes_service_all ON public.subcontract_changes;
CREATE POLICY subcontract_changes_service_all ON public.subcontract_changes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- change versions (financial)
DROP POLICY IF EXISTS subcontract_change_versions_select ON public.subcontract_change_versions;
CREATE POLICY subcontract_change_versions_select ON public.subcontract_change_versions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contract.financial.view'))
    OR (app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.change.request')
      AND EXISTS (
        SELECT 1 FROM public.subcontract_changes c
        WHERE c.id = subcontract_change_versions.change_id
          AND c.organization_id = subcontract_change_versions.organization_id
          AND (c.status <> 'draft' OR c.created_actor_type = 'external')
      ))
  );
DROP POLICY IF EXISTS subcontract_change_versions_insert_internal ON public.subcontract_change_versions;
CREATE POLICY subcontract_change_versions_insert_internal ON public.subcontract_change_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND actor_type = 'internal'
    AND actor_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'change.financial.manage')
  );
DROP POLICY IF EXISTS subcontract_change_versions_insert_external ON public.subcontract_change_versions;
CREATE POLICY subcontract_change_versions_insert_external ON public.subcontract_change_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'external'
    AND actor_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.change.request')
    AND EXISTS (
      SELECT 1 FROM public.subcontract_changes c
      WHERE c.id = subcontract_change_versions.change_id
        AND c.organization_id = subcontract_change_versions.organization_id
        AND c.status IN ('submitted', 'under_negotiation')
    )
  );
DROP POLICY IF EXISTS subcontract_change_versions_service_all ON public.subcontract_change_versions;
CREATE POLICY subcontract_change_versions_service_all ON public.subcontract_change_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- version lines (financial, via parent version visibility)
DROP POLICY IF EXISTS subcontract_change_version_lines_select ON public.subcontract_change_version_lines;
CREATE POLICY subcontract_change_version_lines_select ON public.subcontract_change_version_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_change_versions v
    WHERE v.id = subcontract_change_version_lines.version_id
      AND v.organization_id = subcontract_change_version_lines.organization_id
  ));
DROP POLICY IF EXISTS subcontract_change_version_lines_insert ON public.subcontract_change_version_lines;
CREATE POLICY subcontract_change_version_lines_insert ON public.subcontract_change_version_lines
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_change_versions v
    WHERE v.id = subcontract_change_version_lines.version_id
      AND v.organization_id = subcontract_change_version_lines.organization_id
      -- lines are written in the same transaction as their version (created_at = transaction start)
      AND v.created_at = now()
      AND (
        (v.actor_type = 'internal' AND v.actor_user_id = app.current_user_id()
          AND app.has_project_capability(v.organization_id, v.project_id, 'change.financial.manage'))
        OR (v.actor_type = 'external' AND v.actor_principal_id = app.external_principal_id()
          AND app.external_has_scope(v.organization_id, v.project_id, v.vendor_id, v.agreement_id, 'ext.change.request'))
      )
  ));
DROP POLICY IF EXISTS subcontract_change_version_lines_service_all ON public.subcontract_change_version_lines;
CREATE POLICY subcontract_change_version_lines_service_all ON public.subcontract_change_version_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- applied adjustments (financial ledger)
DROP POLICY IF EXISTS subcontract_work_line_adjustments_select ON public.subcontract_work_line_adjustments;
CREATE POLICY subcontract_work_line_adjustments_select ON public.subcontract_work_line_adjustments
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contract.financial.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.contract.view_value')
  );
DROP POLICY IF EXISTS subcontract_work_line_adjustments_insert ON public.subcontract_work_line_adjustments;
CREATE POLICY subcontract_work_line_adjustments_insert ON public.subcontract_work_line_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND actor_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'change.financial.manage'));
DROP POLICY IF EXISTS subcontract_work_line_adjustments_service_all ON public.subcontract_work_line_adjustments;
CREATE POLICY subcontract_work_line_adjustments_service_all ON public.subcontract_work_line_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- unpriced work (operational)
DROP POLICY IF EXISTS subcontract_unpriced_work_select ON public.subcontract_unpriced_work;
CREATE POLICY subcontract_unpriced_work_select ON public.subcontract_unpriced_work
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.project.view')
  );
DROP POLICY IF EXISTS subcontract_unpriced_work_insert ON public.subcontract_unpriced_work;
CREATE POLICY subcontract_unpriced_work_insert ON public.subcontract_unpriced_work
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND created_actor_type = 'internal'
    AND created_by_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS subcontract_unpriced_work_update ON public.subcontract_unpriced_work;
CREATE POLICY subcontract_unpriced_work_update ON public.subcontract_unpriced_work
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));
DROP POLICY IF EXISTS subcontract_unpriced_work_service_all ON public.subcontract_unpriced_work;
CREATE POLICY subcontract_unpriced_work_service_all ON public.subcontract_unpriced_work
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.subcontract_agreement_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_agreement_financial_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_work_line_attributes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_changes TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_change_versions TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_change_version_lines TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_work_line_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_unpriced_work TO authenticated;
GRANT ALL PRIVILEGES ON public.subcontract_agreement_profiles TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_agreement_financial_terms TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_work_line_attributes TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_changes TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_change_versions TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_change_version_lines TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_work_line_adjustments TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_unpriced_work TO service_role;
