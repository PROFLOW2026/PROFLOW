-- 0163: Developer / GC layer - RFI + Submittals (Track KL).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 + 0155 only.
--
-- PURPOSE
--   1. rfi_submittal_sequences + app.rfi_submittal_assign_number(): per-project RFI-n / SUB-n numbering
--      (race-free, works for external principals who cannot see every row of the project)
--   2. rfis (operational, NO money) + rfi_answers (official answers, append-only)
--      + rfi_status_events (lifecycle history incl. audited reopen, append-only)
--   3. submittals + submittal_revisions (each submission an immutable revision)
--      + submittal_reviews (append-only review decisions)
--   4. app.rfi_submittal_project_contractors(): money-free agreement/vendor identity for project team pick lists
--   5. RLS: internal = app.has_project_capability (project.view read, rfi.manage / submittal.manage write);
--      external = app.external_has_scope with ext.rfi.raise / ext.submittal.submit on the row's vendor/agreement.
--
-- COMPATIBILITY: additive (new tables / functions / triggers only).

--------------------------------------------------------------------------------
-- 1. Numbering
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rfi_submittal_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  kind text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, project_id, kind),
  CONSTRAINT rfi_submittal_sequences_kind_known CHECK (kind IN ('rfi', 'submittal')),
  CONSTRAINT rfi_submittal_sequences_non_negative CHECK (last_number >= 0)
);

ALTER TABLE public.rfi_submittal_sequences DROP CONSTRAINT IF EXISTS rfi_submittal_sequences_project_org_fk;
ALTER TABLE public.rfi_submittal_sequences
  ADD CONSTRAINT rfi_submittal_sequences_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

-- Only reachable through the SECURITY DEFINER trigger below (no client grants).
ALTER TABLE public.rfi_submittal_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfi_submittal_sequences_service_all ON public.rfi_submittal_sequences;
CREATE POLICY rfi_submittal_sequences_service_all ON public.rfi_submittal_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.rfi_submittal_sequences FROM authenticated;
GRANT ALL PRIVILEGES ON public.rfi_submittal_sequences TO service_role;

CREATE OR REPLACE FUNCTION app.rfi_submittal_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  next_number integer;
BEGIN
  INSERT INTO public.rfi_submittal_sequences AS s (organization_id, project_id, kind, last_number)
  VALUES (NEW.organization_id, NEW.project_id, TG_ARGV[0], 1)
  ON CONFLICT (organization_id, project_id, kind)
  DO UPDATE SET last_number = s.last_number + 1
  RETURNING s.last_number INTO next_number;
  NEW.number := next_number;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.rfi_submittal_assign_number() FROM PUBLIC;

