-- 0162: Developer / GC layer - DOCUMENTS, EVIDENCE, CONTRACTOR SHARING, DRAWINGS / REVISIONS (Track IJ).
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0154 / 0155 only.
--
-- PURPOSE
--   1. app.docs_external_capability: project-level contractor capability check (any or one vendor)
--   2. evidence_items: photos / videos / documents attached to any DG entity. Bytes stay in the org's
--      external storage behind `documents`; visibility (internal | contractor) is metadata.
--   3. document_shares + document_share_acknowledgements: share an existing project document with
--      all project contractors / one agreement / one principal. No file copies.
--   4. drawings + drawing_revisions + drawing_distribution_entries + drawing_revision_acknowledgements:
--      drawing register; publishing Rev N supersedes the previous current revision (kept as history).
--
-- COMPATIBILITY: additive. New tables only; no changes to existing tables, enums or policies.
-- MONEY: none of these tables hold money.

--------------------------------------------------------------------------------
-- 1. External helper: does the current principal hold `p_capability` on a project?
--    p_vendor_id NULL = for any vendor the principal acts for.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.docs_external_capability(
  p_organization_id uuid,
  p_project_id uuid,
  p_vendor_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.external_access_grants g
      WHERE g.principal_id = app.external_principal_id()
        AND g.organization_id = p_organization_id
        AND g.portal_kind = 'contractor'
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND jsonb_exists(g.scopes, p_capability)
        AND (p_vendor_id IS NULL OR g.vendor_id = p_vendor_id)
        AND (
          g.project_id = p_project_id
          OR (
            g.project_id IS NULL
            AND EXISTS (
              SELECT 1 FROM public.subcontract_agreements a
              WHERE a.organization_id = g.organization_id
                AND a.vendor_id = g.vendor_id
                AND a.project_id = p_project_id
                AND a.status <> 'cancelled'
                AND a.archived_at IS NULL
                AND (g.subcontract_agreement_id IS NULL OR g.subcontract_agreement_id = a.id)
            )
          )
        )
    )
$fn$;

