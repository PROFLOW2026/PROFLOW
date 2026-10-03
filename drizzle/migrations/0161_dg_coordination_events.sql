-- 0161: Developer / GC layer - COORDINATION EVENTS / CONTRACTOR READINESS / SCHEDULE (Track H).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 + 0155 only.
--
-- PURPOSE
--   1. coordination_events                 multi-party site event (e.g. "Floor 1 slab pour")
--   2. coordination_event_participants     invited contractor parties (vendor + optional agreement,
--                                          required / optional) and internal participants
--   3. coordination_responses              APPEND-ONLY contractor readiness answers
--   4. coordination_issues                 issues raised from a response / party (-> linked task)
--   5. coordination_reschedules            APPEND-ONLY reschedule history
--   6. coordination_readiness_overrides    APPEND-ONLY authorized readiness overrides (reason + actor)
--   7. coordination_outcomes               APPEND-ONLY outcome records (completed / partial / postponed / cancelled)
--   8. coordination_event_documents        documents / plans linked to an event (metadata only)
--   9. helpers: app.coordination_can_read / can_manage / external_invited / readiness_facts /
--      project_contractors (no money) / event_time_zone
--
-- SECURITY
--   Internal: app.has_project_capability (schedule.view | contractor.coordinate read;
--             schedule.manage | contractor.coordinate write).
--   External: a contractor sees an event ONLY when its own vendor (and agreement, if the grant is
--             narrowed) is an active invited party (ext.schedule.view); answers need ext.event.respond.
--             Contractor A never sees contractor B's participant rows, responses or issues.
--   No money anywhere in this slot.
--
-- COMPATIBILITY: additive (new tables / functions only).

