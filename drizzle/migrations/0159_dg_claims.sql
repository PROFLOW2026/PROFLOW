-- 0159: Developer / GC layer - contractor progress claims, certification, retention, advances,
-- deductions, payment holds, AP integration (Track F).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 + 0155 + 0158.
--
-- PURPOSE
--   1. subcontract_claims (header: project / vendor / agreement / period / number / status, NO money)
--      + subcontract_claim_sequences + app.subcontract_claim_assign_number(): CLM-n per agreement
--   2. subcontract_claim_revisions: every submission is an immutable revision; a return-for-correction
--      opens a new revision (the submitted one is never edited)
--   3. subcontract_claim_lines (one per claim + work line) + subcontract_claim_line_submissions
--      (NET amounts claimed per revision, with a snapshot of baseline / approved changes / revised value /
--      prior certified at submission)
--   4. subcontract_claim_assessments: append-only decisions (certify / reassess / reject_line / return /
--      request_evidence). Submitted 80, certified 60, reassessed 70 are three preserved facts.
--   5. subcontract_claim_payable_bases: append-only certification -> payable basis (retention, advance
--      recovery, deductions, payable NET); only the draft AP bill link may be set later.
--   6. subcontract_deductions (append-only, reversal = new row) + subcontract_deduction_disputes
--   7. subcontract_payment_holds (manual holds; only the release columns may be set, once)
--   8. SECURITY DEFINER read ports with built-in authorization (claim.view / ext.claim.*, payment.view /
--      ext.payment.view): contract basis per work line, agreement terms + advance position, AP payment facts.
--   9. RLS: internal = app.has_project_capability (claim.view / claim.review / claim.certify /
--      deductions.manage / payment.view / payment.manage); external = app.external_has_scope with
--      ext.claim.view / ext.claim.submit / ext.payment.view on the row's vendor/agreement.
--
-- FINANCIAL INVARIANTS: all claim amounts are NET. VAT exists only on the AP bill. A certification never
-- creates a payment or a posted AP bill; at most a DRAFT AP bill (ap_bills.status = 'draft').
-- Retention is cash timing (does not reduce certified work). Advance recovery reads subcontract_advances.
--
-- COMPATIBILITY: additive (new tables / functions / triggers only).

--------------------------------------------------------------------------------
-- 0. Shared helpers
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_claims_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

--------------------------------------------------------------------------------
-- 1. Claim header + numbering
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_claim_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, agreement_id),
  CONSTRAINT subcontract_claim_sequences_non_negative CHECK (last_number >= 0)
);

ALTER TABLE public.subcontract_claim_sequences DROP CONSTRAINT IF EXISTS subcontract_claim_sequences_agreement_fk;
ALTER TABLE public.subcontract_claim_sequences
  ADD CONSTRAINT subcontract_claim_sequences_agreement_fk
  FOREIGN KEY (agreement_id, organization_id)
  REFERENCES public.subcontract_agreements (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.subcontract_claim_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subcontract_claim_sequences_service_all ON public.subcontract_claim_sequences;
CREATE POLICY subcontract_claim_sequences_service_all ON public.subcontract_claim_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.subcontract_claim_sequences FROM authenticated;
GRANT ALL PRIVILEGES ON public.subcontract_claim_sequences TO service_role;

CREATE OR REPLACE FUNCTION app.subcontract_claim_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  next_number integer;
BEGIN
  INSERT INTO public.subcontract_claim_sequences AS s (organization_id, agreement_id, last_number)
  VALUES (NEW.organization_id, NEW.agreement_id, 1)
  ON CONFLICT (organization_id, agreement_id)
  DO UPDATE SET last_number = s.last_number + 1
  RETURNING s.last_number INTO next_number;
  NEW.claim_number := next_number;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_claim_assign_number() FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.subcontract_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  claim_number integer NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'draft',
  current_revision_no integer NOT NULL DEFAULT 1,
  currency char(3) NOT NULL,
  created_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  review_started_at timestamptz,
  returned_at timestamptz,
  certified_at timestamptz,
  last_reassessed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_claims_status_known CHECK (
    status IN ('draft', 'submitted', 'under_review', 'returned', 'certified', 'cancelled')
  ),
  CONSTRAINT subcontract_claims_period_order CHECK (period_end >= period_start),
  CONSTRAINT subcontract_claims_title_len CHECK (title IS NULL OR length(title) <= 200),
  CONSTRAINT subcontract_claims_revision_positive CHECK (current_revision_no >= 1),
  CONSTRAINT subcontract_claims_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT subcontract_claims_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_user_id IS NULL)
  )
);

ALTER TABLE public.subcontract_claims DROP CONSTRAINT IF EXISTS subcontract_claims_project_org_fk;
ALTER TABLE public.subcontract_claims
  ADD CONSTRAINT subcontract_claims_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claims DROP CONSTRAINT IF EXISTS subcontract_claims_agreement_project_fk;
ALTER TABLE public.subcontract_claims
  ADD CONSTRAINT subcontract_claims_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_claims DROP CONSTRAINT IF EXISTS subcontract_claims_agreement_vendor_fk;