-- Contractors (agreement + vendor identity, NO money) on a project for RFI / submittal pick lists and
-- labels. `subcontract_agreements` itself is gated by the org permission vendors.read; project team members
-- who manage RFIs / submittals or coordinate contractors need the identity without the contract value.
CREATE OR REPLACE FUNCTION app.rfi_submittal_project_contractors(p_organization_id uuid, p_project_id uuid)
RETURNS TABLE (
  agreement_id uuid,
  vendor_id uuid,
  agreement_title text,
  vendor_name text,
  is_selectable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id, a.vendor_id, a.title, v.name,
    (a.archived_at IS NULL AND a.status <> 'cancelled')
  FROM public.subcontract_agreements a
  JOIN public.vendors v ON v.id = a.vendor_id AND v.organization_id = a.organization_id
  WHERE a.organization_id = p_organization_id
    AND a.project_id = p_project_id
    AND app.is_org_member(p_organization_id)
    AND (
      app.has_project_capability(p_organization_id, p_project_id, 'contractor.view')
      OR app.has_project_capability(p_organization_id, p_project_id, 'rfi.manage')
      OR app.has_project_capability(p_organization_id, p_project_id, 'submittal.manage')
    )
  ORDER BY a.title, a.id
  LIMIT 500
$fn$;

REVOKE ALL ON FUNCTION app.rfi_submittal_project_contractors(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rfi_submittal_project_contractors(uuid, uuid) TO authenticated, service_role;

-- Generic append-only guard (decisions / answers / history rows).
CREATE OR REPLACE FUNCTION app.rfi_submittal_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

--------------------------------------------------------------------------------
-- 2. RFIs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  number integer NOT NULL DEFAULT 0,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  subject text NOT NULL,
  question text NOT NULL,
  location_id uuid,
  -- Track IJ owns drawings: plain ids + human label, no FK.
  drawing_id uuid,
  drawing_revision_id uuid,
  drawing_reference text,
  work_package_id uuid,
  priority text NOT NULL DEFAULT 'normal',
  due_date date,
  assignee_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  raised_actor_type text NOT NULL,
  raised_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  raised_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  reopen_count integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfis_status_known CHECK (status IN ('draft', 'submitted', 'under_review', 'answered', 'closed')),
  CONSTRAINT rfis_priority_known CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT rfis_subject_not_blank CHECK (length(btrim(subject)) > 0 AND length(subject) <= 300),
  CONSTRAINT rfis_question_not_blank CHECK (length(btrim(question)) > 0 AND length(question) <= 20000),
  CONSTRAINT rfis_drawing_reference_len CHECK (drawing_reference IS NULL OR length(drawing_reference) <= 300),
  CONSTRAINT rfis_agreement_needs_vendor CHECK (subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL),
  CONSTRAINT rfis_reopen_count_non_negative CHECK (reopen_count >= 0),
  CONSTRAINT rfis_raised_actor_shape CHECK (
    (raised_actor_type = 'internal' AND raised_by_principal_id IS NULL)
    OR (raised_actor_type = 'external' AND raised_by_user_id IS NULL AND vendor_id IS NOT NULL)
  )
);

ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_project_org_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_vendor_org_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);
ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_agreement_vendor_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id);
ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_agreement_project_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id);
ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_location_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);
ALTER TABLE public.rfis DROP CONSTRAINT IF EXISTS rfis_work_package_fk;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL (work_package_id);

