-- 0065_project_billing_plans
-- Additive only. Does NOT modify 0000–0064 SQL content.
-- UNAPPLIED — Owner applies later.
--
-- Project Billing Plans: templates, plans, sections, lines, progress cycles,
-- cycle lines, and cycle revisions. Extends billing_records.source_kind with
-- 'billing_plan'. Does NOT create duplicate retention tables.
--
-- Owner lifecycle (cycle status):
--   draft=טיוטה | ready=מוכן | submitted=הוגש | partially_approved=אושר חלקית
--   | approved=אושר | void=מבוטל
-- ISSUED/SUBMITTED is NOT immutable. Hard normal-edit lock only when linked AR
-- is FULLY PAID. Void stays protected.
--
-- Hardening:
--   * Project-scoped RLS (org member + billing.* + can_access_project)
--   * Composite ON DELETE SET NULL (nullable_column_only) — never organization_id
--   * Cycles FK ON DELETE RESTRICT; plan delete blocked when submitted/approved
--     history exists (status <> draft or billing_record linked)
--   * Fully-paid / void cycle (+ cycle_lines) lock via history_write latch
--   * Financial CHECK constraints on plan/cycle lines (approved-based cumulative)
--   * BOQ same-project integrity + one active plan line per boq_node
--
-- Application submit path (draft/ready → submitted): no special latch required.
-- Service correction of void / fully-paid history:
--   SELECT set_config('app.billing_plan_history_write','on',true);

--------------------------------------------------------------------------------
-- Support: contract same-project composite target
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS contracts_id_org_project_uq
  ON public.contracts (id, organization_id, project_id);