ALTER TABLE public.subcontract_claims
  ADD CONSTRAINT subcontract_claims_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claims_id_organization_id_uq
  ON public.subcontract_claims (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claims_id_org_project_uq
  ON public.subcontract_claims (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claims_id_org_agreement_uq
  ON public.subcontract_claims (id, organization_id, agreement_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claims_agreement_number_uq
  ON public.subcontract_claims (organization_id, agreement_id, claim_number);
-- One claim in progress per agreement: "prior certified cumulative" is always well defined.
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claims_one_open_per_agreement_uq
  ON public.subcontract_claims (organization_id, agreement_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'returned');
CREATE INDEX IF NOT EXISTS subcontract_claims_project_status_idx
  ON public.subcontract_claims (organization_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS subcontract_claims_vendor_project_idx
  ON public.subcontract_claims (organization_id, vendor_id, project_id);
CREATE INDEX IF NOT EXISTS subcontract_claims_awaiting_review_idx
  ON public.subcontract_claims (organization_id, submitted_at)
  WHERE status IN ('submitted', 'under_review');

DROP TRIGGER IF EXISTS subcontract_claims_assign_number ON public.subcontract_claims;
CREATE TRIGGER subcontract_claims_assign_number
  BEFORE INSERT ON public.subcontract_claims
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claim_assign_number();

-- Identity never changes; lifecycle follows the state machine; a contractor only moves its own draft
-- forward (submit / cancel) or reopens a returned claim (new revision). Review stamps are internal-only.
CREATE OR REPLACE FUNCTION app.subcontract_claims_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  external_actor boolean := app.external_principal_id() IS NOT NULL
    AND NOT app.is_org_member(OLD.organization_id);
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.vendor_id, NEW.agreement_id, NEW.claim_number,
      NEW.currency, NEW.created_actor_type, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.vendor_id, OLD.agreement_id, OLD.claim_number,
      OLD.currency, OLD.created_actor_type, OLD.created_at)
     OR (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id AND NEW.created_by_user_id IS NOT NULL)
     OR (NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id
         AND NEW.created_by_principal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'subcontract_claims: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
    OR (OLD.status = 'returned' AND NEW.status = 'draft')
    OR (NOT external_actor AND (
      (OLD.status = 'submitted' AND NEW.status IN ('under_review', 'returned', 'certified'))
      OR (OLD.status = 'under_review' AND NEW.status IN ('returned', 'certified'))
      OR (OLD.status = 'returned' AND NEW.status = 'cancelled')))
  ) THEN
    RAISE EXCEPTION 'subcontract_claims: transition % -> % not allowed', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  IF NEW.current_revision_no < OLD.current_revision_no
     OR (NEW.current_revision_no <> OLD.current_revision_no AND NOT (OLD.status = 'returned' AND NEW.status = 'draft'))
  THEN
    RAISE EXCEPTION 'subcontract_claims: a new revision opens only from a returned claim' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.period_start, NEW.period_end, NEW.title)
     IS DISTINCT FROM (OLD.period_start, OLD.period_end, OLD.title) THEN
    RAISE EXCEPTION 'subcontract_claims: period is frozen once submitted' USING ERRCODE = '42501';
  END IF;
  IF external_actor AND (NEW.review_started_at, NEW.returned_at, NEW.certified_at, NEW.last_reassessed_at)
     IS DISTINCT FROM (OLD.review_started_at, OLD.returned_at, OLD.certified_at, OLD.last_reassessed_at) THEN
    RAISE EXCEPTION 'subcontract_claims: review stamps are internal' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_claims_guard_update ON public.subcontract_claims;
CREATE TRIGGER subcontract_claims_guard_update
  BEFORE UPDATE ON public.subcontract_claims
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claims_guard_update();

DROP TRIGGER IF EXISTS subcontract_claims_no_delete ON public.subcontract_claims;
CREATE TRIGGER subcontract_claims_no_delete
  BEFORE DELETE ON public.subcontract_claims
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.subcontract_claims_append_only();

--------------------------------------------------------------------------------
-- 2. Revisions (immutable once submitted)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_claim_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  revision_no integer NOT NULL,
  note text,
  submitted_at timestamptz,
  submitted_actor_type text,
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_claim_revisions_no_positive CHECK (revision_no >= 1),
  CONSTRAINT subcontract_claim_revisions_note_len CHECK (note IS NULL OR length(note) <= 4000),
  CONSTRAINT subcontract_claim_revisions_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_user_id IS NULL)
  ),
  CONSTRAINT subcontract_claim_revisions_submitted_shape CHECK (
    (submitted_at IS NULL AND submitted_actor_type IS NULL
      AND submitted_by_user_id IS NULL AND submitted_by_principal_id IS NULL)
    OR (submitted_at IS NOT NULL AND submitted_actor_type = 'internal' AND submitted_by_principal_id IS NULL)
    OR (submitted_at IS NOT NULL AND submitted_actor_type = 'external' AND submitted_by_user_id IS NULL)
  )
);

ALTER TABLE public.subcontract_claim_revisions DROP CONSTRAINT IF EXISTS subcontract_claim_revisions_claim_fk;
ALTER TABLE public.subcontract_claim_revisions
  ADD CONSTRAINT subcontract_claim_revisions_claim_fk
  FOREIGN KEY (claim_id, organization_id, project_id)
  REFERENCES public.subcontract_claims (id, organization_id, project_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_revisions_claim_no_uq
  ON public.subcontract_claim_revisions (organization_id, claim_id, revision_no);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_revisions_id_org_claim_uq
  ON public.subcontract_claim_revisions (id, organization_id, claim_id);

CREATE OR REPLACE FUNCTION app.subcontract_claim_revisions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'subcontract_claim_revisions are never deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'subcontract_claim_revisions: a submitted revision is immutable' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.claim_id, NEW.revision_no, NEW.created_actor_type,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.claim_id, OLD.revision_no, OLD.created_actor_type,
      OLD.created_at) THEN
    RAISE EXCEPTION 'subcontract_claim_revisions: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_claim_revisions_guard ON public.subcontract_claim_revisions;
CREATE TRIGGER subcontract_claim_revisions_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_claim_revisions
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claim_revisions_guard();