CREATE UNIQUE INDEX IF NOT EXISTS rfis_id_organization_id_uq ON public.rfis (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS rfis_id_org_project_uq ON public.rfis (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS rfis_project_number_uq ON public.rfis (organization_id, project_id, number);
CREATE INDEX IF NOT EXISTS rfis_project_status_idx
  ON public.rfis (organization_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS rfis_vendor_project_idx
  ON public.rfis (organization_id, vendor_id, project_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rfis_open_due_idx
  ON public.rfis (organization_id, due_date)
  WHERE status IN ('submitted', 'under_review') AND archived_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS rfis_assignee_idx
  ON public.rfis (organization_id, assignee_user_id) WHERE assignee_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS rfis_assign_number ON public.rfis;
CREATE TRIGGER rfis_assign_number
  BEFORE INSERT ON public.rfis
  FOR EACH ROW EXECUTE FUNCTION app.rfi_submittal_assign_number('rfi');

-- Identity never changes; the question is frozen once submitted; external principals may only touch
-- their own draft content (assignment / dates / lifecycle stamps belong to the project team).
CREATE OR REPLACE FUNCTION app.rfis_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  external_actor boolean := app.external_principal_id() IS NOT NULL
    AND NOT app.is_org_member(OLD.organization_id);
BEGIN
  -- Actor ids may only be cleared (profile / principal deletion sets NULL), never rewritten.
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.number, NEW.raised_actor_type, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.number, OLD.raised_actor_type, OLD.created_at)
     OR (NEW.raised_by_user_id IS DISTINCT FROM OLD.raised_by_user_id AND NEW.raised_by_user_id IS NOT NULL)
     OR (NEW.raised_by_principal_id IS DISTINCT FROM OLD.raised_by_principal_id
         AND NEW.raised_by_principal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rfis: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'submitted')
    OR (NOT external_actor AND (
      (OLD.status = 'submitted' AND NEW.status IN ('under_review', 'answered', 'closed'))
      OR (OLD.status = 'under_review' AND NEW.status IN ('answered', 'closed'))
      OR (OLD.status = 'answered' AND NEW.status IN ('closed', 'under_review'))
      OR (OLD.status = 'closed' AND NEW.status = 'under_review')))
  ) THEN
    RAISE EXCEPTION 'rfis: transition % -> % not allowed', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft'
     AND (NEW.subject, NEW.question, NEW.vendor_id, NEW.subcontract_agreement_id)
         IS DISTINCT FROM (OLD.subject, OLD.question, OLD.vendor_id, OLD.subcontract_agreement_id) THEN
    RAISE EXCEPTION 'rfis: the question is frozen once submitted' USING ERRCODE = '42501';
  END IF;
  IF external_actor THEN
    IF (NEW.assignee_user_id, NEW.answered_at, NEW.closed_at, NEW.reopen_count, NEW.archived_at, NEW.vendor_id)
       IS DISTINCT FROM
       (OLD.assignee_user_id, OLD.answered_at, OLD.closed_at, OLD.reopen_count, OLD.archived_at, OLD.vendor_id) THEN
      RAISE EXCEPTION 'rfis: contractors may only edit their draft' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS rfis_guard_update ON public.rfis;
CREATE TRIGGER rfis_guard_update
  BEFORE UPDATE ON public.rfis
  FOR EACH ROW EXECUTE FUNCTION app.rfis_guard_update();

CREATE TABLE IF NOT EXISTS public.rfi_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  rfi_id uuid NOT NULL,
  body text NOT NULL,
  answered_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  supersedes_answer_id uuid,
  -- clock_timestamp: rows appended in one transaction (answer + close) keep their real order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rfi_answers_body_not_blank CHECK (length(btrim(body)) > 0 AND length(body) <= 20000)
);

ALTER TABLE public.rfi_answers DROP CONSTRAINT IF EXISTS rfi_answers_rfi_fk;
ALTER TABLE public.rfi_answers
  ADD CONSTRAINT rfi_answers_rfi_fk
  FOREIGN KEY (rfi_id, organization_id, project_id)
  REFERENCES public.rfis (id, organization_id, project_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS rfi_answers_id_org_rfi_uq ON public.rfi_answers (id, organization_id, rfi_id);
ALTER TABLE public.rfi_answers DROP CONSTRAINT IF EXISTS rfi_answers_supersedes_fk;
ALTER TABLE public.rfi_answers
  ADD CONSTRAINT rfi_answers_supersedes_fk
  FOREIGN KEY (supersedes_answer_id, organization_id, rfi_id)
  REFERENCES public.rfi_answers (id, organization_id, rfi_id);
CREATE INDEX IF NOT EXISTS rfi_answers_rfi_idx ON public.rfi_answers (organization_id, rfi_id, created_at);

DROP TRIGGER IF EXISTS rfi_answers_append_only ON public.rfi_answers;
CREATE TRIGGER rfi_answers_append_only
  BEFORE UPDATE OR DELETE ON public.rfi_answers
  FOR EACH ROW EXECUTE FUNCTION app.rfi_submittal_append_only();

CREATE TABLE IF NOT EXISTS public.rfi_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  rfi_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_type text NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rfi_status_events_status_known CHECK (
    to_status IN ('draft', 'submitted', 'under_review', 'answered', 'closed')
    AND (from_status IS NULL OR from_status IN ('draft', 'submitted', 'under_review', 'answered', 'closed'))
  ),
  CONSTRAINT rfi_status_events_reason_len CHECK (reason IS NULL OR length(reason) <= 2000),
  CONSTRAINT rfi_status_events_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.rfi_status_events DROP CONSTRAINT IF EXISTS rfi_status_events_rfi_fk;
ALTER TABLE public.rfi_status_events
  ADD CONSTRAINT rfi_status_events_rfi_fk
  FOREIGN KEY (rfi_id, organization_id, project_id)
  REFERENCES public.rfis (id, organization_id, project_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS rfi_status_events_rfi_idx
  ON public.rfi_status_events (organization_id, rfi_id, created_at);

DROP TRIGGER IF EXISTS rfi_status_events_append_only ON public.rfi_status_events;
CREATE TRIGGER rfi_status_events_append_only
  BEFORE UPDATE OR DELETE ON public.rfi_status_events
  FOR EACH ROW EXECUTE FUNCTION app.rfi_submittal_append_only();

--------------------------------------------------------------------------------
-- 3. Submittals
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  number integer NOT NULL DEFAULT 0,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  spec_section text,
  location_id uuid,
  drawing_id uuid,
  drawing_revision_id uuid,
  drawing_reference text,
  work_package_id uuid,
  due_date date,
  reviewer_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  current_revision_number integer NOT NULL DEFAULT 1,
  created_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  decided_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submittals_status_known CHECK (status IN (
    'draft', 'submitted', 'under_review', 'approved', 'approved_with_comments',
    'revise_and_resubmit', 'rejected', 'withdrawn'
  )),
  CONSTRAINT submittals_type_known CHECK (type IN (
    'product', 'equipment', 'sample', 'technical_data', 'catalogue', 'shop_drawing', 'material'
  )),
  CONSTRAINT submittals_title_not_blank CHECK (length(btrim(title)) > 0 AND length(title) <= 300),
  CONSTRAINT submittals_description_len CHECK (description IS NULL OR length(description) <= 20000),
  CONSTRAINT submittals_spec_section_len CHECK (spec_section IS NULL OR length(spec_section) <= 120),
  CONSTRAINT submittals_drawing_reference_len CHECK (drawing_reference IS NULL OR length(drawing_reference) <= 300),
  CONSTRAINT submittals_revision_positive CHECK (current_revision_number >= 1),
  CONSTRAINT submittals_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_user_id IS NULL)
  )
);

ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_project_org_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_vendor_org_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);
ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_agreement_vendor_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id);
ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_agreement_project_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id);
ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_location_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);
ALTER TABLE public.submittals DROP CONSTRAINT IF EXISTS submittals_work_package_fk;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL (work_package_id);