REVOKE ALL ON FUNCTION app.docs_external_capability(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.docs_external_capability(uuid, uuid, uuid, text) TO authenticated, service_role;

-- Append-only facts: never updated; deleted only by FK cascades (trigger depth > 1).
CREATE OR REPLACE FUNCTION app.docs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$fn$;

--------------------------------------------------------------------------------
-- 2. evidence_items
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  document_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  location_id uuid,
  kind text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  caption text,
  visibility text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'pending',
  uploaded_by_actor_type text NOT NULL,
  uploaded_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  uploaded_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz,
  removed_at timestamptz,
  removed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  removed_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_items_entity_type_shape CHECK (entity_type ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT evidence_items_kind_known CHECK (kind IN ('photo', 'video', 'document')),
  CONSTRAINT evidence_items_visibility_known CHECK (visibility IN ('internal', 'contractor')),
  CONSTRAINT evidence_items_status_known CHECK (status IN ('pending', 'available', 'removed')),
  CONSTRAINT evidence_items_size_positive CHECK (size_bytes > 0),
  CONSTRAINT evidence_items_file_name_shape CHECK (
    length(btrim(file_name)) BETWEEN 1 AND 180 AND file_name !~ '[/\\]'
  ),
  CONSTRAINT evidence_items_caption_length CHECK (caption IS NULL OR length(caption) <= 500),
  CONSTRAINT evidence_items_actor_shape CHECK (
    (uploaded_by_actor_type = 'internal' AND uploaded_by_principal_id IS NULL)
    OR (uploaded_by_actor_type = 'external' AND uploaded_by_principal_id IS NOT NULL
      AND uploaded_by_user_id IS NULL)
    OR (uploaded_by_actor_type = 'system' AND uploaded_by_user_id IS NULL
      AND uploaded_by_principal_id IS NULL)
  ),
  -- A contractor upload always belongs to the uploader's company and is contractor-visible.
  CONSTRAINT evidence_items_external_scoped CHECK (
    uploaded_by_actor_type <> 'external' OR (vendor_id IS NOT NULL AND visibility = 'contractor')
  ),
  CONSTRAINT evidence_items_agreement_needs_vendor CHECK (
    subcontract_agreement_id IS NULL OR vendor_id IS NOT NULL
  )
);

ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_project_org_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_document_org_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_document_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_vendor_org_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);
ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_agreement_vendor_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_agreement_project_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.evidence_items DROP CONSTRAINT IF EXISTS evidence_items_location_fk;
ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_items_id_organization_id_uq
  ON public.evidence_items (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_items_document_entity_uq
  ON public.evidence_items (organization_id, document_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS evidence_items_entity_idx
  ON public.evidence_items (organization_id, entity_type, entity_id, status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS evidence_items_project_idx
  ON public.evidence_items (organization_id, project_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS evidence_items_vendor_idx
  ON public.evidence_items (organization_id, vendor_id) WHERE vendor_id IS NOT NULL;

-- Identity columns never change; `removed` is terminal; pending -> available | removed only.
CREATE OR REPLACE FUNCTION app.evidence_items_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.document_id, NEW.entity_type, NEW.entity_id,
      NEW.vendor_id, NEW.subcontract_agreement_id, NEW.kind, NEW.mime_type,
      NEW.uploaded_by_actor_type, NEW.uploaded_by_user_id, NEW.uploaded_by_principal_id,
      NEW.uploaded_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.document_id, OLD.entity_type, OLD.entity_id,
      OLD.vendor_id, OLD.subcontract_agreement_id, OLD.kind, OLD.mime_type,
      OLD.uploaded_by_actor_type, OLD.uploaded_by_user_id, OLD.uploaded_by_principal_id,
      OLD.uploaded_at, OLD.created_at) THEN
    RAISE EXCEPTION 'evidence_items: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'removed' THEN
    RAISE EXCEPTION 'evidence_items: removed evidence is final' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'available' AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'evidence_items: invalid status transition' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS evidence_items_guard ON public.evidence_items;
CREATE TRIGGER evidence_items_guard
  BEFORE UPDATE ON public.evidence_items
  FOR EACH ROW EXECUTE FUNCTION app.evidence_items_guard();

--------------------------------------------------------------------------------
-- 3. document_shares + acknowledgements
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  document_id uuid NOT NULL,
  audience text NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  principal_id uuid REFERENCES public.external_principals (id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint,
  note text,
  acknowledgement_required boolean NOT NULL DEFAULT false,
  shared_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_shares_audience_known CHECK (
    audience IN ('project_contractors', 'agreement', 'principal')
  ),
  CONSTRAINT document_shares_audience_shape CHECK (
    (audience = 'project_contractors' AND vendor_id IS NULL AND subcontract_agreement_id IS NULL
      AND principal_id IS NULL)
    OR (audience = 'agreement' AND vendor_id IS NOT NULL AND subcontract_agreement_id IS NOT NULL
      AND principal_id IS NULL)
    OR (audience = 'principal' AND principal_id IS NOT NULL AND subcontract_agreement_id IS NULL)
  ),
  CONSTRAINT document_shares_title_not_blank CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT document_shares_note_length CHECK (note IS NULL OR length(note) <= 1000),
  CONSTRAINT document_shares_revoked_shape CHECK (revoked_at IS NULL OR revoked_at >= shared_at)
);

ALTER TABLE public.document_shares DROP CONSTRAINT IF EXISTS document_shares_project_org_fk;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.document_shares DROP CONSTRAINT IF EXISTS document_shares_document_org_fk;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_document_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.document_shares DROP CONSTRAINT IF EXISTS document_shares_vendor_org_fk;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.document_shares DROP CONSTRAINT IF EXISTS document_shares_agreement_vendor_fk;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.document_shares DROP CONSTRAINT IF EXISTS document_shares_agreement_project_fk;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS document_shares_id_organization_id_uq
  ON public.document_shares (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS document_shares_active_audience_uq
  ON public.document_shares (
    organization_id, document_id, audience,
    COALESCE(subcontract_agreement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS document_shares_project_idx
  ON public.document_shares (organization_id, project_id, shared_at DESC);
CREATE INDEX IF NOT EXISTS document_shares_document_idx
  ON public.document_shares (organization_id, document_id);

-- Only revocation may change a share; revoked is final.
CREATE OR REPLACE FUNCTION app.document_shares_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'document_shares: revoked share is final' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.document_id, NEW.audience, NEW.vendor_id,
      NEW.subcontract_agreement_id, NEW.principal_id, NEW.title, NEW.file_name, NEW.mime_type,
      NEW.size_bytes, NEW.note, NEW.acknowledgement_required, NEW.shared_by_user_id, NEW.shared_at,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.document_id, OLD.audience, OLD.vendor_id,
      OLD.subcontract_agreement_id, OLD.principal_id, OLD.title, OLD.file_name, OLD.mime_type,
      OLD.size_bytes, OLD.note, OLD.acknowledgement_required, OLD.shared_by_user_id, OLD.shared_at,
      OLD.created_at) THEN
    RAISE EXCEPTION 'document_shares: only revocation may change a share' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS document_shares_guard ON public.document_shares;
CREATE TRIGGER document_shares_guard
  BEFORE UPDATE ON public.document_shares
  FOR EACH ROW EXECUTE FUNCTION app.document_shares_guard();

CREATE TABLE IF NOT EXISTS public.document_share_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  share_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES public.external_principals (id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_share_acknowledgements
  DROP CONSTRAINT IF EXISTS document_share_acknowledgements_share_fk;
ALTER TABLE public.document_share_acknowledgements
  ADD CONSTRAINT document_share_acknowledgements_share_fk
  FOREIGN KEY (share_id, organization_id)
  REFERENCES public.document_shares (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.document_share_acknowledgements
  DROP CONSTRAINT IF EXISTS document_share_acknowledgements_project_org_fk;
ALTER TABLE public.document_share_acknowledgements
  ADD CONSTRAINT document_share_acknowledgements_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.document_share_acknowledgements
  DROP CONSTRAINT IF EXISTS document_share_acknowledgements_vendor_org_fk;
ALTER TABLE public.document_share_acknowledgements
  ADD CONSTRAINT document_share_acknowledgements_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS document_share_acknowledgements_share_principal_uq
  ON public.document_share_acknowledgements (share_id, principal_id);
CREATE INDEX IF NOT EXISTS document_share_acknowledgements_project_idx
  ON public.document_share_acknowledgements (organization_id, project_id);

DROP TRIGGER IF EXISTS document_share_acknowledgements_append_only ON public.document_share_acknowledgements;
CREATE TRIGGER document_share_acknowledgements_append_only
  BEFORE UPDATE OR DELETE ON public.document_share_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION app.docs_append_only();

--------------------------------------------------------------------------------
-- 4. drawings register + revisions + distribution + acknowledgements
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  drawing_number text NOT NULL,
  title text NOT NULL,
  discipline text NOT NULL DEFAULT 'architecture',
  location_id uuid,
  contractor_visibility text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'active',
  current_revision_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drawings_number_not_blank CHECK (length(btrim(drawing_number)) BETWEEN 1 AND 64),
  CONSTRAINT drawings_title_not_blank CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT drawings_discipline_known CHECK (discipline IN (
    'architecture', 'structure', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire_protection',
    'civil', 'landscape', 'interior', 'aluminium', 'survey', 'other'
  )),
  CONSTRAINT drawings_visibility_known CHECK (
    contractor_visibility IN ('internal', 'all_contractors', 'distribution')
  ),
  CONSTRAINT drawings_status_known CHECK (status IN ('active', 'archived')),
  CONSTRAINT drawings_archived_shape CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_project_org_fk;
ALTER TABLE public.drawings
  ADD CONSTRAINT drawings_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_location_fk;
ALTER TABLE public.drawings
  ADD CONSTRAINT drawings_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

CREATE UNIQUE INDEX IF NOT EXISTS drawings_id_organization_id_uq
  ON public.drawings (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS drawings_id_org_project_uq
  ON public.drawings (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS drawings_number_uq
  ON public.drawings (organization_id, project_id, lower(drawing_number));
CREATE INDEX IF NOT EXISTS drawings_project_idx
  ON public.drawings (organization_id, project_id, status, discipline, drawing_number);

CREATE TABLE IF NOT EXISTS public.drawing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  drawing_id uuid NOT NULL,
  revision_label text NOT NULL,
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  issue_date date,
  description text,
  document_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint,
  file_ready boolean NOT NULL DEFAULT false,
  supersedes_revision_id uuid,
  acknowledgement_required boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  superseded_at timestamptz,
  superseded_by_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drawing_revisions_label_shape CHECK (length(btrim(revision_label)) BETWEEN 1 AND 16),
  CONSTRAINT drawing_revisions_sequence_positive CHECK (sequence > 0),
  CONSTRAINT drawing_revisions_status_known CHECK (
    status IN ('draft', 'current', 'superseded', 'withdrawn')
  ),
  CONSTRAINT drawing_revisions_description_length CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT drawing_revisions_published_shape CHECK (
    (status IN ('current', 'superseded')) = (published_at IS NOT NULL)
  ),
  CONSTRAINT drawing_revisions_superseded_shape CHECK (
    (status = 'superseded') = (superseded_at IS NOT NULL)
  ),
  CONSTRAINT drawing_revisions_published_needs_file CHECK (status NOT IN ('current', 'superseded') OR file_ready),
  CONSTRAINT drawing_revisions_not_own_predecessor CHECK (
    supersedes_revision_id IS NULL OR supersedes_revision_id <> id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS drawing_revisions_id_organization_id_uq
  ON public.drawing_revisions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS drawing_revisions_id_org_drawing_uq
  ON public.drawing_revisions (id, organization_id, drawing_id);
CREATE UNIQUE INDEX IF NOT EXISTS drawing_revisions_label_uq
  ON public.drawing_revisions (organization_id, drawing_id, lower(revision_label))
  WHERE status <> 'withdrawn';
CREATE UNIQUE INDEX IF NOT EXISTS drawing_revisions_sequence_uq
  ON public.drawing_revisions (organization_id, drawing_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS drawing_revisions_one_current_uq
  ON public.drawing_revisions (organization_id, drawing_id) WHERE status = 'current';
CREATE INDEX IF NOT EXISTS drawing_revisions_project_idx
  ON public.drawing_revisions (organization_id, project_id, status, published_at DESC);

ALTER TABLE public.drawing_revisions DROP CONSTRAINT IF EXISTS drawing_revisions_drawing_fk;
ALTER TABLE public.drawing_revisions
  ADD CONSTRAINT drawing_revisions_drawing_fk
  FOREIGN KEY (drawing_id, organization_id, project_id)
  REFERENCES public.drawings (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_revisions DROP CONSTRAINT IF EXISTS drawing_revisions_document_org_fk;
ALTER TABLE public.drawing_revisions
  ADD CONSTRAINT drawing_revisions_document_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id);
ALTER TABLE public.drawing_revisions DROP CONSTRAINT IF EXISTS drawing_revisions_supersedes_fk;
ALTER TABLE public.drawing_revisions
  ADD CONSTRAINT drawing_revisions_supersedes_fk
  FOREIGN KEY (supersedes_revision_id, organization_id, drawing_id)
  REFERENCES public.drawing_revisions (id, organization_id, drawing_id);
ALTER TABLE public.drawing_revisions DROP CONSTRAINT IF EXISTS drawing_revisions_superseded_by_fk;
ALTER TABLE public.drawing_revisions
  ADD CONSTRAINT drawing_revisions_superseded_by_fk
  FOREIGN KEY (superseded_by_revision_id, organization_id, drawing_id)
  REFERENCES public.drawing_revisions (id, organization_id, drawing_id);

ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_current_revision_fk;
ALTER TABLE public.drawings
  ADD CONSTRAINT drawings_current_revision_fk
  FOREIGN KEY (current_revision_id, organization_id, id)
  REFERENCES public.drawing_revisions (id, organization_id, drawing_id);

-- Revision lifecycle: draft -> current | withdrawn; current -> superseded. Published revisions are
-- frozen (file, label, sequence, dates); a newer revision can never be superseded by an older one.
CREATE OR REPLACE FUNCTION app.drawing_revisions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() <= 1 AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'drawing_revisions: published revisions are kept' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.drawing_id, NEW.sequence, NEW.created_at,
      NEW.created_by_user_id)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.drawing_id, OLD.sequence, OLD.created_at,
      OLD.created_by_user_id) THEN
    RAISE EXCEPTION 'drawing_revisions: identity columns are immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'drawing_revisions: % revision is final', OLD.status USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'current' THEN
    IF NEW.status <> 'superseded' THEN
      RAISE EXCEPTION 'drawing_revisions: a current revision can only be superseded' USING ERRCODE = '23514';
    END IF;
    IF (NEW.revision_label, NEW.issue_date, NEW.description, NEW.document_id, NEW.file_name,
        NEW.mime_type, NEW.size_bytes, NEW.file_ready, NEW.supersedes_revision_id,
        NEW.acknowledgement_required, NEW.published_at, NEW.published_by_user_id)
       IS DISTINCT FROM
       (OLD.revision_label, OLD.issue_date, OLD.description, OLD.document_id, OLD.file_name,
        OLD.mime_type, OLD.size_bytes, OLD.file_ready, OLD.supersedes_revision_id,
        OLD.acknowledgement_required, OLD.published_at, OLD.published_by_user_id) THEN
      RAISE EXCEPTION 'drawing_revisions: published revisions are frozen' USING ERRCODE = '42501';
    END IF;
    IF NEW.superseded_by_revision_id IS NULL THEN
      RAISE EXCEPTION 'drawing_revisions: superseded revision needs its successor' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'superseded' THEN
    RAISE EXCEPTION 'drawing_revisions: a draft cannot be superseded' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'current' THEN
    IF EXISTS (
      SELECT 1 FROM public.drawing_revisions r
      WHERE r.organization_id = NEW.organization_id
        AND r.drawing_id = NEW.drawing_id
        AND r.id <> NEW.id
        AND r.status IN ('current', 'superseded')
        AND r.sequence > NEW.sequence
    ) THEN
      RAISE EXCEPTION 'drawing_revisions: a newer revision is already published' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS drawing_revisions_guard ON public.drawing_revisions;
CREATE TRIGGER drawing_revisions_guard
  BEFORE UPDATE OR DELETE ON public.drawing_revisions
  FOR EACH ROW EXECUTE FUNCTION app.drawing_revisions_guard();

CREATE TABLE IF NOT EXISTS public.drawing_distribution_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  drawing_id uuid NOT NULL,
  audience text NOT NULL,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  principal_id uuid REFERENCES public.external_principals (id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drawing_distribution_audience_known CHECK (audience IN ('agreement', 'principal')),
  CONSTRAINT drawing_distribution_audience_shape CHECK (
    (audience = 'agreement' AND vendor_id IS NOT NULL AND subcontract_agreement_id IS NOT NULL
      AND principal_id IS NULL)
    OR (audience = 'principal' AND principal_id IS NOT NULL AND subcontract_agreement_id IS NULL)
  )
);

ALTER TABLE public.drawing_distribution_entries DROP CONSTRAINT IF EXISTS drawing_distribution_drawing_fk;
ALTER TABLE public.drawing_distribution_entries
  ADD CONSTRAINT drawing_distribution_drawing_fk
  FOREIGN KEY (drawing_id, organization_id, project_id)
  REFERENCES public.drawings (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_distribution_entries DROP CONSTRAINT IF EXISTS drawing_distribution_vendor_org_fk;
ALTER TABLE public.drawing_distribution_entries
  ADD CONSTRAINT drawing_distribution_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_distribution_entries DROP CONSTRAINT IF EXISTS drawing_distribution_agreement_vendor_fk;
ALTER TABLE public.drawing_distribution_entries
  ADD CONSTRAINT drawing_distribution_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_distribution_entries DROP CONSTRAINT IF EXISTS drawing_distribution_agreement_project_fk;
ALTER TABLE public.drawing_distribution_entries
  ADD CONSTRAINT drawing_distribution_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS drawing_distribution_entry_uq
  ON public.drawing_distribution_entries (
    organization_id, drawing_id, audience,
    COALESCE(subcontract_agreement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS drawing_distribution_drawing_idx
  ON public.drawing_distribution_entries (organization_id, drawing_id);

CREATE TABLE IF NOT EXISTS public.drawing_revision_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  drawing_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES public.external_principals (id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drawing_revision_acknowledgements DROP CONSTRAINT IF EXISTS drawing_revision_ack_revision_fk;
ALTER TABLE public.drawing_revision_acknowledgements
  ADD CONSTRAINT drawing_revision_ack_revision_fk
  FOREIGN KEY (revision_id, organization_id, drawing_id)
  REFERENCES public.drawing_revisions (id, organization_id, drawing_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_revision_acknowledgements DROP CONSTRAINT IF EXISTS drawing_revision_ack_drawing_fk;
ALTER TABLE public.drawing_revision_acknowledgements
  ADD CONSTRAINT drawing_revision_ack_drawing_fk
  FOREIGN KEY (drawing_id, organization_id, project_id)
  REFERENCES public.drawings (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.drawing_revision_acknowledgements DROP CONSTRAINT IF EXISTS drawing_revision_ack_vendor_org_fk;
ALTER TABLE public.drawing_revision_acknowledgements
  ADD CONSTRAINT drawing_revision_ack_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS drawing_revision_ack_revision_principal_uq
  ON public.drawing_revision_acknowledgements (revision_id, principal_id);
CREATE INDEX IF NOT EXISTS drawing_revision_ack_project_idx
  ON public.drawing_revision_acknowledgements (organization_id, project_id);

DROP TRIGGER IF EXISTS drawing_revision_ack_append_only ON public.drawing_revision_acknowledgements;
CREATE TRIGGER drawing_revision_ack_append_only
  BEFORE UPDATE OR DELETE ON public.drawing_revision_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION app.docs_append_only();

-- Distribution check for contractors (SECURITY DEFINER: principals never read distribution rows).
CREATE OR REPLACE FUNCTION app.docs_drawing_distributed_to_me(
  p_organization_id uuid,
  p_project_id uuid,
  p_drawing_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.drawing_distribution_entries d
    WHERE d.organization_id = p_organization_id
      AND d.project_id = p_project_id
      AND d.drawing_id = p_drawing_id
      AND (
        (d.audience = 'agreement'
          AND app.external_has_scope(p_organization_id, p_project_id, d.vendor_id,
            d.subcontract_agreement_id, 'ext.plan.view'))
        OR (d.audience = 'principal'
          AND d.principal_id = app.external_principal_id()
          AND app.docs_external_capability(p_organization_id, p_project_id, d.vendor_id, 'ext.plan.view'))
      )
  )
$fn$;

REVOKE ALL ON FUNCTION app.docs_drawing_distributed_to_me(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.docs_drawing_distributed_to_me(uuid, uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_shares FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_share_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_share_acknowledgements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_distribution_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_distribution_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_acknowledgements FORCE ROW LEVEL SECURITY;

-- evidence_items: internal project members read; contractors read only contractor-visible evidence of
-- their own company (vendor-scoped) or project-wide evidence when they work on the project.
DROP POLICY IF EXISTS evidence_items_select ON public.evidence_items;
CREATE POLICY evidence_items_select ON public.evidence_items
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR (visibility = 'contractor' AND (
      (vendor_id IS NOT NULL AND app.external_has_scope(organization_id, project_id, vendor_id,
        subcontract_agreement_id, 'ext.document.view'))
      OR (vendor_id IS NULL AND app.docs_external_capability(organization_id, project_id, NULL,
        'ext.document.view'))
      OR (uploaded_by_principal_id IS NOT NULL AND uploaded_by_principal_id = app.external_principal_id())
    ))
  );
DROP POLICY IF EXISTS evidence_items_insert_internal ON public.evidence_items;
CREATE POLICY evidence_items_insert_internal ON public.evidence_items
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
    AND uploaded_by_actor_type = 'internal'
    AND uploaded_by_user_id = app.current_user_id()
  );
DROP POLICY IF EXISTS evidence_items_insert_external ON public.evidence_items;
CREATE POLICY evidence_items_insert_external ON public.evidence_items
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_actor_type = 'external'
    AND uploaded_by_principal_id = app.external_principal_id()
    AND visibility = 'contractor'
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.document.upload')
    AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.document.upload')
  );
DROP POLICY IF EXISTS evidence_items_update_internal ON public.evidence_items;
CREATE POLICY evidence_items_update_internal ON public.evidence_items
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (uploaded_by_actor_type = 'internal' AND uploaded_by_user_id = app.current_user_id()
        AND app.has_project_capability(organization_id, project_id, 'project.view'))
      OR app.has_project_capability(organization_id, project_id, 'documents.share')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );
DROP POLICY IF EXISTS evidence_items_update_external ON public.evidence_items;
CREATE POLICY evidence_items_update_external ON public.evidence_items
  FOR UPDATE TO authenticated
  USING (
    uploaded_by_actor_type = 'external'
    AND uploaded_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
      'ext.document.upload')
  )
  WITH CHECK (
    visibility = 'contractor'
    AND uploaded_by_principal_id = app.external_principal_id()
  );
DROP POLICY IF EXISTS evidence_items_service_all ON public.evidence_items;
CREATE POLICY evidence_items_service_all ON public.evidence_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- document_shares: documents.view reads, documents.share writes; contractors read active shares
-- addressed to them (project-wide, their agreement, or them personally).
DROP POLICY IF EXISTS document_shares_select ON public.document_shares;
CREATE POLICY document_shares_select ON public.document_shares
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'documents.view'))
    OR (revoked_at IS NULL AND (
      (audience = 'project_contractors'
        AND app.docs_external_capability(organization_id, project_id, NULL, 'ext.document.view'))
      OR (audience = 'agreement'
        AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id,
          'ext.document.view'))
      OR (audience = 'principal' AND principal_id = app.external_principal_id()
        AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.document.view'))
    ))
  );
DROP POLICY IF EXISTS document_shares_insert ON public.document_shares;
CREATE POLICY document_shares_insert ON public.document_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
    AND shared_by_user_id = app.current_user_id()
    AND revoked_at IS NULL
  );
DROP POLICY IF EXISTS document_shares_update ON public.document_shares;
CREATE POLICY document_shares_update ON public.document_shares
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
    AND revoked_by_user_id = app.current_user_id());
DROP POLICY IF EXISTS document_shares_service_all ON public.document_shares;
CREATE POLICY document_shares_service_all ON public.document_shares
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS document_share_ack_select ON public.document_share_acknowledgements;
CREATE POLICY document_share_ack_select ON public.document_share_acknowledgements
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'documents.view'))
    OR principal_id = app.external_principal_id()
  );
DROP POLICY IF EXISTS document_share_ack_insert ON public.document_share_acknowledgements;
CREATE POLICY document_share_ack_insert ON public.document_share_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    principal_id = app.external_principal_id()
    AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.document.view')
    AND EXISTS (
      SELECT 1 FROM public.document_shares s
      WHERE s.id = share_id
        AND s.organization_id = document_share_acknowledgements.organization_id
        AND s.project_id = document_share_acknowledgements.project_id
        AND s.revoked_at IS NULL
    )
  );
DROP POLICY IF EXISTS document_share_ack_service_all ON public.document_share_acknowledgements;
CREATE POLICY document_share_ack_service_all ON public.document_share_acknowledgements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- drawings: documents.view reads, documents.share writes; contractors read active drawings with a
-- published revision when visible to all project contractors or distributed to them.
DROP POLICY IF EXISTS drawings_select ON public.drawings;
CREATE POLICY drawings_select ON public.drawings
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'documents.view'))
    OR (status = 'active' AND current_revision_id IS NOT NULL AND (
      (contractor_visibility = 'all_contractors'
        AND app.docs_external_capability(organization_id, project_id, NULL, 'ext.plan.view'))
      OR (contractor_visibility = 'distribution'
        AND app.docs_drawing_distributed_to_me(organization_id, project_id, id))
    ))
  );