--------------------------------------------------------------------------------
-- 3. Claim lines + per-revision submissions
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  work_line_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subcontract_claim_lines DROP CONSTRAINT IF EXISTS subcontract_claim_lines_claim_fk;
ALTER TABLE public.subcontract_claim_lines
  ADD CONSTRAINT subcontract_claim_lines_claim_fk
  FOREIGN KEY (claim_id, organization_id, agreement_id)
  REFERENCES public.subcontract_claims (id, organization_id, agreement_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claim_lines DROP CONSTRAINT IF EXISTS subcontract_claim_lines_work_line_fk;
ALTER TABLE public.subcontract_claim_lines
  ADD CONSTRAINT subcontract_claim_lines_work_line_fk
  FOREIGN KEY (work_line_id, organization_id, agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_lines_claim_work_line_uq
  ON public.subcontract_claim_lines (organization_id, claim_id, work_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_lines_id_org_claim_uq
  ON public.subcontract_claim_lines (id, organization_id, claim_id);
CREATE INDEX IF NOT EXISTS subcontract_claim_lines_work_line_idx
  ON public.subcontract_claim_lines (organization_id, work_line_id);

DROP TRIGGER IF EXISTS subcontract_claim_lines_append_only ON public.subcontract_claim_lines;
CREATE TRIGGER subcontract_claim_lines_append_only
  BEFORE UPDATE ON public.subcontract_claim_lines
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claims_append_only();

CREATE TABLE IF NOT EXISTS public.subcontract_claim_line_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  claim_line_id uuid NOT NULL,
  currency char(3) NOT NULL,
  current_amount numeric(18,6) NOT NULL,
  cumulative_amount numeric(18,6) NOT NULL,
  progress_percent numeric(9,4),
  cumulative_quantity numeric(18,6),
  note text,
  -- Snapshot at the time the revision was prepared/submitted (all NET).
  contract_baseline numeric(18,6) NOT NULL DEFAULT 0,
  approved_changes numeric(18,6) NOT NULL DEFAULT 0,
  revised_value numeric(18,6) NOT NULL DEFAULT 0,
  prior_certified numeric(18,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_claim_line_submissions_cumulative_non_negative CHECK (cumulative_amount >= 0),
  CONSTRAINT subcontract_claim_line_submissions_cumulative_math CHECK (
    cumulative_amount = prior_certified + current_amount
  ),
  CONSTRAINT subcontract_claim_line_submissions_progress_range CHECK (
    progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100)
  ),
  CONSTRAINT subcontract_claim_line_submissions_quantity_non_negative CHECK (
    cumulative_quantity IS NULL OR cumulative_quantity >= 0
  ),
  CONSTRAINT subcontract_claim_line_submissions_note_len CHECK (note IS NULL OR length(note) <= 2000),
  CONSTRAINT subcontract_claim_line_submissions_currency_upper CHECK (currency = upper(currency))
);

ALTER TABLE public.subcontract_claim_line_submissions DROP CONSTRAINT IF EXISTS subcontract_claim_line_submissions_revision_fk;
ALTER TABLE public.subcontract_claim_line_submissions
  ADD CONSTRAINT subcontract_claim_line_submissions_revision_fk
  FOREIGN KEY (revision_id, organization_id, claim_id)
  REFERENCES public.subcontract_claim_revisions (id, organization_id, claim_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claim_line_submissions DROP CONSTRAINT IF EXISTS subcontract_claim_line_submissions_line_fk;
ALTER TABLE public.subcontract_claim_line_submissions
  ADD CONSTRAINT subcontract_claim_line_submissions_line_fk
  FOREIGN KEY (claim_line_id, organization_id, claim_id)
  REFERENCES public.subcontract_claim_lines (id, organization_id, claim_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_line_submissions_revision_line_uq
  ON public.subcontract_claim_line_submissions (organization_id, revision_id, claim_line_id);
CREATE INDEX IF NOT EXISTS subcontract_claim_line_submissions_claim_idx
  ON public.subcontract_claim_line_submissions (organization_id, claim_id);

-- Rows of a submitted revision are frozen (no insert / update / delete).
CREATE OR REPLACE FUNCTION app.subcontract_claim_line_submissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  target_revision uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  target_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  is_submitted boolean;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  SELECT r.submitted_at IS NOT NULL INTO is_submitted
  FROM public.subcontract_claim_revisions r
  WHERE r.id = target_revision AND r.organization_id = target_org;
  IF is_submitted THEN
    RAISE EXCEPTION 'subcontract_claim_line_submissions: the revision is submitted and immutable'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.organization_id, NEW.claim_id, NEW.revision_id, NEW.claim_line_id,
      NEW.currency, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.claim_id, OLD.revision_id, OLD.claim_line_id,
      OLD.currency, OLD.created_at) THEN
    RAISE EXCEPTION 'subcontract_claim_line_submissions: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_claim_line_submissions_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS subcontract_claim_line_submissions_guard ON public.subcontract_claim_line_submissions;
CREATE TRIGGER subcontract_claim_line_submissions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.subcontract_claim_line_submissions
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claim_line_submissions_guard();

--------------------------------------------------------------------------------
-- 4. Assessments (append-only decisions)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_claim_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  claim_line_id uuid,
  decision text NOT NULL,
  certified_amount numeric(18,6),
  currency char(3) NOT NULL,
  reason text,
  supersedes_assessment_id uuid,
  assessor_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_claim_assessments_decision_known CHECK (
    decision IN ('certify', 'reassess', 'reject_line', 'return', 'request_evidence')
  ),
  CONSTRAINT subcontract_claim_assessments_reason_len CHECK (reason IS NULL OR length(reason) <= 4000),
  CONSTRAINT subcontract_claim_assessments_amount_non_negative CHECK (
    certified_amount IS NULL OR certified_amount >= 0
  ),
  CONSTRAINT subcontract_claim_assessments_shape CHECK (
    (decision = 'certify' AND claim_line_id IS NOT NULL AND certified_amount IS NOT NULL)
    OR (decision = 'reassess' AND claim_line_id IS NOT NULL AND certified_amount IS NOT NULL
      AND reason IS NOT NULL AND length(btrim(reason)) > 0)
    OR (decision = 'reject_line' AND claim_line_id IS NOT NULL AND certified_amount = 0
      AND reason IS NOT NULL AND length(btrim(reason)) > 0)
    OR (decision = 'return' AND claim_line_id IS NULL AND certified_amount IS NULL
      AND reason IS NOT NULL AND length(btrim(reason)) > 0)
    OR (decision = 'request_evidence' AND certified_amount IS NULL
      AND reason IS NOT NULL AND length(btrim(reason)) > 0)
  ),
  CONSTRAINT subcontract_claim_assessments_currency_upper CHECK (currency = upper(currency))
);

ALTER TABLE public.subcontract_claim_assessments DROP CONSTRAINT IF EXISTS subcontract_claim_assessments_revision_fk;
ALTER TABLE public.subcontract_claim_assessments
  ADD CONSTRAINT subcontract_claim_assessments_revision_fk
  FOREIGN KEY (revision_id, organization_id, claim_id)
  REFERENCES public.subcontract_claim_revisions (id, organization_id, claim_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claim_assessments DROP CONSTRAINT IF EXISTS subcontract_claim_assessments_line_fk;
ALTER TABLE public.subcontract_claim_assessments
  ADD CONSTRAINT subcontract_claim_assessments_line_fk
  FOREIGN KEY (claim_line_id, organization_id, claim_id)
  REFERENCES public.subcontract_claim_lines (id, organization_id, claim_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claim_assessments DROP CONSTRAINT IF EXISTS subcontract_claim_assessments_project_fk;
ALTER TABLE public.subcontract_claim_assessments
  ADD CONSTRAINT subcontract_claim_assessments_project_fk
  FOREIGN KEY (claim_id, organization_id, project_id)
  REFERENCES public.subcontract_claims (id, organization_id, project_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_assessments_id_org_claim_uq
  ON public.subcontract_claim_assessments (id, organization_id, claim_id);
ALTER TABLE public.subcontract_claim_assessments DROP CONSTRAINT IF EXISTS subcontract_claim_assessments_supersedes_fk;
ALTER TABLE public.subcontract_claim_assessments
  ADD CONSTRAINT subcontract_claim_assessments_supersedes_fk
  FOREIGN KEY (supersedes_assessment_id, organization_id, claim_id)
  REFERENCES public.subcontract_claim_assessments (id, organization_id, claim_id);
CREATE INDEX IF NOT EXISTS subcontract_claim_assessments_claim_idx
  ON public.subcontract_claim_assessments (organization_id, claim_id, seq);
CREATE INDEX IF NOT EXISTS subcontract_claim_assessments_line_idx
  ON public.subcontract_claim_assessments (organization_id, claim_line_id, seq)
  WHERE claim_line_id IS NOT NULL;

-- Decisions are recorded only against a submitted revision.
CREATE OR REPLACE FUNCTION app.subcontract_claim_assessments_require_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subcontract_claim_revisions r
    WHERE r.id = NEW.revision_id AND r.organization_id = NEW.organization_id
      AND r.claim_id = NEW.claim_id AND r.submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'subcontract_claim_assessments: revision is not submitted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_claim_assessments_require_submitted() FROM PUBLIC;

DROP TRIGGER IF EXISTS subcontract_claim_assessments_require_submitted ON public.subcontract_claim_assessments;
CREATE TRIGGER subcontract_claim_assessments_require_submitted
  BEFORE INSERT ON public.subcontract_claim_assessments
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claim_assessments_require_submitted();

DROP TRIGGER IF EXISTS subcontract_claim_assessments_append_only ON public.subcontract_claim_assessments;
CREATE TRIGGER subcontract_claim_assessments_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_claim_assessments
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.subcontract_claims_append_only();

--------------------------------------------------------------------------------
-- 5. Payable bases (certification -> payable basis -> draft AP bill)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_claim_payable_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  version integer NOT NULL,
  source_decision text NOT NULL,
  currency char(3) NOT NULL,
  certified_total numeric(18,6) NOT NULL,
  certified_delta numeric(18,6) NOT NULL,
  retention_percent numeric(9,4),
  retention_amount numeric(18,6) NOT NULL DEFAULT 0,
  advance_recovery_amount numeric(18,6) NOT NULL DEFAULT 0,
  deductions_amount numeric(18,6) NOT NULL DEFAULT 0,
  payable_net numeric(18,6) NOT NULL,
  ap_bill_status text NOT NULL,
  ap_bill_id uuid,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_claim_payable_bases_version_positive CHECK (version >= 1),
  CONSTRAINT subcontract_claim_payable_bases_source_known CHECK (source_decision IN ('certify', 'reassess')),
  CONSTRAINT subcontract_claim_payable_bases_total_non_negative CHECK (certified_total >= 0),
  CONSTRAINT subcontract_claim_payable_bases_deductions_non_negative CHECK (deductions_amount >= 0),
  CONSTRAINT subcontract_claim_payable_bases_math CHECK (
    payable_net = certified_delta - retention_amount - advance_recovery_amount - deductions_amount
  ),
  CONSTRAINT subcontract_claim_payable_bases_ap_status_known CHECK (
    ap_bill_status IN ('pending', 'requested', 'created', 'not_required', 'credit_required')
  ),
  CONSTRAINT subcontract_claim_payable_bases_ap_shape CHECK (
    (ap_bill_status = 'created') = (ap_bill_id IS NOT NULL)
  ),
  CONSTRAINT subcontract_claim_payable_bases_currency_upper CHECK (currency = upper(currency))
);

ALTER TABLE public.subcontract_claim_payable_bases DROP CONSTRAINT IF EXISTS subcontract_claim_payable_bases_claim_fk;
ALTER TABLE public.subcontract_claim_payable_bases
  ADD CONSTRAINT subcontract_claim_payable_bases_claim_fk
  FOREIGN KEY (claim_id, organization_id, agreement_id)
  REFERENCES public.subcontract_claims (id, organization_id, agreement_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_claim_payable_bases DROP CONSTRAINT IF EXISTS subcontract_claim_payable_bases_agreement_fk;
ALTER TABLE public.subcontract_claim_payable_bases
  ADD CONSTRAINT subcontract_claim_payable_bases_agreement_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_claim_payable_bases DROP CONSTRAINT IF EXISTS subcontract_claim_payable_bases_ap_bill_fk;
ALTER TABLE public.subcontract_claim_payable_bases
  ADD CONSTRAINT subcontract_claim_payable_bases_ap_bill_fk
  FOREIGN KEY (ap_bill_id, organization_id)
  REFERENCES public.ap_bills (id, organization_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_payable_bases_claim_version_uq
  ON public.subcontract_claim_payable_bases (organization_id, claim_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_payable_bases_ap_bill_uq
  ON public.subcontract_claim_payable_bases (organization_id, ap_bill_id) WHERE ap_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subcontract_claim_payable_bases_agreement_idx
  ON public.subcontract_claim_payable_bases (organization_id, agreement_id, created_at);

-- Only the AP-bill link moves: pending -> requested -> created (or requested -> pending on failure).
CREATE OR REPLACE FUNCTION app.subcontract_claim_payable_bases_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'subcontract_claim_payable_bases are never deleted' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.vendor_id, NEW.agreement_id, NEW.claim_id, NEW.version,
      NEW.source_decision, NEW.currency, NEW.certified_total, NEW.certified_delta, NEW.retention_percent,
      NEW.retention_amount, NEW.advance_recovery_amount, NEW.deductions_amount, NEW.payable_net,
      NEW.created_by_user_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.vendor_id, OLD.agreement_id, OLD.claim_id, OLD.version,
      OLD.source_decision, OLD.currency, OLD.certified_total, OLD.certified_delta, OLD.retention_percent,
      OLD.retention_amount, OLD.advance_recovery_amount, OLD.deductions_amount, OLD.payable_net,
      OLD.created_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'subcontract_claim_payable_bases: amounts are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.ap_bill_status IS DISTINCT FROM OLD.ap_bill_status AND NOT (
    (OLD.ap_bill_status = 'pending' AND NEW.ap_bill_status = 'requested')
    OR (OLD.ap_bill_status = 'requested' AND NEW.ap_bill_status IN ('pending', 'created'))
  ) THEN
    RAISE EXCEPTION 'subcontract_claim_payable_bases: AP link % -> % not allowed', OLD.ap_bill_status,
      NEW.ap_bill_status USING ERRCODE = '23514';
  END IF;
  IF OLD.ap_bill_id IS NOT NULL AND NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id THEN
    RAISE EXCEPTION 'subcontract_claim_payable_bases: AP bill link is permanent' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_claim_payable_bases_guard ON public.subcontract_claim_payable_bases;
CREATE TRIGGER subcontract_claim_payable_bases_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_claim_payable_bases
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_claim_payable_bases_guard();

--------------------------------------------------------------------------------
-- 6. Deductions / back-charges (append-only, reversal = new row) + disputes
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  claim_id uuid,
  entry_kind text NOT NULL DEFAULT 'issue',
  reversal_of_id uuid,
  deduction_type text NOT NULL,
  amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  reason text NOT NULL,
  contractor_visible boolean NOT NULL DEFAULT true,
  issued_by_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_deductions_kind_known CHECK (entry_kind IN ('issue', 'reversal')),
  CONSTRAINT subcontract_deductions_type_known CHECK (
    deduction_type IN ('back_charge', 'penalty', 'damage', 'materials', 'cleanup', 'safety', 'other')
  ),
  CONSTRAINT subcontract_deductions_amount_positive CHECK (amount > 0),
  CONSTRAINT subcontract_deductions_reason_not_blank CHECK (length(btrim(reason)) > 0 AND length(reason) <= 4000),
  CONSTRAINT subcontract_deductions_reversal_shape CHECK (
    (entry_kind = 'issue' AND reversal_of_id IS NULL)
    OR (entry_kind = 'reversal' AND reversal_of_id IS NOT NULL)
  ),
  CONSTRAINT subcontract_deductions_currency_upper CHECK (currency = upper(currency))
);

ALTER TABLE public.subcontract_deductions DROP CONSTRAINT IF EXISTS subcontract_deductions_agreement_project_fk;
ALTER TABLE public.subcontract_deductions
  ADD CONSTRAINT subcontract_deductions_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_deductions DROP CONSTRAINT IF EXISTS subcontract_deductions_agreement_vendor_fk;
ALTER TABLE public.subcontract_deductions
  ADD CONSTRAINT subcontract_deductions_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_deductions DROP CONSTRAINT IF EXISTS subcontract_deductions_claim_fk;
ALTER TABLE public.subcontract_deductions
  ADD CONSTRAINT subcontract_deductions_claim_fk
  FOREIGN KEY (claim_id, organization_id, agreement_id)
  REFERENCES public.subcontract_claims (id, organization_id, agreement_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_deductions_id_org_agreement_uq
  ON public.subcontract_deductions (id, organization_id, agreement_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_deductions_id_organization_id_uq
  ON public.subcontract_deductions (id, organization_id);
ALTER TABLE public.subcontract_deductions DROP CONSTRAINT IF EXISTS subcontract_deductions_reversal_fk;
ALTER TABLE public.subcontract_deductions
  ADD CONSTRAINT subcontract_deductions_reversal_fk
  FOREIGN KEY (reversal_of_id, organization_id, agreement_id)
  REFERENCES public.subcontract_deductions (id, organization_id, agreement_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_deductions_one_reversal_uq
  ON public.subcontract_deductions (organization_id, reversal_of_id) WHERE reversal_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subcontract_deductions_project_idx
  ON public.subcontract_deductions (organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subcontract_deductions_agreement_idx
  ON public.subcontract_deductions (organization_id, agreement_id);

-- A reversal mirrors exactly one issued deduction (same amount / currency / type / visibility).
CREATE OR REPLACE FUNCTION app.subcontract_deductions_check_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  original public.subcontract_deductions%ROWTYPE;
BEGIN
  IF NEW.entry_kind <> 'reversal' THEN RETURN NEW; END IF;
  SELECT * INTO original FROM public.subcontract_deductions d
  WHERE d.id = NEW.reversal_of_id AND d.organization_id = NEW.organization_id;
  IF original.id IS NULL OR original.entry_kind <> 'issue'
     OR (original.amount, original.currency, original.deduction_type, original.contractor_visible,
         original.agreement_id)
        IS DISTINCT FROM (NEW.amount, NEW.currency, NEW.deduction_type, NEW.contractor_visible, NEW.agreement_id) THEN
    RAISE EXCEPTION 'subcontract_deductions: a reversal must mirror its issued deduction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_deductions_check_reversal() FROM PUBLIC;

DROP TRIGGER IF EXISTS subcontract_deductions_check_reversal ON public.subcontract_deductions;
CREATE TRIGGER subcontract_deductions_check_reversal
  BEFORE INSERT ON public.subcontract_deductions
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_deductions_check_reversal();

DROP TRIGGER IF EXISTS subcontract_deductions_append_only ON public.subcontract_deductions;
CREATE TRIGGER subcontract_deductions_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_deductions
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.subcontract_claims_append_only();

CREATE TABLE IF NOT EXISTS public.subcontract_deduction_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  deduction_id uuid NOT NULL,
  comment text NOT NULL,
  actor_type text NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_deduction_disputes_comment_not_blank CHECK (
    length(btrim(comment)) > 0 AND length(comment) <= 4000
  ),
  CONSTRAINT subcontract_deduction_disputes_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_user_id IS NULL)
  )
);

ALTER TABLE public.subcontract_deduction_disputes DROP CONSTRAINT IF EXISTS subcontract_deduction_disputes_deduction_fk;
ALTER TABLE public.subcontract_deduction_disputes
  ADD CONSTRAINT subcontract_deduction_disputes_deduction_fk
  FOREIGN KEY (deduction_id, organization_id, agreement_id)
  REFERENCES public.subcontract_deductions (id, organization_id, agreement_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS subcontract_deduction_disputes_deduction_idx
  ON public.subcontract_deduction_disputes (organization_id, deduction_id, created_at);

DROP TRIGGER IF EXISTS subcontract_deduction_disputes_append_only ON public.subcontract_deduction_disputes;
CREATE TRIGGER subcontract_deduction_disputes_append_only
  BEFORE UPDATE OR DELETE ON public.subcontract_deduction_disputes
  FOR EACH ROW WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION app.subcontract_claims_append_only();

--------------------------------------------------------------------------------
-- 7. Payment holds (eligibility, separate from certification)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_payment_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  claim_id uuid,
  hold_kind text NOT NULL,
  note text,
  contractor_visible boolean NOT NULL DEFAULT true,
  placed_by_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  release_note text,
  CONSTRAINT subcontract_payment_holds_kind_known CHECK (
    hold_kind IN ('missing_invoice', 'missing_tax_document', 'guarantee', 'handover_document', 'insurance',
      'compliance', 'other')
  ),
  CONSTRAINT subcontract_payment_holds_note_len CHECK (note IS NULL OR length(note) <= 2000),
  CONSTRAINT subcontract_payment_holds_release_note_len CHECK (release_note IS NULL OR length(release_note) <= 2000),
  CONSTRAINT subcontract_payment_holds_release_shape CHECK (
    (released_at IS NULL AND release_note IS NULL) OR released_at IS NOT NULL
  )
);

ALTER TABLE public.subcontract_payment_holds DROP CONSTRAINT IF EXISTS subcontract_payment_holds_agreement_project_fk;
ALTER TABLE public.subcontract_payment_holds
  ADD CONSTRAINT subcontract_payment_holds_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_payment_holds DROP CONSTRAINT IF EXISTS subcontract_payment_holds_agreement_vendor_fk;
ALTER TABLE public.subcontract_payment_holds
  ADD CONSTRAINT subcontract_payment_holds_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE RESTRICT;
ALTER TABLE public.subcontract_payment_holds DROP CONSTRAINT IF EXISTS subcontract_payment_holds_claim_fk;
ALTER TABLE public.subcontract_payment_holds
  ADD CONSTRAINT subcontract_payment_holds_claim_fk
  FOREIGN KEY (claim_id, organization_id, agreement_id)
  REFERENCES public.subcontract_claims (id, organization_id, agreement_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS subcontract_payment_holds_agreement_open_idx
  ON public.subcontract_payment_holds (organization_id, agreement_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS subcontract_payment_holds_project_idx
  ON public.subcontract_payment_holds (organization_id, project_id, created_at DESC);

CREATE OR REPLACE FUNCTION app.subcontract_payment_holds_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'subcontract_payment_holds are never deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'subcontract_payment_holds: a released hold is final' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.vendor_id, NEW.agreement_id, NEW.claim_id, NEW.hold_kind,
      NEW.note, NEW.contractor_visible, NEW.placed_by_user_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.vendor_id, OLD.agreement_id, OLD.claim_id, OLD.hold_kind,
      OLD.note, OLD.contractor_visible, OLD.placed_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'subcontract_payment_holds: only the release may be recorded' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS subcontract_payment_holds_guard ON public.subcontract_payment_holds;
CREATE TRIGGER subcontract_payment_holds_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_payment_holds
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_payment_holds_guard();

--------------------------------------------------------------------------------
-- 8. Authorized read ports (SECURITY DEFINER; authorization is checked inside)
--------------------------------------------------------------------------------

-- Claim-scope access to an agreement: internal claim.view, or the contractor of the agreement with
-- ext.claim.view / ext.claim.submit. Raises 42501 otherwise (no rows leak).
CREATE OR REPLACE FUNCTION app.subcontract_claim_agreement_access(
  p_organization_id uuid,
  p_agreement_id uuid,
  p_internal_capability text,
  p_external_capabilities text[]
)
RETURNS TABLE (project_id uuid, vendor_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
  v_vendor uuid;
  allowed boolean := false;
  cap text;
BEGIN
  SELECT a.project_id, a.vendor_id INTO v_project, v_vendor
  FROM public.subcontract_agreements a
  WHERE a.id = p_agreement_id AND a.organization_id = p_organization_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'subcontract claim access denied' USING ERRCODE = '42501';
  END IF;
  IF app.is_org_member(p_organization_id) THEN
    allowed := app.has_project_capability(p_organization_id, v_project, p_internal_capability);
  ELSIF app.external_principal_id() IS NOT NULL AND app.external_can_see_project(p_organization_id, v_project) THEN
    FOREACH cap IN ARRAY p_external_capabilities LOOP
      IF app.external_has_scope(p_organization_id, v_project, v_vendor, p_agreement_id, cap) THEN
        allowed := true;
      END IF;
    END LOOP;
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'subcontract claim access denied' USING ERRCODE = '42501';
  END IF;
  project_id := v_project;
  vendor_id := v_vendor;
  RETURN NEXT;
END
$fn$;

-- Contract value inputs per work line (baseline price, approved-change ledger) for claim math.
CREATE OR REPLACE FUNCTION app.subcontract_claim_contract_basis(
  p_organization_id uuid,
  p_agreement_id uuid
)
RETURNS TABLE (
  work_line_id uuid,
  parent_line_id uuid,
  code text,
  description text,
  unit text,
  quantity numeric,
  sort_order integer,
  line_status text,
  location_id uuid,
  line_type text,
  is_baseline boolean,
  contract_amount numeric,
  adjustment_amount numeric,
  adjustment_quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM app.subcontract_claim_agreement_access(p_organization_id, p_agreement_id, 'claim.view',
    ARRAY['ext.claim.view', 'ext.claim.submit']);
  RETURN QUERY
  SELECT l.id, l.parent_line_id, l.code, l.description, l.unit, l.quantity, l.sort_order, l.status,
    l.location_id,
    COALESCE(attr.line_type, 'quantity_rate'),
    COALESCE(attr.is_baseline, true),
    COALESCE(p.contract_amount, 0),
    COALESCE(adj.amount, 0),
    COALESCE(adj.qty, 0)
  FROM public.subcontract_work_lines l
  LEFT JOIN public.subcontract_work_line_prices p
    ON p.work_line_id = l.id AND p.organization_id = l.organization_id
  LEFT JOIN public.subcontract_work_line_attributes attr
    ON attr.work_line_id = l.id AND attr.organization_id = l.organization_id
  LEFT JOIN LATERAL (
    SELECT SUM(a.amount_delta) AS amount, SUM(a.quantity_delta) AS qty
    FROM public.subcontract_work_line_adjustments a
    WHERE a.work_line_id = l.id AND a.organization_id = l.organization_id
  ) adj ON true
  WHERE l.organization_id = p_organization_id
    AND l.agreement_id = p_agreement_id
    AND l.archived_at IS NULL
  ORDER BY l.sort_order, l.created_at;
END
$fn$;

-- Agreement financial terms + approved value events + advance position (subcontract_advances).
CREATE OR REPLACE FUNCTION app.subcontract_claim_agreement_terms(
  p_organization_id uuid,
  p_agreement_id uuid
)
RETURNS TABLE (
  project_id uuid,
  vendor_id uuid,
  agreement_status text,
  currency text,
  original_amount numeric,
  original_event_amount numeric,
  change_events_amount numeric,
  retention_percent numeric,
  retention_cap_percent numeric,
  retention_cap_amount numeric,
  advance_recovery_method text,
  advance_recovery_percent numeric,
  advances_paid numeric,
  advances_applied numeric,
  advances_refunded numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM app.subcontract_claim_agreement_access(p_organization_id, p_agreement_id, 'claim.view',
    ARRAY['ext.claim.view', 'ext.claim.submit', 'ext.payment.view']);
  RETURN QUERY
  SELECT a.project_id, a.vendor_id, a.status, a.currency::text, a.original_amount,
    (SELECT e.amount FROM public.subcontract_value_events e
      WHERE e.subcontract_id = a.id AND e.organization_id = a.organization_id AND e.kind = 'original'
      ORDER BY e.created_at LIMIT 1),
    COALESCE((SELECT SUM(e.amount) FROM public.subcontract_value_events e
      WHERE e.subcontract_id = a.id AND e.organization_id = a.organization_id
        AND e.kind IN ('change_order', 'adjustment')), 0),
    a.retention_percent,
    ft.retention_cap_percent,
    ft.retention_cap_amount,
    COALESCE(ft.advance_recovery_method, 'none'),
    ft.advance_recovery_percent,
    COALESCE(adv.paid, 0),
    COALESCE(adv.applied, 0),
    COALESCE(adv.refunded, 0)
  FROM public.subcontract_agreements a
  LEFT JOIN public.subcontract_agreement_financial_terms ft
    ON ft.agreement_id = a.id AND ft.organization_id = a.organization_id
  LEFT JOIN LATERAL (
    SELECT SUM(s.amount) AS paid, SUM(s.applied_amount_cache) AS applied, SUM(s.refunded_amount_cache) AS refunded
    FROM public.subcontract_advances s
    WHERE s.subcontract_agreement_id = a.id AND s.organization_id = a.organization_id
      AND s.archived_at IS NULL AND s.currency = a.currency
      AND s.status IN ('paid', 'partially_applied', 'fully_applied', 'partially_refunded')
  ) adv ON true
  WHERE a.id = p_agreement_id AND a.organization_id = p_organization_id;
END
$fn$;

-- AP facts for the draft/posted bills created from this agreement's payable bases.
CREATE OR REPLACE FUNCTION app.subcontract_claim_payment_facts(
  p_organization_id uuid,
  p_agreement_id uuid
)
RETURNS TABLE (
  ap_bill_id uuid,
  bill_status text,
  bill_date date,
  due_date date,
  currency text,
  net_amount numeric,
  tax_amount numeric,
  gross_amount numeric,
  retention_amount numeric,
  retention_held_remaining numeric,
  paid_amount numeric,
  advance_applied_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM app.subcontract_claim_agreement_access(p_organization_id, p_agreement_id, 'payment.view',
    ARRAY['ext.payment.view']);
  RETURN QUERY
  SELECT b.id, b.status, b.bill_date, b.due_date, b.currency::text, b.net_amount, b.tax_amount, b.gross_amount,
    b.retention_amount, b.retention_held_remaining,
    COALESCE((SELECT SUM(pa.applied_amount)
      FROM public.ap_payment_applications pa
      JOIN public.ap_payments p ON p.id = pa.ap_payment_id AND p.organization_id = pa.organization_id
      WHERE pa.ap_bill_id = b.id AND pa.organization_id = b.organization_id
        AND p.status = 'recorded' AND p.voided_at IS NULL), 0),
    COALESCE((SELECT SUM(CASE WHEN sa.event_type = 'apply' THEN sa.applied_amount ELSE -sa.applied_amount END)
      FROM public.subcontract_advance_applications sa
      WHERE sa.ap_bill_id = b.id AND sa.organization_id = b.organization_id), 0)
  FROM public.subcontract_claim_payable_bases pb
  JOIN public.ap_bills b ON b.id = pb.ap_bill_id AND b.organization_id = pb.organization_id
  WHERE pb.organization_id = p_organization_id AND pb.agreement_id = p_agreement_id;
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_claim_agreement_access(uuid, uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.subcontract_claim_contract_basis(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.subcontract_claim_agreement_terms(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.subcontract_claim_payment_facts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_agreement_access(uuid, uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_contract_basis(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_agreement_terms(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_payment_facts(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 9. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.subcontract_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_line_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_line_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_payable_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_claim_payable_bases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_deductions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_deduction_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_deduction_disputes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_payment_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_payment_holds FORCE ROW LEVEL SECURITY;

-- Contractor visibility of a claim (its own vendor/agreement; never an internal draft).
CREATE OR REPLACE FUNCTION app.subcontract_claim_external_visible(
  p_organization_id uuid,
  p_claim_id uuid,
  p_capabilities text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.external_principal_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.subcontract_claims c
    WHERE c.id = p_claim_id AND c.organization_id = p_organization_id
      AND NOT (c.status = 'draft' AND c.created_actor_type = 'internal')
      AND app.external_can_see_project(c.organization_id, c.project_id)
      AND EXISTS (
        SELECT 1 FROM unnest(p_capabilities) AS cap(name)
        WHERE app.external_has_scope(c.organization_id, c.project_id, c.vendor_id, c.agreement_id, cap.name)
      )
  )
$fn$;

-- Claim editable by the contractor: draft (its own revision) and ext.claim.submit.
CREATE OR REPLACE FUNCTION app.subcontract_claim_external_editable(
  p_organization_id uuid,
  p_claim_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.external_principal_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.subcontract_claims c
    WHERE c.id = p_claim_id AND c.organization_id = p_organization_id
      AND c.status IN ('draft', 'returned')
      AND c.created_actor_type = 'external'
      AND app.external_can_see_project(c.organization_id, c.project_id)
      AND app.external_has_scope(c.organization_id, c.project_id, c.vendor_id, c.agreement_id, 'ext.claim.submit')
  )
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_claim_external_visible(uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.subcontract_claim_external_editable(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_external_visible(uuid, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.subcontract_claim_external_editable(uuid, uuid) TO authenticated, service_role;

-- subcontract_claims
DROP POLICY IF EXISTS subcontract_claims_select ON public.subcontract_claims;
CREATE POLICY subcontract_claims_select ON public.subcontract_claims
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR (NOT (status = 'draft' AND created_actor_type = 'internal')
      AND app.external_can_see_project(organization_id, project_id)
      AND (app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.view')
        OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.submit')))
  );
DROP POLICY IF EXISTS subcontract_claims_insert ON public.subcontract_claims;
CREATE POLICY subcontract_claims_insert ON public.subcontract_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'draft' AND (
      (app.is_org_member(organization_id)
        AND app.has_project_capability(organization_id, project_id, 'claim.review')
        AND created_actor_type = 'internal' AND created_by_user_id = app.current_user_id())
      OR (created_actor_type = 'external' AND created_by_principal_id = app.external_principal_id()
        AND app.external_can_see_project(organization_id, project_id)
        AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.submit')))
  );
DROP POLICY IF EXISTS subcontract_claims_update ON public.subcontract_claims;
CREATE POLICY subcontract_claims_update ON public.subcontract_claims
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR (created_actor_type = 'external' AND status IN ('draft', 'returned')
      AND app.external_can_see_project(organization_id, project_id)
      AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.submit'))
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR (created_actor_type = 'external' AND status IN ('draft', 'submitted', 'cancelled')
      AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.submit'))
  );
DROP POLICY IF EXISTS subcontract_claims_service_all ON public.subcontract_claims;
CREATE POLICY subcontract_claims_service_all ON public.subcontract_claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_claim_revisions
DROP POLICY IF EXISTS subcontract_claim_revisions_select ON public.subcontract_claim_revisions;
CREATE POLICY subcontract_claim_revisions_select ON public.subcontract_claim_revisions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR app.subcontract_claim_external_visible(organization_id, claim_id, ARRAY['ext.claim.view', 'ext.claim.submit'])
  );
DROP POLICY IF EXISTS subcontract_claim_revisions_insert ON public.subcontract_claim_revisions;
CREATE POLICY subcontract_claim_revisions_insert ON public.subcontract_claim_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_at IS NULL AND (
      (app.is_org_member(organization_id)
        AND app.has_project_capability(organization_id, project_id, 'claim.review')
        AND created_actor_type = 'internal' AND created_by_user_id = app.current_user_id())
      OR (created_actor_type = 'external' AND created_by_principal_id = app.external_principal_id()
        AND app.subcontract_claim_external_editable(organization_id, claim_id)))
  );
DROP POLICY IF EXISTS subcontract_claim_revisions_update ON public.subcontract_claim_revisions;
CREATE POLICY subcontract_claim_revisions_update ON public.subcontract_claim_revisions
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR app.subcontract_claim_external_editable(organization_id, claim_id)
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review')
      AND (submitted_at IS NULL OR (submitted_actor_type = 'internal' AND submitted_by_user_id = app.current_user_id())))
    OR (app.subcontract_claim_external_editable(organization_id, claim_id)
      AND (submitted_at IS NULL
        OR (submitted_actor_type = 'external' AND submitted_by_principal_id = app.external_principal_id())))
  );
DROP POLICY IF EXISTS subcontract_claim_revisions_service_all ON public.subcontract_claim_revisions;
CREATE POLICY subcontract_claim_revisions_service_all ON public.subcontract_claim_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_claim_lines
DROP POLICY IF EXISTS subcontract_claim_lines_select ON public.subcontract_claim_lines;
CREATE POLICY subcontract_claim_lines_select ON public.subcontract_claim_lines
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR app.subcontract_claim_external_visible(organization_id, claim_id, ARRAY['ext.claim.view', 'ext.claim.submit'])
  );
DROP POLICY IF EXISTS subcontract_claim_lines_insert ON public.subcontract_claim_lines;
CREATE POLICY subcontract_claim_lines_insert ON public.subcontract_claim_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR app.subcontract_claim_external_editable(organization_id, claim_id)
  );
DROP POLICY IF EXISTS subcontract_claim_lines_service_all ON public.subcontract_claim_lines;
CREATE POLICY subcontract_claim_lines_service_all ON public.subcontract_claim_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_claim_line_submissions
DROP POLICY IF EXISTS subcontract_claim_line_submissions_select ON public.subcontract_claim_line_submissions;
CREATE POLICY subcontract_claim_line_submissions_select ON public.subcontract_claim_line_submissions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR app.subcontract_claim_external_visible(organization_id, claim_id, ARRAY['ext.claim.view', 'ext.claim.submit'])
  );
DROP POLICY IF EXISTS subcontract_claim_line_submissions_write ON public.subcontract_claim_line_submissions;
CREATE POLICY subcontract_claim_line_submissions_write ON public.subcontract_claim_line_submissions
  FOR ALL TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR app.subcontract_claim_external_editable(organization_id, claim_id)
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.review'))
    OR app.subcontract_claim_external_editable(organization_id, claim_id)
  );
DROP POLICY IF EXISTS subcontract_claim_line_submissions_service_all ON public.subcontract_claim_line_submissions;
CREATE POLICY subcontract_claim_line_submissions_service_all ON public.subcontract_claim_line_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_claim_assessments: claim.review records; certify / reassess need claim.certify.
DROP POLICY IF EXISTS subcontract_claim_assessments_select ON public.subcontract_claim_assessments;
CREATE POLICY subcontract_claim_assessments_select ON public.subcontract_claim_assessments
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR app.subcontract_claim_external_visible(organization_id, claim_id, ARRAY['ext.claim.view', 'ext.claim.submit'])
  );
DROP POLICY IF EXISTS subcontract_claim_assessments_insert ON public.subcontract_claim_assessments;
CREATE POLICY subcontract_claim_assessments_insert ON public.subcontract_claim_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND assessor_user_id = app.current_user_id()
    AND app.has_project_capability(organization_id, project_id,
      CASE WHEN decision IN ('certify', 'reassess', 'reject_line') THEN 'claim.certify' ELSE 'claim.review' END)
  );
DROP POLICY IF EXISTS subcontract_claim_assessments_service_all ON public.subcontract_claim_assessments;
CREATE POLICY subcontract_claim_assessments_service_all ON public.subcontract_claim_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_claim_payable_bases
DROP POLICY IF EXISTS subcontract_claim_payable_bases_select ON public.subcontract_claim_payable_bases;
CREATE POLICY subcontract_claim_payable_bases_select ON public.subcontract_claim_payable_bases
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND (app.has_project_capability(organization_id, project_id, 'claim.view')
        OR app.has_project_capability(organization_id, project_id, 'payment.view')))
    OR app.subcontract_claim_external_visible(organization_id, claim_id, ARRAY['ext.claim.view', 'ext.payment.view'])
  );
DROP POLICY IF EXISTS subcontract_claim_payable_bases_insert ON public.subcontract_claim_payable_bases;
CREATE POLICY subcontract_claim_payable_bases_insert ON public.subcontract_claim_payable_bases
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'claim.certify')
    AND created_by_user_id = app.current_user_id()
    AND ap_bill_id IS NULL);
DROP POLICY IF EXISTS subcontract_claim_payable_bases_update ON public.subcontract_claim_payable_bases;
CREATE POLICY subcontract_claim_payable_bases_update ON public.subcontract_claim_payable_bases
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'payment.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'payment.manage'));
DROP POLICY IF EXISTS subcontract_claim_payable_bases_service_all ON public.subcontract_claim_payable_bases;
CREATE POLICY subcontract_claim_payable_bases_service_all ON public.subcontract_claim_payable_bases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_deductions: claim.view reads; deductions.manage issues/reverses; the contractor sees only
-- contractor-visible deductions of its own agreement.
DROP POLICY IF EXISTS subcontract_deductions_select ON public.subcontract_deductions;
CREATE POLICY subcontract_deductions_select ON public.subcontract_deductions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND (app.has_project_capability(organization_id, project_id, 'claim.view')
        OR app.has_project_capability(organization_id, project_id, 'payment.view')))
    OR (contractor_visible
      AND app.external_can_see_project(organization_id, project_id)
      AND (app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.claim.view')
        OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.payment.view')))
  );
DROP POLICY IF EXISTS subcontract_deductions_insert ON public.subcontract_deductions;
CREATE POLICY subcontract_deductions_insert ON public.subcontract_deductions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'deductions.manage')
    AND issued_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS subcontract_deductions_service_all ON public.subcontract_deductions;
CREATE POLICY subcontract_deductions_service_all ON public.subcontract_deductions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS subcontract_deduction_disputes_select ON public.subcontract_deduction_disputes;
CREATE POLICY subcontract_deduction_disputes_select ON public.subcontract_deduction_disputes
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'claim.view'))
    OR EXISTS (
      SELECT 1 FROM public.subcontract_deductions d
      WHERE d.id = subcontract_deduction_disputes.deduction_id
        AND d.organization_id = subcontract_deduction_disputes.organization_id
        AND d.contractor_visible
        AND app.external_can_see_project(d.organization_id, d.project_id)
        AND (app.external_has_scope(d.organization_id, d.project_id, d.vendor_id, d.agreement_id, 'ext.claim.view')
          OR app.external_has_scope(d.organization_id, d.project_id, d.vendor_id, d.agreement_id, 'ext.payment.view')))
  );
DROP POLICY IF EXISTS subcontract_deduction_disputes_insert ON public.subcontract_deduction_disputes;
CREATE POLICY subcontract_deduction_disputes_insert ON public.subcontract_deduction_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'deductions.manage')
      AND actor_type = 'internal' AND actor_user_id = app.current_user_id())
    OR (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
      AND EXISTS (
        SELECT 1 FROM public.subcontract_deductions d
        WHERE d.id = subcontract_deduction_disputes.deduction_id
          AND d.organization_id = subcontract_deduction_disputes.organization_id
          AND d.contractor_visible AND d.entry_kind = 'issue'
          AND app.external_can_see_project(d.organization_id, d.project_id)
          AND app.external_has_scope(d.organization_id, d.project_id, d.vendor_id, d.agreement_id, 'ext.claim.view')))
  );
DROP POLICY IF EXISTS subcontract_deduction_disputes_service_all ON public.subcontract_deduction_disputes;
CREATE POLICY subcontract_deduction_disputes_service_all ON public.subcontract_deduction_disputes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_payment_holds
DROP POLICY IF EXISTS subcontract_payment_holds_select ON public.subcontract_payment_holds;
CREATE POLICY subcontract_payment_holds_select ON public.subcontract_payment_holds
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND (app.has_project_capability(organization_id, project_id, 'payment.view')
        OR app.has_project_capability(organization_id, project_id, 'claim.view')))
    OR (contractor_visible
      AND app.external_can_see_project(organization_id, project_id)
      AND app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.payment.view'))
  );
DROP POLICY IF EXISTS subcontract_payment_holds_write ON public.subcontract_payment_holds;
CREATE POLICY subcontract_payment_holds_write ON public.subcontract_payment_holds
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'payment.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'payment.manage'));
DROP POLICY IF EXISTS subcontract_payment_holds_service_all ON public.subcontract_payment_holds;
CREATE POLICY subcontract_payment_holds_service_all ON public.subcontract_payment_holds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.subcontract_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_claim_revisions TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_claim_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_claim_line_submissions TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_claim_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_claim_payable_bases TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_deductions TO authenticated;
GRANT SELECT, INSERT ON public.subcontract_deduction_disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subcontract_payment_holds TO authenticated;
GRANT ALL PRIVILEGES ON public.subcontract_claims TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_claim_revisions TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_claim_lines TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_claim_line_submissions TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_claim_assessments TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_claim_payable_bases TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_deductions TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_deduction_disputes TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_payment_holds TO service_role;