--------------------------------------------------------------------------------
-- billing_plan_templates (org-scoped)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  work_kind text,
  default_retention_percent numeric(9,6),
  currency char(3),
  rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_plan_templates_name_nonblank CHECK (length(btrim(name)) > 0),
  CONSTRAINT billing_plan_templates_work_kind_known CHECK (
    work_kind IS NULL OR work_kind IN (
      'contractor',
      'electrical',
      'plumbing',
      'hvac',
      'renovation',
      'small_works',
      'service_install',
      'architecture',
      'design',
      'engineering',
      'consulting',
      'inspection',
      'maintenance',
      'mixed'
    )
  ),
  CONSTRAINT billing_plan_templates_retention_range CHECK (
    default_retention_percent IS NULL
    OR (default_retention_percent >= 0 AND default_retention_percent <= 100)
  ),
  CONSTRAINT billing_plan_templates_rows_json_array CHECK (jsonb_typeof(rows_json) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_plan_templates_id_organization_id_uq
  ON public.billing_plan_templates (id, organization_id);
CREATE INDEX IF NOT EXISTS billing_plan_templates_org_active_idx
  ON public.billing_plan_templates (organization_id, is_active);

--------------------------------------------------------------------------------
-- project_billing_plans
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  template_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL,
  default_retention_percent numeric(9,6),
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  activated_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_plans_name_nonblank CHECK (length(btrim(name)) > 0),
  CONSTRAINT project_billing_plans_status_known CHECK (
    status IN ('draft', 'active', 'completed', 'archived')
  ),
  CONSTRAINT project_billing_plans_retention_range CHECK (
    default_retention_percent IS NULL
    OR (default_retention_percent >= 0 AND default_retention_percent <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plans_id_organization_id_uq
  ON public.project_billing_plans (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plans_id_org_project_uq
  ON public.project_billing_plans (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plans_id_org_project_contract_uq
  ON public.project_billing_plans (id, organization_id, project_id, contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plans_one_active_per_contract_uq
  ON public.project_billing_plans (organization_id, project_id, contract_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS project_billing_plans_org_project_idx
  ON public.project_billing_plans (organization_id, project_id);
CREATE INDEX IF NOT EXISTS project_billing_plans_org_status_idx
  ON public.project_billing_plans (organization_id, status);

ALTER TABLE public.project_billing_plans
  DROP CONSTRAINT IF EXISTS project_billing_plans_project_org_fk;
ALTER TABLE public.project_billing_plans
  ADD CONSTRAINT project_billing_plans_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.project_billing_plans
  DROP CONSTRAINT IF EXISTS project_billing_plans_contract_project_org_fk;
ALTER TABLE public.project_billing_plans
  ADD CONSTRAINT project_billing_plans_contract_project_org_fk
  FOREIGN KEY (contract_id, organization_id, project_id)
  REFERENCES public.contracts (id, organization_id, project_id)
  ON DELETE RESTRICT;

ALTER TABLE public.project_billing_plans
  DROP CONSTRAINT IF EXISTS project_billing_plans_template_org_fk;
ALTER TABLE public.project_billing_plans
  ADD CONSTRAINT project_billing_plans_template_org_fk
  FOREIGN KEY (template_id, organization_id)
  REFERENCES public.billing_plan_templates (id, organization_id)
  ON DELETE SET NULL (template_id);

--------------------------------------------------------------------------------
-- project_billing_plan_sections
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_plan_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_plan_sections_name_nonblank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plan_sections_id_organization_id_uq
  ON public.project_billing_plan_sections (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plan_sections_id_org_plan_uq
  ON public.project_billing_plan_sections (id, organization_id, plan_id);
CREATE INDEX IF NOT EXISTS project_billing_plan_sections_plan_idx
  ON public.project_billing_plan_sections (organization_id, plan_id, sort_order);

-- CASCADE when plan has no submitted/approved history (plan delete trigger + cycles RESTRICT).
ALTER TABLE public.project_billing_plan_sections
  DROP CONSTRAINT IF EXISTS project_billing_plan_sections_plan_org_fk;
ALTER TABLE public.project_billing_plan_sections
  ADD CONSTRAINT project_billing_plan_sections_plan_org_fk
  FOREIGN KEY (plan_id, organization_id)
  REFERENCES public.project_billing_plans (id, organization_id)
  ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- project_billing_plan_lines
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_plan_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  section_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  line_kind text NOT NULL,
  agreed_amount numeric(18,6) NOT NULL DEFAULT 0,
  agreed_percent numeric(9,6),
  target_date date,
  milestone_label text,
  retention_percent_override numeric(9,6),
  boq_node_id uuid,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  agreed_amount_snapshot numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_plan_lines_label_nonblank CHECK (length(btrim(label)) > 0),
  CONSTRAINT project_billing_plan_lines_kind_known CHECK (
    line_kind IN (
      'fixed_amount',
      'percent_of_contract',
      'percent_of_base',
      'milestone',
      'period',
      'boq_link',
      'manual'
    )
  ),
  CONSTRAINT project_billing_plan_lines_agreed_amount_nonneg CHECK (agreed_amount >= 0),
  CONSTRAINT project_billing_plan_lines_agreed_amount_snapshot_nonneg CHECK (
    agreed_amount_snapshot IS NULL OR agreed_amount_snapshot >= 0
  ),
  CONSTRAINT project_billing_plan_lines_agreed_percent_range CHECK (
    agreed_percent IS NULL
    OR (agreed_percent >= 0 AND agreed_percent <= 100)
  ),
  CONSTRAINT project_billing_plan_lines_retention_override_range CHECK (
    retention_percent_override IS NULL
    OR (retention_percent_override >= 0 AND retention_percent_override <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plan_lines_id_organization_id_uq
  ON public.project_billing_plan_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plan_lines_id_org_plan_uq
  ON public.project_billing_plan_lines (id, organization_id, plan_id);
CREATE INDEX IF NOT EXISTS project_billing_plan_lines_plan_idx
  ON public.project_billing_plan_lines (organization_id, plan_id, sort_order);
CREATE INDEX IF NOT EXISTS project_billing_plan_lines_section_idx
  ON public.project_billing_plan_lines (organization_id, section_id);
-- One active plan line per BOQ node (reduces double-claim risk).
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_plan_lines_active_boq_node_uq
  ON public.project_billing_plan_lines (organization_id, boq_node_id)
  WHERE boq_node_id IS NOT NULL AND is_archived = false;

ALTER TABLE public.project_billing_plan_lines
  DROP CONSTRAINT IF EXISTS project_billing_plan_lines_plan_org_fk;
ALTER TABLE public.project_billing_plan_lines
  ADD CONSTRAINT project_billing_plan_lines_plan_org_fk
  FOREIGN KEY (plan_id, organization_id)
  REFERENCES public.project_billing_plans (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.project_billing_plan_lines
  DROP CONSTRAINT IF EXISTS project_billing_plan_lines_section_plan_org_fk;
ALTER TABLE public.project_billing_plan_lines
  ADD CONSTRAINT project_billing_plan_lines_section_plan_org_fk
  FOREIGN KEY (section_id, organization_id, plan_id)
  REFERENCES public.project_billing_plan_sections (id, organization_id, plan_id)
  ON DELETE SET NULL (section_id);

ALTER TABLE public.project_billing_plan_lines
  DROP CONSTRAINT IF EXISTS project_billing_plan_lines_boq_node_org_fk;
ALTER TABLE public.project_billing_plan_lines
  ADD CONSTRAINT project_billing_plan_lines_boq_node_org_fk
  FOREIGN KEY (boq_node_id, organization_id)
  REFERENCES public.boq_nodes (id, organization_id)
  ON DELETE SET NULL (boq_node_id);

--------------------------------------------------------------------------------
-- project_billing_cycles (progress / current accounts)
-- Status: draft=טיוטה, ready=מוכן, submitted=הוגש,
--   partially_approved=אושר חלקית, approved=אושר, void=מבוטל
-- billing_record_id is set on submit (links AR). submitted_at / submitted_by
-- record the submit event. revision_number increments on revise-after-submit.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  cycle_number integer NOT NULL DEFAULT 1,
  revision_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  document_kind text NOT NULL DEFAULT 'progress_account',
  status text NOT NULL DEFAULT 'draft',
  period_start date,
  period_end date,
  account_date date NOT NULL,
  retention_percent numeric(9,6),
  notes text,
  billing_record_id uuid,
  submitted_at timestamptz,
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_cycles_title_nonblank CHECK (length(btrim(title)) > 0),
  CONSTRAINT project_billing_cycles_cycle_number_positive CHECK (cycle_number >= 1),
  CONSTRAINT project_billing_cycles_revision_number_positive CHECK (revision_number >= 1),
  CONSTRAINT project_billing_cycles_document_kind_known CHECK (
    document_kind IN ('progress_account', 'partial_account', 'payment_request')
  ),
  CONSTRAINT project_billing_cycles_status_known CHECK (
    status IN (
      'draft',
      'ready',
      'submitted',
      'partially_approved',
      'approved',
      'void'
    )
  ),
  CONSTRAINT project_billing_cycles_period_order CHECK (
    period_end IS NULL OR period_start IS NULL OR period_end >= period_start
  ),
  CONSTRAINT project_billing_cycles_retention_range CHECK (
    retention_percent IS NULL
    OR (retention_percent >= 0 AND retention_percent <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycles_id_organization_id_uq
  ON public.project_billing_cycles (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycles_id_org_plan_uq
  ON public.project_billing_cycles (id, organization_id, plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycles_org_plan_number_uq
  ON public.project_billing_cycles (organization_id, plan_id, cycle_number);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycles_billing_record_uq
  ON public.project_billing_cycles (billing_record_id)
  WHERE billing_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_billing_cycles_org_plan_idx
  ON public.project_billing_cycles (organization_id, plan_id, cycle_number);
CREATE INDEX IF NOT EXISTS project_billing_cycles_org_status_idx
  ON public.project_billing_cycles (organization_id, status);

-- RESTRICT: preserve cycle rows; plan delete trigger blocks submitted/approved history.
ALTER TABLE public.project_billing_cycles
  DROP CONSTRAINT IF EXISTS project_billing_cycles_plan_project_contract_org_fk;
ALTER TABLE public.project_billing_cycles
  ADD CONSTRAINT project_billing_cycles_plan_project_contract_org_fk
  FOREIGN KEY (plan_id, organization_id, project_id, contract_id)
  REFERENCES public.project_billing_plans (id, organization_id, project_id, contract_id)
  ON DELETE RESTRICT;

ALTER TABLE public.project_billing_cycles
  DROP CONSTRAINT IF EXISTS project_billing_cycles_billing_record_org_fk;
ALTER TABLE public.project_billing_cycles
  ADD CONSTRAINT project_billing_cycles_billing_record_org_fk
  FOREIGN KEY (billing_record_id, organization_id)
  REFERENCES public.billing_records (id, organization_id)
  ON DELETE SET NULL (billing_record_id);

--------------------------------------------------------------------------------
-- project_billing_cycle_lines
-- Field semantics:
--   current_*     = working requested (draft edits)
--   requested_*   = last submitted request snapshot (copied from current on submit/revise)
--   approved_*    = customer approved amounts
--   cumulative_*  = prior + coalesce(approved_amount, 0) — authoritative billed
--   remaining     = base - cumulative (approved-based)
--   retention_amount applies to approved when approved set, else to current when draft
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_cycle_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  plan_line_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  current_percent numeric(12,8),
  current_amount numeric(18,6),
  requested_percent numeric(12,8),
  requested_amount numeric(18,6),
  approved_percent numeric(12,8),
  approved_amount numeric(18,6),
  prior_percent numeric(12,8) NOT NULL DEFAULT 0,
  prior_amount numeric(18,6) NOT NULL DEFAULT 0,
  cumulative_percent numeric(12,8) NOT NULL DEFAULT 0,
  cumulative_amount numeric(18,6) NOT NULL DEFAULT 0,
  remaining_amount numeric(18,6) NOT NULL DEFAULT 0,
  base_amount_snapshot numeric(18,6) NOT NULL,
  retention_amount numeric(18,6) NOT NULL DEFAULT 0,
  line_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_cycle_lines_prior_amount_nonneg CHECK (prior_amount >= 0),
  CONSTRAINT project_billing_cycle_lines_current_amount_nonneg CHECK (
    current_amount IS NULL OR current_amount >= 0
  ),
  CONSTRAINT project_billing_cycle_lines_requested_amount_nonneg CHECK (
    requested_amount IS NULL OR requested_amount >= 0
  ),
  CONSTRAINT project_billing_cycle_lines_approved_amount_nonneg CHECK (
    approved_amount IS NULL OR approved_amount >= 0
  ),
  CONSTRAINT project_billing_cycle_lines_approved_lte_requested CHECK (
    approved_amount IS NULL
    OR approved_amount <= coalesce(requested_amount, current_amount, 0) + 0.000001
  ),
  CONSTRAINT project_billing_cycle_lines_cumulative_amount_nonneg CHECK (cumulative_amount >= 0),
  CONSTRAINT project_billing_cycle_lines_remaining_amount_nonneg CHECK (remaining_amount >= 0),
  CONSTRAINT project_billing_cycle_lines_retention_amount_nonneg CHECK (retention_amount >= 0),
  CONSTRAINT project_billing_cycle_lines_base_amount_snapshot_nonneg CHECK (base_amount_snapshot >= 0),
  CONSTRAINT project_billing_cycle_lines_cumulative_lte_base CHECK (
    cumulative_amount <= base_amount_snapshot + 0.000001
  ),
  -- Authoritative billed = prior + approved (not working current_*).
  CONSTRAINT project_billing_cycle_lines_prior_approved_sum CHECK (
    abs(prior_amount + coalesce(approved_amount, 0) - cumulative_amount) <= 0.000001
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycle_lines_id_organization_id_uq
  ON public.project_billing_cycle_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycle_lines_cycle_plan_line_uq
  ON public.project_billing_cycle_lines (cycle_id, plan_line_id);
CREATE INDEX IF NOT EXISTS project_billing_cycle_lines_cycle_idx
  ON public.project_billing_cycle_lines (organization_id, cycle_id, sort_order);
CREATE INDEX IF NOT EXISTS project_billing_cycle_lines_plan_line_idx
  ON public.project_billing_cycle_lines (organization_id, plan_line_id);

ALTER TABLE public.project_billing_cycle_lines
  DROP CONSTRAINT IF EXISTS project_billing_cycle_lines_cycle_org_fk;
ALTER TABLE public.project_billing_cycle_lines
  ADD CONSTRAINT project_billing_cycle_lines_cycle_org_fk
  FOREIGN KEY (cycle_id, organization_id)
  REFERENCES public.project_billing_cycles (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.project_billing_cycle_lines
  DROP CONSTRAINT IF EXISTS project_billing_cycle_lines_plan_line_org_fk;
ALTER TABLE public.project_billing_cycle_lines
  ADD CONSTRAINT project_billing_cycle_lines_plan_line_org_fk
  FOREIGN KEY (plan_line_id, organization_id)
  REFERENCES public.project_billing_plan_lines (id, organization_id)
  ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- project_billing_cycle_revisions (submit/revise snapshots)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_billing_cycle_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  revision_number integer NOT NULL,
  status text NOT NULL,
  snapshot_json jsonb NOT NULL,
  change_summary text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_billing_cycle_revisions_revision_positive CHECK (revision_number >= 1),
  CONSTRAINT project_billing_cycle_revisions_status_known CHECK (
    status IN (
      'draft',
      'ready',
      'submitted',
      'partially_approved',
      'approved',
      'void'
    )
  ),
  CONSTRAINT project_billing_cycle_revisions_snapshot_object CHECK (
    jsonb_typeof(snapshot_json) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycle_revisions_id_organization_id_uq
  ON public.project_billing_cycle_revisions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_cycle_revisions_cycle_revision_uq
  ON public.project_billing_cycle_revisions (cycle_id, revision_number);
CREATE INDEX IF NOT EXISTS project_billing_cycle_revisions_cycle_idx
  ON public.project_billing_cycle_revisions (organization_id, cycle_id, revision_number);

ALTER TABLE public.project_billing_cycle_revisions
  DROP CONSTRAINT IF EXISTS project_billing_cycle_revisions_cycle_org_fk;
ALTER TABLE public.project_billing_cycle_revisions
  ADD CONSTRAINT project_billing_cycle_revisions_cycle_org_fk
  FOREIGN KEY (cycle_id, organization_id)
  REFERENCES public.project_billing_cycles (id, organization_id)
  ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- Guards / triggers
--------------------------------------------------------------------------------

-- Cycle line must reference a plan line on the same plan as the cycle.
CREATE OR REPLACE FUNCTION app.project_billing_cycle_lines_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_cycle_plan_id uuid;
  v_line_plan_id uuid;
BEGIN
  SELECT plan_id INTO v_cycle_plan_id
  FROM public.project_billing_cycles
  WHERE id = NEW.cycle_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: cycle missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT plan_id INTO v_line_plan_id
  FROM public.project_billing_plan_lines
  WHERE id = NEW.plan_line_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: plan line missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_cycle_plan_id IS DISTINCT FROM v_line_plan_id THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: plan line must belong to the cycle plan'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_billing_cycle_lines_plan_guard ON public.project_billing_cycle_lines;
CREATE TRIGGER project_billing_cycle_lines_plan_guard
  BEFORE INSERT OR UPDATE OF cycle_id, plan_line_id, organization_id
  ON public.project_billing_cycle_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.project_billing_cycle_lines_plan_guard();

REVOKE ALL ON FUNCTION app.project_billing_cycle_lines_plan_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_billing_cycle_lines_plan_guard() TO service_role;

-- BOQ node must belong to the same project as the billing plan.
CREATE OR REPLACE FUNCTION app.project_billing_plan_lines_boq_same_project()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_plan_project_id uuid;
  v_boq_project_id uuid;
BEGIN
  IF NEW.boq_node_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id INTO v_plan_project_id
  FROM public.project_billing_plans
  WHERE id = NEW.plan_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_billing_plan_lines: plan missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT b.project_id INTO v_boq_project_id
  FROM public.boq_nodes n
  JOIN public.project_boqs b
    ON b.id = n.boq_id
   AND b.organization_id = n.organization_id
  WHERE n.id = NEW.boq_node_id
    AND n.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_billing_plan_lines: boq node missing in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_plan_project_id IS DISTINCT FROM v_boq_project_id THEN
    RAISE EXCEPTION 'project_billing_plan_lines: boq node must belong to the same project as the plan'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_billing_plan_lines_boq_same_project ON public.project_billing_plan_lines;
CREATE TRIGGER project_billing_plan_lines_boq_same_project
  BEFORE INSERT OR UPDATE OF boq_node_id, plan_id, organization_id
  ON public.project_billing_plan_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.project_billing_plan_lines_boq_same_project();

REVOKE ALL ON FUNCTION app.project_billing_plan_lines_boq_same_project() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_billing_plan_lines_boq_same_project() TO service_role;

-- Block plan delete when any child cycle is submitted/approved (or linked AR).
CREATE OR REPLACE FUNCTION app.project_billing_plans_block_delete_if_issued()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_billing_cycles c
    WHERE c.plan_id = OLD.id
      AND c.organization_id = OLD.organization_id
      AND (c.status IS DISTINCT FROM 'draft' OR c.billing_record_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'project_billing_plans: cannot delete plan with submitted/approved billing history'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS project_billing_plans_block_delete_if_issued ON public.project_billing_plans;
CREATE TRIGGER project_billing_plans_block_delete_if_issued
  BEFORE DELETE ON public.project_billing_plans
  FOR EACH ROW
  EXECUTE FUNCTION app.project_billing_plans_block_delete_if_issued();

REVOKE ALL ON FUNCTION app.project_billing_plans_block_delete_if_issued() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_billing_plans_block_delete_if_issued() TO service_role;

-- True when cycle AR is finalized and outstanding <= 0
-- (total - paid_applications - retention_held_remaining; legacy payments fallback).
CREATE OR REPLACE FUNCTION app.billing_plan_cycle_is_fully_paid(
  p_organization_id uuid,
  p_cycle_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_billing_record_id uuid;
  v_status text;
  v_total numeric(18,6);
  v_retention_held numeric(18,6);
  v_paid numeric(18,6);
  v_has_applications boolean;
BEGIN
  SELECT c.billing_record_id
  INTO v_billing_record_id
  FROM public.project_billing_cycles c
  WHERE c.id = p_cycle_id
    AND c.organization_id = p_organization_id;

  IF v_billing_record_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT br.status, br.total_amount, br.retention_held_remaining
  INTO v_status, v_total, v_retention_held
  FROM public.billing_records br
  WHERE br.id = v_billing_record_id
    AND br.organization_id = p_organization_id;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'finalized' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payment_applications pa
    WHERE pa.billing_record_id = v_billing_record_id
      AND pa.organization_id = p_organization_id
  )
  INTO v_has_applications;

  IF v_has_applications THEN
    SELECT coalesce(sum(pa.applied_amount), 0)
    INTO v_paid
    FROM public.payment_applications pa
    JOIN public.payments p
      ON p.id = pa.payment_id
     AND p.organization_id = pa.organization_id
    WHERE pa.billing_record_id = v_billing_record_id
      AND pa.organization_id = p_organization_id
      AND p.status = 'recorded';
  ELSE
    -- Legacy 1:1 payments.billing_record_id when no application rows exist.
    SELECT coalesce(sum(p.amount), 0)
    INTO v_paid
    FROM public.payments p
    WHERE p.billing_record_id = v_billing_record_id
      AND p.organization_id = p_organization_id
      AND p.status = 'recorded';
  END IF;

  RETURN (v_total - v_paid - coalesce(v_retention_held, 0)) <= 0;
END;
$fn$;

REVOKE ALL ON FUNCTION app.billing_plan_cycle_is_fully_paid(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_plan_cycle_is_fully_paid(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.billing_plan_cycle_is_fully_paid(uuid, uuid) TO authenticated;

-- Hard edit lock: void always protected; fully paid AR locked.
-- Submitted/approved cycles remain editable until fully paid.
-- Corrections require: SELECT set_config('app.billing_plan_history_write','on',true);
CREATE OR REPLACE FUNCTION app.project_billing_cycle_paid_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_history_write boolean;
  v_fully_paid boolean;
BEGIN
  v_history_write :=
    current_setting('app.billing_plan_history_write', true) IS NOT DISTINCT FROM 'on';

  IF TG_OP = 'DELETE' THEN
    IF v_history_write THEN
      RETURN OLD;
    END IF;
    -- Void never delete; non-draft or linked AR preserve history.
    IF OLD.status = 'void'
       OR OLD.status IS DISTINCT FROM 'draft'
       OR OLD.billing_record_id IS NOT NULL THEN
      RAISE EXCEPTION 'project_billing_cycles: only draft cycles without billing history may be deleted'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF v_history_write THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'project_billing_cycles: void cycles are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  v_fully_paid := app.billing_plan_cycle_is_fully_paid(OLD.organization_id, OLD.id);
  IF v_fully_paid THEN
    -- Block status regression, clearing billing_record_id, and other field edits.
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.billing_record_id IS DISTINCT FROM OLD.billing_record_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.document_kind IS DISTINCT FROM OLD.document_kind
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.account_date IS DISTINCT FROM OLD.account_date
       OR NEW.retention_percent IS DISTINCT FROM OLD.retention_percent
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
       OR NEW.cycle_number IS DISTINCT FROM OLD.cycle_number
       OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'project_billing_cycles: fully paid cycles are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_billing_cycles_issued_immutable ON public.project_billing_cycles;
DROP TRIGGER IF EXISTS project_billing_cycles_paid_lock ON public.project_billing_cycles;
DROP FUNCTION IF EXISTS app.project_billing_cycle_issued_immutable();
CREATE TRIGGER project_billing_cycles_paid_lock
  BEFORE UPDATE OR DELETE ON public.project_billing_cycles
  FOR EACH ROW
  EXECUTE FUNCTION app.project_billing_cycle_paid_lock();

REVOKE ALL ON FUNCTION app.project_billing_cycle_paid_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_billing_cycle_paid_lock() TO service_role;

-- Cycle lines: void / fully-paid parent immutable; otherwise editable after submit.
-- DELETE lines only while parent is draft (prefer archive) unless history_write.
CREATE OR REPLACE FUNCTION app.project_billing_cycle_lines_paid_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status text;
  v_cycle_id uuid;
  v_organization_id uuid;
  v_fully_paid boolean;
BEGIN
  IF current_setting('app.billing_plan_history_write', true) IS NOT DISTINCT FROM 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_cycle_id := OLD.cycle_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_cycle_id := NEW.cycle_id;
    v_organization_id := NEW.organization_id;
  END IF;

  SELECT status INTO v_status
  FROM public.project_billing_cycles
  WHERE id = v_cycle_id
    AND organization_id = v_organization_id;

  IF v_status = 'void' THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: void cycle lines are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  v_fully_paid := app.billing_plan_cycle_is_fully_paid(v_organization_id, v_cycle_id);
  IF v_fully_paid THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: fully paid cycle lines are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' AND v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'project_billing_cycle_lines: delete only allowed on draft cycles (prefer archive)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_billing_cycle_lines_issued_immutable ON public.project_billing_cycle_lines;
DROP TRIGGER IF EXISTS project_billing_cycle_lines_paid_lock ON public.project_billing_cycle_lines;
DROP FUNCTION IF EXISTS app.project_billing_cycle_lines_issued_immutable();
CREATE TRIGGER project_billing_cycle_lines_paid_lock
  BEFORE UPDATE OR DELETE ON public.project_billing_cycle_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.project_billing_cycle_lines_paid_lock();

REVOKE ALL ON FUNCTION app.project_billing_cycle_lines_paid_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_billing_cycle_lines_paid_lock() TO service_role;

--------------------------------------------------------------------------------
-- billing_records.source_kind: allow billing_plan
--------------------------------------------------------------------------------

ALTER TABLE public.billing_records DROP CONSTRAINT IF EXISTS billing_records_source_kind_known;
ALTER TABLE public.billing_records
  ADD CONSTRAINT billing_records_source_kind_known
  CHECK (source_kind IN (
    'manual',
    'boq_progress',
    'work_order',
    'retention_release',
    'billing_plan'
  ));

--------------------------------------------------------------------------------
-- RLS
-- Templates: org member + billing.read|manage (no project scope).
-- Project-scoped tables: member + billing.* + can_access_project
--   (direct project_id, or EXISTS join to parent plan/cycle).
--------------------------------------------------------------------------------

ALTER TABLE public.billing_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_plan_templates_tenant_select ON public.billing_plan_templates;
CREATE POLICY billing_plan_templates_tenant_select ON public.billing_plan_templates
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
  );

DROP POLICY IF EXISTS billing_plan_templates_tenant_insert ON public.billing_plan_templates;
CREATE POLICY billing_plan_templates_tenant_insert ON public.billing_plan_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
  );

DROP POLICY IF EXISTS billing_plan_templates_tenant_update ON public.billing_plan_templates;
CREATE POLICY billing_plan_templates_tenant_update ON public.billing_plan_templates
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
  );

DROP POLICY IF EXISTS billing_plan_templates_tenant_delete ON public.billing_plan_templates;
CREATE POLICY billing_plan_templates_tenant_delete ON public.billing_plan_templates
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
  );

DROP POLICY IF EXISTS billing_plan_templates_service_all ON public.billing_plan_templates;
CREATE POLICY billing_plan_templates_service_all ON public.billing_plan_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_plans_tenant_select ON public.project_billing_plans;
CREATE POLICY project_billing_plans_tenant_select ON public.project_billing_plans
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_plans_tenant_insert ON public.project_billing_plans;
CREATE POLICY project_billing_plans_tenant_insert ON public.project_billing_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_plans_tenant_update ON public.project_billing_plans;
CREATE POLICY project_billing_plans_tenant_update ON public.project_billing_plans
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_plans_tenant_delete ON public.project_billing_plans;
CREATE POLICY project_billing_plans_tenant_delete ON public.project_billing_plans
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_plans_service_all ON public.project_billing_plans;
CREATE POLICY project_billing_plans_service_all ON public.project_billing_plans
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_plan_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_plan_sections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_plan_sections_tenant_select ON public.project_billing_plan_sections;
CREATE POLICY project_billing_plan_sections_tenant_select ON public.project_billing_plan_sections
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_sections.plan_id
        AND p.organization_id = project_billing_plan_sections.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_sections_tenant_insert ON public.project_billing_plan_sections;
CREATE POLICY project_billing_plan_sections_tenant_insert ON public.project_billing_plan_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_sections.plan_id
        AND p.organization_id = project_billing_plan_sections.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_sections_tenant_update ON public.project_billing_plan_sections;
CREATE POLICY project_billing_plan_sections_tenant_update ON public.project_billing_plan_sections
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_sections.plan_id
        AND p.organization_id = project_billing_plan_sections.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_sections.plan_id
        AND p.organization_id = project_billing_plan_sections.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_sections_tenant_delete ON public.project_billing_plan_sections;
CREATE POLICY project_billing_plan_sections_tenant_delete ON public.project_billing_plan_sections
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_sections.plan_id
        AND p.organization_id = project_billing_plan_sections.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_sections_service_all ON public.project_billing_plan_sections;
CREATE POLICY project_billing_plan_sections_service_all ON public.project_billing_plan_sections
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_plan_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_plan_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_plan_lines_tenant_select ON public.project_billing_plan_lines;
CREATE POLICY project_billing_plan_lines_tenant_select ON public.project_billing_plan_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_lines.plan_id
        AND p.organization_id = project_billing_plan_lines.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_lines_tenant_insert ON public.project_billing_plan_lines;
CREATE POLICY project_billing_plan_lines_tenant_insert ON public.project_billing_plan_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_lines.plan_id
        AND p.organization_id = project_billing_plan_lines.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_lines_tenant_update ON public.project_billing_plan_lines;
CREATE POLICY project_billing_plan_lines_tenant_update ON public.project_billing_plan_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_lines.plan_id
        AND p.organization_id = project_billing_plan_lines.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_lines.plan_id
        AND p.organization_id = project_billing_plan_lines.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_lines_tenant_delete ON public.project_billing_plan_lines;
CREATE POLICY project_billing_plan_lines_tenant_delete ON public.project_billing_plan_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_plans p
      WHERE p.id = project_billing_plan_lines.plan_id
        AND p.organization_id = project_billing_plan_lines.organization_id
        AND app.can_access_project(p.organization_id, p.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_plan_lines_service_all ON public.project_billing_plan_lines;
CREATE POLICY project_billing_plan_lines_service_all ON public.project_billing_plan_lines
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_cycles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_cycles_tenant_select ON public.project_billing_cycles;
CREATE POLICY project_billing_cycles_tenant_select ON public.project_billing_cycles
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_cycles_tenant_insert ON public.project_billing_cycles;
CREATE POLICY project_billing_cycles_tenant_insert ON public.project_billing_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_cycles_tenant_update ON public.project_billing_cycles;
CREATE POLICY project_billing_cycles_tenant_update ON public.project_billing_cycles
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_cycles_tenant_delete ON public.project_billing_cycles;
CREATE POLICY project_billing_cycles_tenant_delete ON public.project_billing_cycles
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_billing_cycles_service_all ON public.project_billing_cycles;
CREATE POLICY project_billing_cycles_service_all ON public.project_billing_cycles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_cycle_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_cycle_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_cycle_lines_tenant_select ON public.project_billing_cycle_lines;
CREATE POLICY project_billing_cycle_lines_tenant_select ON public.project_billing_cycle_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_lines.cycle_id
        AND c.organization_id = project_billing_cycle_lines.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_lines_tenant_insert ON public.project_billing_cycle_lines;
CREATE POLICY project_billing_cycle_lines_tenant_insert ON public.project_billing_cycle_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_lines.cycle_id
        AND c.organization_id = project_billing_cycle_lines.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_lines_tenant_update ON public.project_billing_cycle_lines;
CREATE POLICY project_billing_cycle_lines_tenant_update ON public.project_billing_cycle_lines
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_lines.cycle_id
        AND c.organization_id = project_billing_cycle_lines.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_lines.cycle_id
        AND c.organization_id = project_billing_cycle_lines.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_lines_tenant_delete ON public.project_billing_cycle_lines;
CREATE POLICY project_billing_cycle_lines_tenant_delete ON public.project_billing_cycle_lines
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_lines.cycle_id
        AND c.organization_id = project_billing_cycle_lines.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_lines_service_all ON public.project_billing_cycle_lines;
CREATE POLICY project_billing_cycle_lines_service_all ON public.project_billing_cycle_lines
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.project_billing_cycle_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_cycle_revisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_billing_cycle_revisions_tenant_select ON public.project_billing_cycle_revisions;
CREATE POLICY project_billing_cycle_revisions_tenant_select ON public.project_billing_cycle_revisions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_revisions.cycle_id
        AND c.organization_id = project_billing_cycle_revisions.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_revisions_tenant_insert ON public.project_billing_cycle_revisions;
CREATE POLICY project_billing_cycle_revisions_tenant_insert ON public.project_billing_cycle_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_revisions.cycle_id
        AND c.organization_id = project_billing_cycle_revisions.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_revisions_tenant_update ON public.project_billing_cycle_revisions;
CREATE POLICY project_billing_cycle_revisions_tenant_update ON public.project_billing_cycle_revisions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_revisions.cycle_id
        AND c.organization_id = project_billing_cycle_revisions.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_revisions.cycle_id
        AND c.organization_id = project_billing_cycle_revisions.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_revisions_tenant_delete ON public.project_billing_cycle_revisions;
CREATE POLICY project_billing_cycle_revisions_tenant_delete ON public.project_billing_cycle_revisions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.manage')
    AND EXISTS (
      SELECT 1
      FROM public.project_billing_cycles c
      WHERE c.id = project_billing_cycle_revisions.cycle_id
        AND c.organization_id = project_billing_cycle_revisions.organization_id
        AND app.can_access_project(c.organization_id, c.project_id)
    )
  );

DROP POLICY IF EXISTS project_billing_cycle_revisions_service_all ON public.project_billing_cycle_revisions;
CREATE POLICY project_billing_cycle_revisions_service_all ON public.project_billing_cycle_revisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.billing_plan_templates IS
  'Org-scoped reusable billing plan templates (rows_json definitions).';
COMMENT ON TABLE public.project_billing_plans IS
  'Per-project/per-contract billing plan. At most one active plan per contract. Delete blocked when submitted/approved cycles exist.';
COMMENT ON TABLE public.project_billing_cycles IS
  'Progress / partial accounts from a billing plan. Status: draft|ready|submitted|partially_approved|approved|void. Editable until linked AR is fully paid; void/fully-paid require app.billing_plan_history_write=on.';
COMMENT ON COLUMN public.project_billing_cycles.submitted_at IS
  'Set when the cycle is submitted (links AR via billing_record_id).';
COMMENT ON COLUMN public.project_billing_cycle_lines.current_amount IS
  'Working requested amount (draft edits). Synced to requested_amount on submit/revise.';
COMMENT ON COLUMN public.project_billing_cycle_lines.requested_amount IS
  'Last submitted request snapshot (copied from current_* on submit/revise).';
COMMENT ON COLUMN public.project_billing_cycle_lines.approved_amount IS
  'Customer-approved amount. cumulative = prior + coalesce(approved, 0).';
COMMENT ON COLUMN public.project_billing_plan_lines.agreed_amount_snapshot IS
  'Frozen agreed amount after first submitted cycle; do not rewrite when editing future cycles.';
COMMENT ON TABLE public.project_billing_cycle_revisions IS
  'Immutable snapshots of cycle header + lines at each revision_number.';
COMMENT ON COLUMN public.billing_records.source_kind IS
  'manual | boq_progress | work_order | retention_release | billing_plan';