CREATE UNIQUE INDEX IF NOT EXISTS submittals_id_organization_id_uq ON public.submittals (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS submittals_id_org_project_uq ON public.submittals (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS submittals_id_org_vendor_uq ON public.submittals (id, organization_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS submittals_project_number_uq ON public.submittals (organization_id, project_id, number);
CREATE INDEX IF NOT EXISTS submittals_project_status_idx
  ON public.submittals (organization_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS submittals_vendor_project_idx
  ON public.submittals (organization_id, vendor_id, project_id);
CREATE INDEX IF NOT EXISTS submittals_pending_due_idx
  ON public.submittals (organization_id, due_date)
  WHERE status IN ('submitted', 'under_review') AND archived_at IS NULL;

DROP TRIGGER IF EXISTS submittals_assign_number ON public.submittals;
CREATE TRIGGER submittals_assign_number
  BEFORE INSERT ON public.submittals
  FOR EACH ROW EXECUTE FUNCTION app.rfi_submittal_assign_number('submittal');

CREATE OR REPLACE FUNCTION app.submittals_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  external_actor boolean := app.external_principal_id() IS NOT NULL
    AND NOT app.is_org_member(OLD.organization_id);
  new_revision boolean := NEW.current_revision_number = OLD.current_revision_number + 1;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'withdrawn') AND NOT new_revision)
    OR (OLD.status = 'submitted' AND NEW.status = 'withdrawn' AND NOT new_revision)
    OR (OLD.status IN ('revise_and_resubmit', 'rejected') AND NEW.status = 'draft' AND new_revision)
    OR (NOT external_actor AND NOT new_revision AND (
      (OLD.status = 'submitted' AND NEW.status IN (
        'under_review', 'approved', 'approved_with_comments', 'revise_and_resubmit', 'rejected'))
      OR (OLD.status = 'under_review' AND NEW.status IN (
        'approved', 'approved_with_comments', 'revise_and_resubmit', 'rejected', 'withdrawn'))))
  ) THEN
    RAISE EXCEPTION 'submittals: transition % -> % not allowed', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF new_revision AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'submittals: a new revision reopens the submittal as draft' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.number, NEW.vendor_id, NEW.created_actor_type,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.number, OLD.vendor_id, OLD.created_actor_type,
      OLD.created_at)
     OR (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id AND NEW.created_by_user_id IS NOT NULL)
     OR (NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id
         AND NEW.created_by_principal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'submittals: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.current_revision_number < OLD.current_revision_number
     OR NEW.current_revision_number > OLD.current_revision_number + 1 THEN
    RAISE EXCEPTION 'submittals: revision numbers only move forward by one' USING ERRCODE = '23514';
  END IF;
  IF OLD.current_revision_number > 1 OR OLD.submitted_at IS NOT NULL THEN
    IF NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id THEN
      RAISE EXCEPTION 'submittals: the agreement is frozen once submitted' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF app.external_principal_id() IS NOT NULL AND NOT app.is_org_member(OLD.organization_id) THEN
    IF (NEW.reviewer_user_id, NEW.decided_at, NEW.archived_at, NEW.due_date)
       IS DISTINCT FROM (OLD.reviewer_user_id, OLD.decided_at, OLD.archived_at, OLD.due_date) THEN
      RAISE EXCEPTION 'submittals: contractors may not change review fields' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS submittals_guard_update ON public.submittals;
CREATE TRIGGER submittals_guard_update
  BEFORE UPDATE ON public.submittals
  FOR EACH ROW EXECUTE FUNCTION app.submittals_guard_update();

CREATE TABLE IF NOT EXISTS public.submittal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  submittal_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  revision_number integer NOT NULL,
  notes text,
  created_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_actor_type text,
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submittal_revisions_number_positive CHECK (revision_number >= 1),
  CONSTRAINT submittal_revisions_notes_len CHECK (notes IS NULL OR length(notes) <= 20000),
  CONSTRAINT submittal_revisions_created_actor_shape CHECK (
    (created_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_actor_type = 'external' AND created_by_user_id IS NULL)
  ),
  CONSTRAINT submittal_revisions_submitted_actor_shape CHECK (
    (submitted_at IS NULL AND submitted_actor_type IS NULL
      AND submitted_by_user_id IS NULL AND submitted_by_principal_id IS NULL)
    OR (submitted_at IS NOT NULL AND submitted_actor_type = 'internal' AND submitted_by_principal_id IS NULL)
    OR (submitted_at IS NOT NULL AND submitted_actor_type = 'external' AND submitted_by_user_id IS NULL)
  )
);