DROP POLICY IF EXISTS drawings_insert ON public.drawings;
CREATE POLICY drawings_insert ON public.drawings
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawings_update ON public.drawings;
CREATE POLICY drawings_update ON public.drawings
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawings_service_all ON public.drawings;
CREATE POLICY drawings_service_all ON public.drawings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS drawing_revisions_select ON public.drawing_revisions;
CREATE POLICY drawing_revisions_select ON public.drawing_revisions
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'documents.view'))
    OR (status IN ('current', 'superseded') AND EXISTS (
      SELECT 1 FROM public.drawings d
      WHERE d.id = drawing_revisions.drawing_id
        AND d.organization_id = drawing_revisions.organization_id
    ))
  );
DROP POLICY IF EXISTS drawing_revisions_insert ON public.drawing_revisions;
CREATE POLICY drawing_revisions_insert ON public.drawing_revisions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
    AND status = 'draft');
DROP POLICY IF EXISTS drawing_revisions_update ON public.drawing_revisions;
CREATE POLICY drawing_revisions_update ON public.drawing_revisions
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawing_revisions_delete ON public.drawing_revisions;
CREATE POLICY drawing_revisions_delete ON public.drawing_revisions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id) AND status = 'draft'
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawing_revisions_service_all ON public.drawing_revisions;
CREATE POLICY drawing_revisions_service_all ON public.drawing_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS drawing_distribution_select ON public.drawing_distribution_entries;
CREATE POLICY drawing_distribution_select ON public.drawing_distribution_entries
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.view'));
DROP POLICY IF EXISTS drawing_distribution_insert ON public.drawing_distribution_entries;
CREATE POLICY drawing_distribution_insert ON public.drawing_distribution_entries
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawing_distribution_delete ON public.drawing_distribution_entries;
CREATE POLICY drawing_distribution_delete ON public.drawing_distribution_entries
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share'));
DROP POLICY IF EXISTS drawing_distribution_service_all ON public.drawing_distribution_entries;
CREATE POLICY drawing_distribution_service_all ON public.drawing_distribution_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS drawing_revision_ack_select ON public.drawing_revision_acknowledgements;
CREATE POLICY drawing_revision_ack_select ON public.drawing_revision_acknowledgements
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'documents.view'))
    OR principal_id = app.external_principal_id()
  );