--------------------------------------------------------------------------------
-- 1. coordination_events
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location_id uuid,
  location_note text,
  work_package_id uuid,
  phase_id uuid,
  preparation_deadline timestamptz,
  required_acknowledgements jsonb NOT NULL DEFAULT '[]'::jsonb,
  readiness_epoch_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coordination_events_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT coordination_events_kind_known CHECK (kind IN (
    'concrete_pour', 'installation', 'inspection', 'delivery', 'handover', 'testing', 'meeting', 'other')),
  CONSTRAINT coordination_events_status_known CHECK (status IN (
    'scheduled', 'completed', 'partially_completed', 'postponed', 'cancelled')),
  CONSTRAINT coordination_events_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT coordination_events_prep_before_start CHECK (
    preparation_deadline IS NULL OR preparation_deadline <= starts_at),
  CONSTRAINT coordination_events_acks_array CHECK (jsonb_typeof(required_acknowledgements) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS coordination_events_id_organization_id_uq
  ON public.coordination_events (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS coordination_events_id_org_project_uq
  ON public.coordination_events (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS coordination_events_project_start_idx
  ON public.coordination_events (organization_id, project_id, starts_at);

ALTER TABLE public.coordination_events DROP CONSTRAINT IF EXISTS coordination_events_project_org_fk;
ALTER TABLE public.coordination_events
  ADD CONSTRAINT coordination_events_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_events DROP CONSTRAINT IF EXISTS coordination_events_location_fk;
ALTER TABLE public.coordination_events
  ADD CONSTRAINT coordination_events_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);
ALTER TABLE public.coordination_events DROP CONSTRAINT IF EXISTS coordination_events_work_package_fk;
ALTER TABLE public.coordination_events
  ADD CONSTRAINT coordination_events_work_package_fk
  FOREIGN KEY (work_package_id, organization_id, project_id)
  REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL (work_package_id);
ALTER TABLE public.coordination_events DROP CONSTRAINT IF EXISTS coordination_events_phase_fk;
ALTER TABLE public.coordination_events
  ADD CONSTRAINT coordination_events_phase_fk
  FOREIGN KEY (phase_id, organization_id, project_id)
  REFERENCES public.phases (id, organization_id, project_id) ON DELETE SET NULL (phase_id);

--------------------------------------------------------------------------------
-- 2. coordination_event_participants (invitations)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  trade_label text,
  party_name text NOT NULL DEFAULT '',
  agreement_title text,
  is_required boolean NOT NULL DEFAULT true,
  readiness_requested_at timestamptz,
  invited_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  removed_at timestamptz,
  removed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- clock_timestamp: rows of one multi-row insert keep the invitation order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coordination_participants_kind_shape CHECK (
    (kind = 'contractor' AND vendor_id IS NOT NULL AND user_id IS NULL)
    OR (kind = 'internal' AND user_id IS NOT NULL AND vendor_id IS NULL AND subcontract_agreement_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS coordination_participants_id_organization_id_uq
  ON public.coordination_event_participants (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS coordination_participants_id_org_event_vendor_uq
  ON public.coordination_event_participants (id, organization_id, event_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS coordination_participants_contractor_uq
  ON public.coordination_event_participants (
    event_id, vendor_id, COALESCE(subcontract_agreement_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE kind = 'contractor' AND removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coordination_participants_internal_uq
  ON public.coordination_event_participants (event_id, user_id)
  WHERE kind = 'internal' AND removed_at IS NULL;
CREATE INDEX IF NOT EXISTS coordination_participants_event_idx
  ON public.coordination_event_participants (organization_id, event_id);
CREATE INDEX IF NOT EXISTS coordination_participants_vendor_idx
  ON public.coordination_event_participants (organization_id, vendor_id, project_id)
  WHERE kind = 'contractor' AND removed_at IS NULL;

ALTER TABLE public.coordination_event_participants DROP CONSTRAINT IF EXISTS coordination_participants_event_fk;
ALTER TABLE public.coordination_event_participants
  ADD CONSTRAINT coordination_participants_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_event_participants DROP CONSTRAINT IF EXISTS coordination_participants_vendor_fk;
ALTER TABLE public.coordination_event_participants
  ADD CONSTRAINT coordination_participants_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_event_participants DROP CONSTRAINT IF EXISTS coordination_participants_agreement_vendor_fk;
ALTER TABLE public.coordination_event_participants
  ADD CONSTRAINT coordination_participants_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_event_participants DROP CONSTRAINT IF EXISTS coordination_participants_agreement_project_fk;
ALTER TABLE public.coordination_event_participants
  ADD CONSTRAINT coordination_participants_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE;

-- Display snapshots are taken from the source rows (never from client input) so that operational
-- users without vendors.read and external contractors still see a stable party name.
CREATE OR REPLACE FUNCTION app.coordination_participants_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.kind = 'contractor' THEN
    SELECT v.name INTO NEW.party_name
    FROM public.vendors v
    WHERE v.id = NEW.vendor_id AND v.organization_id = NEW.organization_id;
    IF NEW.subcontract_agreement_id IS NOT NULL THEN
      SELECT a.title INTO NEW.agreement_title
      FROM public.subcontract_agreements a
      WHERE a.id = NEW.subcontract_agreement_id AND a.organization_id = NEW.organization_id;
    ELSE
      NEW.agreement_title := NULL;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.user_id AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'internal participant must be an active organization member' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.email) INTO NEW.party_name
    FROM public.profiles p WHERE p.id = NEW.user_id;
    NEW.agreement_title := NULL;
    NEW.is_required := false;
  END IF;
  NEW.party_name := COALESCE(NEW.party_name, '');
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_participants_snapshot ON public.coordination_event_participants;
CREATE TRIGGER coordination_participants_snapshot
  BEFORE INSERT ON public.coordination_event_participants
  FOR EACH ROW EXECUTE FUNCTION app.coordination_participants_snapshot();

-- Identity of an invitation never changes; only required flag / request time / removal may.
CREATE OR REPLACE FUNCTION app.coordination_participants_identity_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.event_id, NEW.kind, NEW.vendor_id,
      NEW.subcontract_agreement_id, NEW.user_id, NEW.party_name, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.event_id, OLD.kind, OLD.vendor_id,
      OLD.subcontract_agreement_id, OLD.user_id, OLD.party_name, OLD.created_at) THEN
    RAISE EXCEPTION 'coordination participant identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.removed_at IS NOT NULL AND NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    RAISE EXCEPTION 'a removed coordination participant cannot be restored' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_participants_identity_frozen ON public.coordination_event_participants;
CREATE TRIGGER coordination_participants_identity_frozen
  BEFORE UPDATE ON public.coordination_event_participants
  FOR EACH ROW EXECUTE FUNCTION app.coordination_participants_identity_frozen();

--------------------------------------------------------------------------------
-- 3. coordination_responses (APPEND-ONLY)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  status text NOT NULL,
  note text,
  acknowledged_keys text[] NOT NULL DEFAULT '{}'::text[],
  issue_raised boolean NOT NULL DEFAULT false,
  event_starts_at_snapshot timestamptz NOT NULL,
  actor_type text NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coordination_responses_status_known CHECK (status IN (
    'ready', 'not_ready', 'ready_with_conditions', 'acknowledged', 'blocked')),
  CONSTRAINT coordination_responses_note_required CHECK (
    status NOT IN ('not_ready', 'ready_with_conditions', 'blocked')
    OR (note IS NOT NULL AND length(btrim(note)) > 0)),
  CONSTRAINT coordination_responses_actor_shape CHECK (
    (actor_type = 'internal' AND actor_user_id IS NOT NULL AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS coordination_responses_id_organization_id_uq
  ON public.coordination_responses (id, organization_id);
CREATE INDEX IF NOT EXISTS coordination_responses_event_idx
  ON public.coordination_responses (organization_id, event_id, participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coordination_responses_vendor_idx
  ON public.coordination_responses (organization_id, vendor_id, created_at DESC);

ALTER TABLE public.coordination_responses DROP CONSTRAINT IF EXISTS coordination_responses_participant_fk;
ALTER TABLE public.coordination_responses
  ADD CONSTRAINT coordination_responses_participant_fk
  FOREIGN KEY (participant_id, organization_id, event_id, vendor_id)
  REFERENCES public.coordination_event_participants (id, organization_id, event_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_responses DROP CONSTRAINT IF EXISTS coordination_responses_event_fk;
ALTER TABLE public.coordination_responses
  ADD CONSTRAINT coordination_responses_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;

-- Scope columns are copied from the invitation (never trusted from the caller) and answers are only
-- accepted while the event is open. Runs before RLS WITH CHECK, so the policy sees the real scope.
CREATE OR REPLACE FUNCTION app.coordination_responses_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_participant public.coordination_event_participants%ROWTYPE;
  v_event public.coordination_events%ROWTYPE;
BEGIN
  SELECT * INTO v_participant
  FROM public.coordination_event_participants p
  WHERE p.id = NEW.participant_id AND p.organization_id = NEW.organization_id;
  IF NOT FOUND OR v_participant.kind <> 'contractor' OR v_participant.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'coordination participant is not an active contractor party' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_event
  FROM public.coordination_events e
  WHERE e.id = v_participant.event_id AND e.organization_id = v_participant.organization_id;
  IF v_event.status <> 'scheduled' THEN
    RAISE EXCEPTION 'coordination event is not open for responses' USING ERRCODE = '23514';
  END IF;
  NEW.event_id := v_participant.event_id;
  NEW.project_id := v_participant.project_id;
  NEW.vendor_id := v_participant.vendor_id;
  NEW.subcontract_agreement_id := v_participant.subcontract_agreement_id;
  NEW.event_starts_at_snapshot := v_event.starts_at;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_responses_fill ON public.coordination_responses;
CREATE TRIGGER coordination_responses_fill
  BEFORE INSERT ON public.coordination_responses
  FOR EACH ROW EXECUTE FUNCTION app.coordination_responses_fill();

-- Shared append-only guard for the history tables in this slot.
CREATE OR REPLACE FUNCTION app.coordination_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS coordination_responses_append_only ON public.coordination_responses;
CREATE TRIGGER coordination_responses_append_only
  BEFORE UPDATE OR DELETE ON public.coordination_responses
  FOR EACH ROW EXECUTE FUNCTION app.coordination_append_only();

--------------------------------------------------------------------------------
-- 4. coordination_issues
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid,
  response_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  task_id uuid,
  raised_actor_type text NOT NULL,
  raised_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  raised_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coordination_issues_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT coordination_issues_status_known CHECK (status IN ('open', 'task_created', 'dismissed')),
  CONSTRAINT coordination_issues_task_shape CHECK (
    (status = 'task_created' AND task_id IS NOT NULL) OR (status <> 'task_created')),
  CONSTRAINT coordination_issues_actor_shape CHECK (
    (raised_actor_type = 'internal' AND raised_by_user_id IS NOT NULL AND raised_by_principal_id IS NULL)
    OR (raised_actor_type = 'external' AND raised_by_principal_id IS NOT NULL AND raised_by_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS coordination_issues_id_organization_id_uq
  ON public.coordination_issues (id, organization_id);
CREATE INDEX IF NOT EXISTS coordination_issues_event_idx
  ON public.coordination_issues (organization_id, event_id, created_at DESC);

ALTER TABLE public.coordination_issues DROP CONSTRAINT IF EXISTS coordination_issues_participant_fk;
ALTER TABLE public.coordination_issues
  ADD CONSTRAINT coordination_issues_participant_fk
  FOREIGN KEY (participant_id, organization_id, event_id, vendor_id)
  REFERENCES public.coordination_event_participants (id, organization_id, event_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_issues DROP CONSTRAINT IF EXISTS coordination_issues_event_fk;
ALTER TABLE public.coordination_issues
  ADD CONSTRAINT coordination_issues_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_issues DROP CONSTRAINT IF EXISTS coordination_issues_response_fk;
ALTER TABLE public.coordination_issues
  ADD CONSTRAINT coordination_issues_response_fk
  FOREIGN KEY (response_id, organization_id)
  REFERENCES public.coordination_responses (id, organization_id) ON DELETE SET NULL (response_id);

CREATE OR REPLACE FUNCTION app.coordination_issues_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_participant public.coordination_event_participants%ROWTYPE;
BEGIN
  SELECT * INTO v_participant
  FROM public.coordination_event_participants p
  WHERE p.id = NEW.participant_id AND p.organization_id = NEW.organization_id;
  IF NOT FOUND OR v_participant.kind <> 'contractor' THEN
    RAISE EXCEPTION 'coordination issue must target a contractor party' USING ERRCODE = '23514';
  END IF;
  NEW.event_id := v_participant.event_id;
  NEW.project_id := v_participant.project_id;
  NEW.vendor_id := v_participant.vendor_id;
  NEW.subcontract_agreement_id := v_participant.subcontract_agreement_id;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_issues_fill ON public.coordination_issues;
CREATE TRIGGER coordination_issues_fill
  BEFORE INSERT ON public.coordination_issues
  FOR EACH ROW EXECUTE FUNCTION app.coordination_issues_fill();

CREATE OR REPLACE FUNCTION app.coordination_issues_identity_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.event_id, NEW.participant_id, NEW.vendor_id,
      NEW.subcontract_agreement_id, NEW.response_id, NEW.title, NEW.description, NEW.raised_actor_type,
      NEW.raised_by_user_id, NEW.raised_by_principal_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.event_id, OLD.participant_id, OLD.vendor_id,
      OLD.subcontract_agreement_id, OLD.response_id, OLD.title, OLD.description, OLD.raised_actor_type,
      OLD.raised_by_user_id, OLD.raised_by_principal_id, OLD.created_at) THEN
    RAISE EXCEPTION 'coordination issue facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'coordination issue is already resolved' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_issues_identity_frozen ON public.coordination_issues;
CREATE TRIGGER coordination_issues_identity_frozen
  BEFORE UPDATE ON public.coordination_issues
  FOR EACH ROW EXECUTE FUNCTION app.coordination_issues_identity_frozen();

--------------------------------------------------------------------------------
-- 5. coordination_reschedules (APPEND-ONLY)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  previous_starts_at timestamptz NOT NULL,
  previous_ends_at timestamptz,
  new_starts_at timestamptz NOT NULL,
  new_ends_at timestamptz,
  reason text NOT NULL,
  requires_reconfirmation boolean NOT NULL DEFAULT true,
  actor_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coordination_reschedules_reason_not_blank CHECK (length(btrim(reason)) > 0),
  CONSTRAINT coordination_reschedules_time_order CHECK (new_ends_at IS NULL OR new_ends_at >= new_starts_at)
);

CREATE INDEX IF NOT EXISTS coordination_reschedules_event_idx
  ON public.coordination_reschedules (organization_id, event_id, created_at DESC);
ALTER TABLE public.coordination_reschedules DROP CONSTRAINT IF EXISTS coordination_reschedules_event_fk;
ALTER TABLE public.coordination_reschedules
  ADD CONSTRAINT coordination_reschedules_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS coordination_reschedules_append_only ON public.coordination_reschedules;
CREATE TRIGGER coordination_reschedules_append_only
  BEFORE UPDATE OR DELETE ON public.coordination_reschedules
  FOR EACH ROW EXECUTE FUNCTION app.coordination_append_only();

--------------------------------------------------------------------------------
-- 6. coordination_readiness_overrides (APPEND-ONLY; latest row wins)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_readiness_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coordination_overrides_decision_known CHECK (decision IN ('force_ready', 'force_not_ready', 'cleared')),
  CONSTRAINT coordination_overrides_reason_not_blank CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS coordination_overrides_event_idx
  ON public.coordination_readiness_overrides (organization_id, event_id, created_at DESC);
ALTER TABLE public.coordination_readiness_overrides DROP CONSTRAINT IF EXISTS coordination_overrides_event_fk;
ALTER TABLE public.coordination_readiness_overrides
  ADD CONSTRAINT coordination_overrides_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS coordination_overrides_append_only ON public.coordination_readiness_overrides;
CREATE TRIGGER coordination_overrides_append_only
  BEFORE UPDATE OR DELETE ON public.coordination_readiness_overrides
  FOR EACH ROW EXECUTE FUNCTION app.coordination_append_only();

--------------------------------------------------------------------------------
-- 7. coordination_outcomes (APPEND-ONLY)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  outcome text NOT NULL,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  note text,
  actor_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coordination_outcomes_outcome_known CHECK (outcome IN (
    'completed', 'partially_completed', 'postponed', 'cancelled')),
  CONSTRAINT coordination_outcomes_actual_required CHECK (
    outcome NOT IN ('completed', 'partially_completed') OR actual_start_at IS NOT NULL),
  CONSTRAINT coordination_outcomes_time_order CHECK (
    actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at),
  CONSTRAINT coordination_outcomes_note_required CHECK (
    outcome NOT IN ('partially_completed', 'postponed', 'cancelled')
    OR (note IS NOT NULL AND length(btrim(note)) > 0))
);

CREATE INDEX IF NOT EXISTS coordination_outcomes_event_idx
  ON public.coordination_outcomes (organization_id, event_id, created_at DESC);
ALTER TABLE public.coordination_outcomes DROP CONSTRAINT IF EXISTS coordination_outcomes_event_fk;
ALTER TABLE public.coordination_outcomes
  ADD CONSTRAINT coordination_outcomes_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS coordination_outcomes_append_only ON public.coordination_outcomes;
CREATE TRIGGER coordination_outcomes_append_only
  BEFORE UPDATE OR DELETE ON public.coordination_outcomes
  FOR EACH ROW EXECUTE FUNCTION app.coordination_append_only();

--------------------------------------------------------------------------------
-- 8. coordination_event_documents (metadata link; bytes stay in documents / external storage)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordination_event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  event_id uuid NOT NULL,
  document_id uuid NOT NULL,
  title_snapshot text NOT NULL DEFAULT '',
  contractor_visible boolean NOT NULL DEFAULT true,
  linked_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coordination_event_documents_uq
  ON public.coordination_event_documents (event_id, document_id);
CREATE INDEX IF NOT EXISTS coordination_event_documents_event_idx
  ON public.coordination_event_documents (organization_id, event_id);
ALTER TABLE public.coordination_event_documents DROP CONSTRAINT IF EXISTS coordination_event_documents_event_fk;
ALTER TABLE public.coordination_event_documents
  ADD CONSTRAINT coordination_event_documents_event_fk
  FOREIGN KEY (event_id, organization_id, project_id)
  REFERENCES public.coordination_events (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.coordination_event_documents DROP CONSTRAINT IF EXISTS coordination_event_documents_document_fk;
ALTER TABLE public.coordination_event_documents
  ADD CONSTRAINT coordination_event_documents_document_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION app.coordination_event_documents_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  SELECT d.original_filename INTO NEW.title_snapshot
  FROM public.documents d
  WHERE d.id = NEW.document_id AND d.organization_id = NEW.organization_id AND d.deleted_at IS NULL;
  IF NEW.title_snapshot IS NULL THEN
    RAISE EXCEPTION 'linked document not found' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS coordination_event_documents_snapshot ON public.coordination_event_documents;
CREATE TRIGGER coordination_event_documents_snapshot
  BEFORE INSERT ON public.coordination_event_documents
  FOR EACH ROW EXECUTE FUNCTION app.coordination_event_documents_snapshot();

--------------------------------------------------------------------------------
-- 9. Authorization helpers
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.coordination_can_read(p_organization_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.has_project_capability(p_organization_id, p_project_id, 'schedule.view')
    OR app.has_project_capability(p_organization_id, p_project_id, 'contractor.coordinate')
$fn$;

CREATE OR REPLACE FUNCTION app.coordination_can_manage(p_organization_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.has_project_capability(p_organization_id, p_project_id, 'schedule.manage')
    OR app.has_project_capability(p_organization_id, p_project_id, 'contractor.coordinate')
$fn$;

-- True when the calling external principal holds `p_capability` for an active contractor party of the event.
CREATE OR REPLACE FUNCTION app.coordination_external_invited(
  p_organization_id uuid,
  p_event_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.external_principal_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.coordination_event_participants p
      WHERE p.organization_id = p_organization_id
        AND p.event_id = p_event_id
        AND p.kind = 'contractor'
        AND p.removed_at IS NULL
        AND app.external_has_scope(p.organization_id, p.project_id, p.vendor_id,
          p.subcontract_agreement_id, p_capability)
    )
$fn$;

-- Readiness facts for one event (used to detect the "event became ready" transition from an external
-- answer, where RLS deliberately hides the other parties). Carries no party identity, only status.
CREATE OR REPLACE FUNCTION app.coordination_readiness_facts(p_organization_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_event public.coordination_events%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_event
  FROM public.coordination_events e
  WHERE e.id = p_event_id AND e.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (app.coordination_can_read(v_event.organization_id, v_event.project_id)
          OR app.coordination_external_invited(v_event.organization_id, v_event.id, 'ext.schedule.view')) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'status', v_event.status,
    'epochAt', v_event.readiness_epoch_at,
    'requiredAcknowledgementKeys', COALESCE((
      SELECT jsonb_agg(item ->> 'key')
      FROM jsonb_array_elements(v_event.required_acknowledgements) AS item
    ), '[]'::jsonb),
    'override', (
      SELECT o.decision
      FROM public.coordination_readiness_overrides o
      WHERE o.organization_id = v_event.organization_id AND o.event_id = v_event.id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 1
    ),
    'parties', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'participantId', p.id,
        'isRequired', p.is_required,
        'latestStatus', (
          SELECT r.status FROM public.coordination_responses r
          WHERE r.organization_id = p.organization_id AND r.participant_id = p.id
            AND r.created_at >= v_event.readiness_epoch_at
          ORDER BY r.created_at DESC, r.id DESC LIMIT 1
        ),
        'acknowledgedKeys', COALESCE((
          SELECT jsonb_agg(DISTINCT k)
          FROM public.coordination_responses r, unnest(r.acknowledged_keys) AS k
          WHERE r.organization_id = p.organization_id AND r.participant_id = p.id
        ), '[]'::jsonb)
      ) ORDER BY p.created_at, p.id)
      FROM public.coordination_event_participants p
      WHERE p.organization_id = v_event.organization_id
        AND p.event_id = v_event.id
        AND p.kind = 'contractor'
        AND p.removed_at IS NULL
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END
$fn$;

-- Contractors working on the project (for the invite picker). Names + ids only, no money; requires
-- the same capability as inviting.
CREATE OR REPLACE FUNCTION app.coordination_project_contractors(p_organization_id uuid, p_project_id uuid)
RETURNS TABLE (vendor_id uuid, vendor_name text, agreement_id uuid, agreement_title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT v.id, v.name, a.id, a.title
  FROM public.subcontract_agreements a
  JOIN public.vendors v ON v.id = a.vendor_id AND v.organization_id = a.organization_id
  WHERE a.organization_id = p_organization_id
    AND a.project_id = p_project_id
    AND a.archived_at IS NULL
    AND a.status <> 'cancelled'
    AND app.coordination_can_manage(p_organization_id, p_project_id)
  ORDER BY v.name, a.title
$fn$;

-- Display time zone of the organization that owns an event the caller may see (contractor portal
-- formats site times in the organization's zone; external principals cannot read organizations).
CREATE OR REPLACE FUNCTION app.coordination_event_time_zone(p_organization_id uuid, p_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT o.timezone
  FROM public.coordination_events e
  JOIN public.organizations o ON o.id = e.organization_id
  WHERE e.id = p_event_id
    AND e.organization_id = p_organization_id
    AND (app.coordination_can_read(e.organization_id, e.project_id)
      OR app.coordination_external_invited(e.organization_id, e.id, 'ext.schedule.view'))
$fn$;

REVOKE ALL ON FUNCTION app.coordination_event_time_zone(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.coordination_event_time_zone(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.coordination_can_read(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.coordination_can_manage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.coordination_external_invited(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.coordination_readiness_facts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.coordination_project_contractors(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.coordination_can_read(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.coordination_can_manage(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.coordination_external_invited(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.coordination_readiness_facts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.coordination_project_contractors(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 10. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_event_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_reschedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_reschedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_readiness_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_readiness_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_outcomes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_event_documents FORCE ROW LEVEL SECURITY;

-- coordination_events
DROP POLICY IF EXISTS coordination_events_select ON public.coordination_events;
CREATE POLICY coordination_events_select ON public.coordination_events
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR app.coordination_external_invited(organization_id, id, 'ext.schedule.view')
  );
DROP POLICY IF EXISTS coordination_events_insert ON public.coordination_events;
CREATE POLICY coordination_events_insert ON public.coordination_events
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND created_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_events_update ON public.coordination_events;
CREATE POLICY coordination_events_update ON public.coordination_events
  FOR UPDATE TO authenticated
  USING (app.coordination_can_manage(organization_id, project_id))
  WITH CHECK (app.coordination_can_manage(organization_id, project_id));
DROP POLICY IF EXISTS coordination_events_service_all ON public.coordination_events;
CREATE POLICY coordination_events_service_all ON public.coordination_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_event_participants (external: only its own invitation rows)
DROP POLICY IF EXISTS coordination_participants_select ON public.coordination_event_participants;
CREATE POLICY coordination_participants_select ON public.coordination_event_participants
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR (kind = 'contractor' AND removed_at IS NULL
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.schedule.view'))
  );
DROP POLICY IF EXISTS coordination_participants_insert ON public.coordination_event_participants;
CREATE POLICY coordination_participants_insert ON public.coordination_event_participants
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND invited_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_participants_update ON public.coordination_event_participants;
CREATE POLICY coordination_participants_update ON public.coordination_event_participants
  FOR UPDATE TO authenticated
  USING (app.coordination_can_manage(organization_id, project_id))
  WITH CHECK (app.coordination_can_manage(organization_id, project_id));
DROP POLICY IF EXISTS coordination_participants_service_all ON public.coordination_event_participants;
CREATE POLICY coordination_participants_service_all ON public.coordination_event_participants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_responses (append-only; external reads/writes only for its own party)
DROP POLICY IF EXISTS coordination_responses_select ON public.coordination_responses;
CREATE POLICY coordination_responses_select ON public.coordination_responses
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.schedule.view')
  );
DROP POLICY IF EXISTS coordination_responses_insert ON public.coordination_responses;
CREATE POLICY coordination_responses_insert ON public.coordination_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    (actor_type = 'internal' AND actor_user_id = app.current_user_id()
      AND app.coordination_can_manage(organization_id, project_id))
    OR (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
        'ext.event.respond'))
  );
DROP POLICY IF EXISTS coordination_responses_service_all ON public.coordination_responses;
CREATE POLICY coordination_responses_service_all ON public.coordination_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_issues
DROP POLICY IF EXISTS coordination_issues_select ON public.coordination_issues;
CREATE POLICY coordination_issues_select ON public.coordination_issues
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.schedule.view')
  );
DROP POLICY IF EXISTS coordination_issues_insert ON public.coordination_issues;
CREATE POLICY coordination_issues_insert ON public.coordination_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'open' AND (
      (raised_actor_type = 'internal' AND raised_by_user_id = app.current_user_id()
        AND app.coordination_can_manage(organization_id, project_id))
      OR (raised_actor_type = 'external' AND raised_by_principal_id = app.external_principal_id()
        AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
          'ext.event.respond'))
    )
  );
DROP POLICY IF EXISTS coordination_issues_update ON public.coordination_issues;
CREATE POLICY coordination_issues_update ON public.coordination_issues
  FOR UPDATE TO authenticated
  USING (app.coordination_can_manage(organization_id, project_id))
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND resolved_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_issues_service_all ON public.coordination_issues;
CREATE POLICY coordination_issues_service_all ON public.coordination_issues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_reschedules (invited contractors see the history of their events)
DROP POLICY IF EXISTS coordination_reschedules_select ON public.coordination_reschedules;
CREATE POLICY coordination_reschedules_select ON public.coordination_reschedules
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR app.coordination_external_invited(organization_id, event_id, 'ext.schedule.view')
  );
DROP POLICY IF EXISTS coordination_reschedules_insert ON public.coordination_reschedules;
CREATE POLICY coordination_reschedules_insert ON public.coordination_reschedules
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND actor_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_reschedules_service_all ON public.coordination_reschedules;
CREATE POLICY coordination_reschedules_service_all ON public.coordination_reschedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_readiness_overrides (internal only)
DROP POLICY IF EXISTS coordination_overrides_select ON public.coordination_readiness_overrides;
CREATE POLICY coordination_overrides_select ON public.coordination_readiness_overrides
  FOR SELECT TO authenticated
  USING (app.coordination_can_read(organization_id, project_id));
DROP POLICY IF EXISTS coordination_overrides_insert ON public.coordination_readiness_overrides;
CREATE POLICY coordination_overrides_insert ON public.coordination_readiness_overrides
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND actor_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_overrides_service_all ON public.coordination_readiness_overrides;
CREATE POLICY coordination_overrides_service_all ON public.coordination_readiness_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_outcomes (internal only; contractors see the event status)
DROP POLICY IF EXISTS coordination_outcomes_select ON public.coordination_outcomes;
CREATE POLICY coordination_outcomes_select ON public.coordination_outcomes
  FOR SELECT TO authenticated
  USING (app.coordination_can_read(organization_id, project_id));
DROP POLICY IF EXISTS coordination_outcomes_insert ON public.coordination_outcomes;
CREATE POLICY coordination_outcomes_insert ON public.coordination_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND actor_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_outcomes_service_all ON public.coordination_outcomes;
CREATE POLICY coordination_outcomes_service_all ON public.coordination_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- coordination_event_documents
DROP POLICY IF EXISTS coordination_event_documents_select ON public.coordination_event_documents;
CREATE POLICY coordination_event_documents_select ON public.coordination_event_documents
  FOR SELECT TO authenticated
  USING (
    app.coordination_can_read(organization_id, project_id)
    OR (contractor_visible
      AND app.coordination_external_invited(organization_id, event_id, 'ext.schedule.view'))
  );
DROP POLICY IF EXISTS coordination_event_documents_insert ON public.coordination_event_documents;
CREATE POLICY coordination_event_documents_insert ON public.coordination_event_documents
  FOR INSERT TO authenticated
  WITH CHECK (app.coordination_can_manage(organization_id, project_id)
    AND linked_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS coordination_event_documents_delete ON public.coordination_event_documents;
CREATE POLICY coordination_event_documents_delete ON public.coordination_event_documents
  FOR DELETE TO authenticated
  USING (app.coordination_can_manage(organization_id, project_id));
DROP POLICY IF EXISTS coordination_event_documents_service_all ON public.coordination_event_documents;
CREATE POLICY coordination_event_documents_service_all ON public.coordination_event_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.coordination_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coordination_event_participants TO authenticated;
GRANT SELECT, INSERT ON public.coordination_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coordination_issues TO authenticated;
GRANT SELECT, INSERT ON public.coordination_reschedules TO authenticated;
GRANT SELECT, INSERT ON public.coordination_readiness_overrides TO authenticated;
GRANT SELECT, INSERT ON public.coordination_outcomes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.coordination_event_documents TO authenticated;
GRANT ALL PRIVILEGES ON public.coordination_events TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_event_participants TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_responses TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_issues TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_reschedules TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_readiness_overrides TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_outcomes TO service_role;
GRANT ALL PRIVILEGES ON public.coordination_event_documents TO service_role;