ALTER TABLE public.submittal_revisions DROP CONSTRAINT IF EXISTS submittal_revisions_submittal_project_fk;
ALTER TABLE public.submittal_revisions
  ADD CONSTRAINT submittal_revisions_submittal_project_fk
  FOREIGN KEY (submittal_id, organization_id, project_id)
  REFERENCES public.submittals (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.submittal_revisions DROP CONSTRAINT IF EXISTS submittal_revisions_submittal_vendor_fk;
ALTER TABLE public.submittal_revisions
  ADD CONSTRAINT submittal_revisions_submittal_vendor_fk
  FOREIGN KEY (submittal_id, organization_id, vendor_id)
  REFERENCES public.submittals (id, organization_id, vendor_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS submittal_revisions_id_organization_id_uq
  ON public.submittal_revisions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS submittal_revisions_id_org_submittal_uq
  ON public.submittal_revisions (id, organization_id, submittal_id);
CREATE UNIQUE INDEX IF NOT EXISTS submittal_revisions_number_uq
  ON public.submittal_revisions (organization_id, submittal_id, revision_number);

-- A submitted revision is immutable (corrections = next revision). Drafts may change notes and be
-- submitted exactly once. Never deleted.
CREATE OR REPLACE FUNCTION app.submittal_revisions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submittal_revisions are never deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'submittal_revisions: a submitted revision is immutable' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.submittal_id, NEW.vendor_id, NEW.revision_number,
      NEW.created_actor_type, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.submittal_id, OLD.vendor_id, OLD.revision_number,
      OLD.created_actor_type, OLD.created_at) THEN
    RAISE EXCEPTION 'submittal_revisions: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS submittal_revisions_guard ON public.submittal_revisions;
CREATE TRIGGER submittal_revisions_guard
  BEFORE UPDATE OR DELETE ON public.submittal_revisions
  FOR EACH ROW EXECUTE FUNCTION app.submittal_revisions_guard();

CREATE TABLE IF NOT EXISTS public.submittal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  submittal_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  decision text NOT NULL,
  comments text,
  reviewer_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT submittal_reviews_decision_known CHECK (decision IN (
    'approved', 'approved_with_comments', 'revise_and_resubmit', 'rejected'
  )),
  CONSTRAINT submittal_reviews_comments_required CHECK (
    decision = 'approved' OR (comments IS NOT NULL AND length(btrim(comments)) > 0)
  ),
  CONSTRAINT submittal_reviews_comments_len CHECK (comments IS NULL OR length(comments) <= 20000)
);