DROP POLICY IF EXISTS drawing_revision_ack_insert ON public.drawing_revision_acknowledgements;
CREATE POLICY drawing_revision_ack_insert ON public.drawing_revision_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    principal_id = app.external_principal_id()
    AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.plan.acknowledge')
    AND EXISTS (
      SELECT 1 FROM public.drawing_revisions r
      WHERE r.id = revision_id
        AND r.organization_id = drawing_revision_acknowledgements.organization_id
        AND r.drawing_id = drawing_revision_acknowledgements.drawing_id
        AND r.status = 'current'
    )
  );
DROP POLICY IF EXISTS drawing_revision_ack_service_all ON public.drawing_revision_acknowledgements;
CREATE POLICY drawing_revision_ack_service_all ON public.drawing_revision_acknowledgements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.evidence_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_shares TO authenticated;
GRANT SELECT, INSERT ON public.document_share_acknowledgements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.drawings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_revisions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.drawing_distribution_entries TO authenticated;
GRANT SELECT, INSERT ON public.drawing_revision_acknowledgements TO authenticated;
GRANT ALL PRIVILEGES ON public.evidence_items TO service_role;
GRANT ALL PRIVILEGES ON public.document_shares TO service_role;
GRANT ALL PRIVILEGES ON public.document_share_acknowledgements TO service_role;
GRANT ALL PRIVILEGES ON public.drawings TO service_role;
GRANT ALL PRIVILEGES ON public.drawing_revisions TO service_role;
GRANT ALL PRIVILEGES ON public.drawing_distribution_entries TO service_role;
GRANT ALL PRIVILEGES ON public.drawing_revision_acknowledgements TO service_role;