ALTER TABLE public.submittal_reviews DROP CONSTRAINT IF EXISTS submittal_reviews_submittal_fk;
ALTER TABLE public.submittal_reviews
  ADD CONSTRAINT submittal_reviews_submittal_fk
  FOREIGN KEY (submittal_id, organization_id, project_id)
  REFERENCES public.submittals (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.submittal_reviews DROP CONSTRAINT IF EXISTS submittal_reviews_revision_fk;
ALTER TABLE public.submittal_reviews
  ADD CONSTRAINT submittal_reviews_revision_fk
  FOREIGN KEY (revision_id, organization_id, submittal_id)
  REFERENCES public.submittal_revisions (id, organization_id, submittal_id) ON DELETE CASCADE;
-- One decision per revision; a different outcome needs a new revision.
CREATE UNIQUE INDEX IF NOT EXISTS submittal_reviews_revision_uq
  ON public.submittal_reviews (organization_id, revision_id);
CREATE INDEX IF NOT EXISTS submittal_reviews_submittal_idx
  ON public.submittal_reviews (organization_id, submittal_id, created_at);

DROP TRIGGER IF EXISTS submittal_reviews_append_only ON public.submittal_reviews;
CREATE TRIGGER submittal_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.submittal_reviews
  FOR EACH ROW EXECUTE FUNCTION app.rfi_submittal_append_only();

--------------------------------------------------------------------------------
-- 4. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_status_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_reviews FORCE ROW LEVEL SECURITY;

-- rfis: project members with project.view read; rfi.manage writes. A contractor reads RFIs of its own
-- vendor/agreement with ext.rfi.view or ext.rfi.raise, and never internal drafts. Creating one still
-- requires ext.rfi.raise.
DROP POLICY IF EXISTS rfis_select ON public.rfis;
CREATE POLICY rfis_select ON public.rfis
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR (vendor_id IS NOT NULL AND archived_at IS NULL
      AND (status <> 'draft' OR raised_actor_type = 'external')
      AND (
        app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.rfi.view')
        OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.rfi.raise')
      )
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS rfis_insert ON public.rfis;
CREATE POLICY rfis_insert ON public.rfis
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'rfi.manage')
      AND raised_actor_type = 'internal' AND raised_by_user_id = app.current_user_id())
    OR (raised_actor_type = 'external' AND raised_by_principal_id = app.external_principal_id()
      AND status IN ('draft', 'submitted') AND assignee_user_id IS NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.rfi.raise')
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS rfis_update ON public.rfis;
CREATE POLICY rfis_update ON public.rfis
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'rfi.manage'))
    OR (raised_actor_type = 'external' AND status = 'draft' AND archived_at IS NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.rfi.raise')
      AND app.external_can_see_project(organization_id, project_id))
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'rfi.manage'))
    OR (raised_actor_type = 'external' AND status IN ('draft', 'submitted')
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.rfi.raise')
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS rfis_service_all ON public.rfis;
CREATE POLICY rfis_service_all ON public.rfis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rfi_answers: official answers by rfi.manage holders; the contractor of the RFI reads them.
DROP POLICY IF EXISTS rfi_answers_select ON public.rfi_answers;
CREATE POLICY rfi_answers_select ON public.rfi_answers
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.rfis r
      WHERE r.id = rfi_answers.rfi_id AND r.organization_id = rfi_answers.organization_id
        AND r.vendor_id IS NOT NULL AND r.archived_at IS NULL
        AND (
          app.external_has_scope(r.organization_id, r.project_id, r.vendor_id, r.subcontract_agreement_id, 'ext.rfi.view')
          OR app.external_has_scope(r.organization_id, r.project_id, r.vendor_id, r.subcontract_agreement_id, 'ext.rfi.raise')
        )
        AND app.external_can_see_project(r.organization_id, r.project_id))
  );
DROP POLICY IF EXISTS rfi_answers_insert ON public.rfi_answers;
CREATE POLICY rfi_answers_insert ON public.rfi_answers
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'rfi.manage')
    AND answered_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS rfi_answers_service_all ON public.rfi_answers;
CREATE POLICY rfi_answers_service_all ON public.rfi_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rfi_status_events: lifecycle history; contractors append only for their own RFIs (submit) as themselves.
DROP POLICY IF EXISTS rfi_status_events_select ON public.rfi_status_events;
CREATE POLICY rfi_status_events_select ON public.rfi_status_events
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.rfis r
      WHERE r.id = rfi_status_events.rfi_id AND r.organization_id = rfi_status_events.organization_id
        AND r.vendor_id IS NOT NULL AND r.archived_at IS NULL
        AND (
          app.external_has_scope(r.organization_id, r.project_id, r.vendor_id, r.subcontract_agreement_id, 'ext.rfi.view')
          OR app.external_has_scope(r.organization_id, r.project_id, r.vendor_id, r.subcontract_agreement_id, 'ext.rfi.raise')
        )
        AND app.external_can_see_project(r.organization_id, r.project_id))
  );
DROP POLICY IF EXISTS rfi_status_events_insert ON public.rfi_status_events;
CREATE POLICY rfi_status_events_insert ON public.rfi_status_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'rfi.manage')
      AND actor_type = 'internal' AND actor_user_id = app.current_user_id())
    OR (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
      AND to_status IN ('draft', 'submitted')
      AND EXISTS (
        SELECT 1 FROM public.rfis r
        WHERE r.id = rfi_status_events.rfi_id AND r.organization_id = rfi_status_events.organization_id
          AND r.raised_actor_type = 'external'
          AND app.external_has_scope(r.organization_id, r.project_id, r.vendor_id, r.subcontract_agreement_id,
            'ext.rfi.raise')))
  );
DROP POLICY IF EXISTS rfi_status_events_service_all ON public.rfi_status_events;
CREATE POLICY rfi_status_events_service_all ON public.rfi_status_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- submittals: project.view reads, submittal.manage writes/reviews; contractor (ext.submittal.submit)
-- sees and prepares only its own vendor/agreement submittals.
DROP POLICY IF EXISTS submittals_select ON public.submittals;
CREATE POLICY submittals_select ON public.submittals
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR (archived_at IS NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.submittal.submit')
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS submittals_insert ON public.submittals;
CREATE POLICY submittals_insert ON public.submittals
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage')
      AND created_actor_type = 'internal' AND created_by_user_id = app.current_user_id())
    OR (created_actor_type = 'external' AND created_by_principal_id = app.external_principal_id()
      AND status = 'draft' AND reviewer_user_id IS NULL AND current_revision_number = 1
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.submittal.submit')
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS submittals_update ON public.submittals;
CREATE POLICY submittals_update ON public.submittals
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage'))
    OR (archived_at IS NULL
      AND status IN ('draft', 'submitted', 'revise_and_resubmit', 'rejected')
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.submittal.submit')
      AND app.external_can_see_project(organization_id, project_id))
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage'))
    OR (status IN ('draft', 'submitted', 'withdrawn')
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.submittal.submit')
      AND app.external_can_see_project(organization_id, project_id))
  );
DROP POLICY IF EXISTS submittals_service_all ON public.submittals;
CREATE POLICY submittals_service_all ON public.submittals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS submittal_revisions_select ON public.submittal_revisions;
CREATE POLICY submittal_revisions_select ON public.submittal_revisions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.submittals s
      WHERE s.id = submittal_revisions.submittal_id AND s.organization_id = submittal_revisions.organization_id
        AND s.archived_at IS NULL
        AND app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.subcontract_agreement_id,
          'ext.submittal.submit')
        AND app.external_can_see_project(s.organization_id, s.project_id))
  );
DROP POLICY IF EXISTS submittal_revisions_insert ON public.submittal_revisions;
CREATE POLICY submittal_revisions_insert ON public.submittal_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage')
      AND created_actor_type = 'internal' AND created_by_user_id = app.current_user_id())
    OR (created_actor_type = 'external' AND created_by_principal_id = app.external_principal_id()
      AND submitted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.submittals s
        WHERE s.id = submittal_revisions.submittal_id AND s.organization_id = submittal_revisions.organization_id
          AND app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.subcontract_agreement_id,
            'ext.submittal.submit')
          AND app.external_can_see_project(s.organization_id, s.project_id)))
  );
DROP POLICY IF EXISTS submittal_revisions_update ON public.submittal_revisions;
CREATE POLICY submittal_revisions_update ON public.submittal_revisions
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage'))
    OR EXISTS (
      SELECT 1 FROM public.submittals s
      WHERE s.id = submittal_revisions.submittal_id AND s.organization_id = submittal_revisions.organization_id
        AND app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.subcontract_agreement_id,
          'ext.submittal.submit')
        AND app.external_can_see_project(s.organization_id, s.project_id))
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'submittal.manage')
      AND (submitted_at IS NULL OR (submitted_actor_type = 'internal'
        AND submitted_by_user_id = app.current_user_id())))
    OR ((submitted_at IS NULL OR (submitted_actor_type = 'external'
        AND submitted_by_principal_id = app.external_principal_id()))
      AND EXISTS (
        SELECT 1 FROM public.submittals s
        WHERE s.id = submittal_revisions.submittal_id AND s.organization_id = submittal_revisions.organization_id
          AND app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.subcontract_agreement_id,
            'ext.submittal.submit')
          AND app.external_can_see_project(s.organization_id, s.project_id)))
  );
DROP POLICY IF EXISTS submittal_revisions_service_all ON public.submittal_revisions;
CREATE POLICY submittal_revisions_service_all ON public.submittal_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS submittal_reviews_select ON public.submittal_reviews;
CREATE POLICY submittal_reviews_select ON public.submittal_reviews
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.submittals s
      WHERE s.id = submittal_reviews.submittal_id AND s.organization_id = submittal_reviews.organization_id
        AND s.archived_at IS NULL
        AND app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.subcontract_agreement_id,
          'ext.submittal.submit')
        AND app.external_can_see_project(s.organization_id, s.project_id))
  );
DROP POLICY IF EXISTS submittal_reviews_insert ON public.submittal_reviews;
CREATE POLICY submittal_reviews_insert ON public.submittal_reviews
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'submittal.manage')
    AND reviewer_user_id = app.current_user_id());
DROP POLICY IF EXISTS submittal_reviews_service_all ON public.submittal_reviews;
CREATE POLICY submittal_reviews_service_all ON public.submittal_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.rfis TO authenticated;
GRANT SELECT, INSERT ON public.rfi_answers TO authenticated;
GRANT SELECT, INSERT ON public.rfi_status_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.submittals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.submittal_revisions TO authenticated;
GRANT SELECT, INSERT ON public.submittal_reviews TO authenticated;
GRANT ALL PRIVILEGES ON public.rfis TO service_role;
GRANT ALL PRIVILEGES ON public.rfi_answers TO service_role;
GRANT ALL PRIVILEGES ON public.rfi_status_events TO service_role;
GRANT ALL PRIVILEGES ON public.submittals TO service_role;
GRANT ALL PRIVILEGES ON public.submittal_revisions TO service_role;
GRANT ALL PRIVILEGES ON public.submittal_reviews TO service_role;
