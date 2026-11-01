-- 0195: Infrastructure mapping (EXLFY "זיהוי תשתיות") - captures, markings (versions), saved comparisons,
-- and the location <-> cloud-folder mapping.
--
-- STATUS: PREPARED, NOT APPLIED. Do not run without separate explicit Owner SQL approval.
-- Additive only: new tables, indexes, policies, grants and two trigger functions. No existing table
-- or column is altered; no data is read, moved or rewritten.
--
-- Reuse (no duplication):
--   * project_locations  - the location hierarchy (parent_id, type, code, name) is NOT duplicated.
--   * evidence_items     - the photo bytes' index row (org / project / uploader / date / storage ref via
--                          documents + storage_files). An infra capture points at its evidence row; the
--                          original file lives only in the organization's own cloud storage.
--   * tasks              - optional link (task_id); no new task system.
--   * storage_folder_mappings is intentionally NOT reused for locations: it has no project / location
--                          foreign keys and no uniqueness per entity. infra_folder_mappings adds both.
--
-- Photo / description / marking metadata is stored in real columns and rows (never inside `caption`).

--------------------------------------------------------------------------------
-- Helper trigger functions
--------------------------------------------------------------------------------

-- Rows of append-only tables may be inserted (and removed by cascade / service role) but never edited.
CREATE OR REPLACE FUNCTION app.infra_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

-- infra_captures: identity / provenance columns never change after insert.
CREATE OR REPLACE FUNCTION app.infra_captures_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.evidence_id, NEW.client_capture_id,
      NEW.created_by_actor_type, NEW.created_by_user_id, NEW.created_by_principal_id,
      NEW.vendor_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.evidence_id, OLD.client_capture_id,
      OLD.created_by_actor_type, OLD.created_by_user_id, OLD.created_by_principal_id,
      OLD.vendor_id, OLD.created_at) THEN
    RAISE EXCEPTION 'infra_captures: identity columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
    RAISE EXCEPTION 'infra_captures: removed captures are final' USING ERRCODE = '42501';
  END IF;
  IF NEW.marking_version < OLD.marking_version THEN
    RAISE EXCEPTION 'infra_captures: marking_version cannot decrease' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

--------------------------------------------------------------------------------
-- 1. infra_folder_mappings : location <-> real folder in the organization's cloud storage
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.infra_folder_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  -- NULL = the project's infrastructure root folder; otherwise the folder of this location.
  location_id uuid,
  external_folder_id text NOT NULL,
  external_parent_id text,
  display_name text NOT NULL,
  -- auto: created by the system from the location name; linked_existing: the customer picked a folder.
  origin text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'ready',
  last_error text,
  last_verified_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infra_folder_mappings_origin_known CHECK (origin IN ('auto', 'linked_existing')),
  CONSTRAINT infra_folder_mappings_status_known CHECK (status IN ('pending', 'ready', 'error')),
  CONSTRAINT infra_folder_mappings_name_shape CHECK (length(btrim(display_name)) BETWEEN 1 AND 255)
);

ALTER TABLE public.infra_folder_mappings DROP CONSTRAINT IF EXISTS infra_folder_mappings_project_org_fk;
ALTER TABLE public.infra_folder_mappings
  ADD CONSTRAINT infra_folder_mappings_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_folder_mappings DROP CONSTRAINT IF EXISTS infra_folder_mappings_connection_org_fk;
ALTER TABLE public.infra_folder_mappings
  ADD CONSTRAINT infra_folder_mappings_connection_org_fk
  FOREIGN KEY (connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_folder_mappings DROP CONSTRAINT IF EXISTS infra_folder_mappings_location_fk;
ALTER TABLE public.infra_folder_mappings
  ADD CONSTRAINT infra_folder_mappings_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS infra_folder_mappings_id_organization_id_uq
  ON public.infra_folder_mappings (id, organization_id);
-- One folder per location (and one root) per storage connection.
CREATE UNIQUE INDEX IF NOT EXISTS infra_folder_mappings_target_uq
  ON public.infra_folder_mappings (
    organization_id, project_id, connection_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
-- A provider folder serves exactly one location.
CREATE UNIQUE INDEX IF NOT EXISTS infra_folder_mappings_folder_uq
  ON public.infra_folder_mappings (organization_id, connection_id, external_folder_id);
CREATE INDEX IF NOT EXISTS infra_folder_mappings_project_idx
  ON public.infra_folder_mappings (organization_id, project_id, status);

--------------------------------------------------------------------------------
-- 2. infra_captures : one documented infrastructure photo (original file untouched)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.infra_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  -- The only mandatory descriptor of a capture.
  location_id uuid NOT NULL,
  -- Index row of the ORIGINAL file (never modified). Bytes live in the organization's cloud.
  evidence_id uuid NOT NULL,
  task_id uuid,
  -- Device-generated idempotency key: a retried "begin" never creates a second capture.
  client_capture_id uuid,
  -- documentation: before closure; after_closure: photo taken after the wall was closed; reference: other.
  role text NOT NULL DEFAULT 'documentation',
  source text NOT NULL DEFAULT 'camera',
  description text,
  room text,
  wall text,
  infra_type text,
  dimensions text,
  note text,
  -- Latest saved marking version (0 = no markings yet). Versions live in infra_capture_versions.
  marking_version integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  vendor_id uuid,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infra_captures_role_known CHECK (role IN ('documentation', 'after_closure', 'reference')),
  CONSTRAINT infra_captures_source_known CHECK (source IN ('camera', 'gallery', 'storage')),
  CONSTRAINT infra_captures_infra_type_known CHECK (
    infra_type IS NULL OR infra_type IN
      ('electrical', 'plumbing', 'hvac', 'comms', 'gas', 'fire', 'drywall', 'other')
  ),
  CONSTRAINT infra_captures_actor_known CHECK (created_by_actor_type IN ('internal', 'external')),
  CONSTRAINT infra_captures_actor_shape CHECK (
    (created_by_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_by_actor_type = 'external' AND created_by_principal_id IS NOT NULL
      AND created_by_user_id IS NULL AND vendor_id IS NOT NULL)
  ),
  CONSTRAINT infra_captures_marking_version_nonneg CHECK (marking_version >= 0),
  CONSTRAINT infra_captures_description_length CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT infra_captures_room_length CHECK (room IS NULL OR length(room) <= 120),
  CONSTRAINT infra_captures_wall_length CHECK (wall IS NULL OR length(wall) <= 120),
  CONSTRAINT infra_captures_dimensions_length CHECK (dimensions IS NULL OR length(dimensions) <= 120),
  CONSTRAINT infra_captures_note_length CHECK (note IS NULL OR length(note) <= 1000)
);

ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_project_org_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_location_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id);
ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_evidence_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_evidence_fk
  FOREIGN KEY (evidence_id, organization_id)
  REFERENCES public.evidence_items (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_task_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_task_fk
  FOREIGN KEY (task_id, organization_id)
  REFERENCES public.tasks (id, organization_id) ON DELETE SET NULL (task_id);
ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_vendor_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS infra_captures_id_organization_id_uq
  ON public.infra_captures (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS infra_captures_evidence_uq
  ON public.infra_captures (evidence_id);
CREATE UNIQUE INDEX IF NOT EXISTS infra_captures_client_capture_uq
  ON public.infra_captures (organization_id, client_capture_id) WHERE client_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS infra_captures_location_idx
  ON public.infra_captures (organization_id, project_id, location_id, captured_at DESC, id DESC)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS infra_captures_project_idx
  ON public.infra_captures (organization_id, project_id, captured_at DESC, id DESC)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS infra_captures_type_idx
  ON public.infra_captures (organization_id, project_id, infra_type)
  WHERE removed_at IS NULL AND infra_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS infra_captures_task_idx
  ON public.infra_captures (organization_id, task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS infra_captures_creator_idx
  ON public.infra_captures (organization_id, project_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS infra_captures_vendor_idx
  ON public.infra_captures (organization_id, vendor_id) WHERE vendor_id IS NOT NULL;

DROP TRIGGER IF EXISTS infra_captures_guard ON public.infra_captures;
CREATE TRIGGER infra_captures_guard
  BEFORE UPDATE ON public.infra_captures
  FOR EACH ROW EXECUTE FUNCTION app.infra_captures_guard();

--------------------------------------------------------------------------------
-- 3. infra_capture_versions + infra_markings : markings are versioned, never overwritten
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.infra_capture_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  version integer NOT NULL,
  -- Evidence row of the rendered ANNOTATED image (a separate file next to the untouched original).
  annotated_evidence_id uuid NOT NULL,
  marking_count integer NOT NULL DEFAULT 0,
  created_by_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infra_capture_versions_version_positive CHECK (version >= 1),
  CONSTRAINT infra_capture_versions_count_nonneg CHECK (marking_count >= 0),
  CONSTRAINT infra_capture_versions_actor_known CHECK (created_by_actor_type IN ('internal', 'external'))
);

ALTER TABLE public.infra_capture_versions DROP CONSTRAINT IF EXISTS infra_capture_versions_capture_fk;
ALTER TABLE public.infra_capture_versions
  ADD CONSTRAINT infra_capture_versions_capture_fk
  FOREIGN KEY (capture_id, organization_id)
  REFERENCES public.infra_captures (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_capture_versions DROP CONSTRAINT IF EXISTS infra_capture_versions_project_org_fk;
ALTER TABLE public.infra_capture_versions
  ADD CONSTRAINT infra_capture_versions_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_capture_versions DROP CONSTRAINT IF EXISTS infra_capture_versions_evidence_fk;
ALTER TABLE public.infra_capture_versions
  ADD CONSTRAINT infra_capture_versions_evidence_fk
  FOREIGN KEY (annotated_evidence_id, organization_id)
  REFERENCES public.evidence_items (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS infra_capture_versions_id_organization_id_uq
  ON public.infra_capture_versions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS infra_capture_versions_capture_version_uq
  ON public.infra_capture_versions (capture_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS infra_capture_versions_evidence_uq
  ON public.infra_capture_versions (annotated_evidence_id);

DROP TRIGGER IF EXISTS infra_capture_versions_append_only ON public.infra_capture_versions;
CREATE TRIGGER infra_capture_versions_append_only
  BEFORE UPDATE ON public.infra_capture_versions
  FOR EACH ROW EXECUTE FUNCTION app.infra_block_update();

CREATE TABLE IF NOT EXISTS public.infra_markings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  version_id uuid NOT NULL,
  kind text NOT NULL,
  -- Normalised (0..1) coordinates relative to the image, e.g. {"points":[[0.2,0.3],[0.6,0.3]]}.
  geometry jsonb NOT NULL,
  label text,
  infra_type text,
  color text NOT NULL DEFAULT '#ef4444',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infra_markings_kind_known CHECK (
    kind IN ('point', 'arrow', 'line', 'rect', 'ellipse', 'freehand', 'text')
  ),
  CONSTRAINT infra_markings_geometry_object CHECK (jsonb_typeof(geometry) = 'object'),
  CONSTRAINT infra_markings_label_length CHECK (label IS NULL OR length(label) <= 200),
  CONSTRAINT infra_markings_color_shape CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT infra_markings_infra_type_known CHECK (
    infra_type IS NULL OR infra_type IN
      ('electrical', 'plumbing', 'hvac', 'comms', 'gas', 'fire', 'drywall', 'other')
  )
);

ALTER TABLE public.infra_markings DROP CONSTRAINT IF EXISTS infra_markings_version_fk;
ALTER TABLE public.infra_markings
  ADD CONSTRAINT infra_markings_version_fk
  FOREIGN KEY (version_id, organization_id)
  REFERENCES public.infra_capture_versions (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_markings DROP CONSTRAINT IF EXISTS infra_markings_capture_fk;
ALTER TABLE public.infra_markings
  ADD CONSTRAINT infra_markings_capture_fk
  FOREIGN KEY (capture_id, organization_id)
  REFERENCES public.infra_captures (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_markings DROP CONSTRAINT IF EXISTS infra_markings_project_org_fk;
ALTER TABLE public.infra_markings
  ADD CONSTRAINT infra_markings_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS infra_markings_version_idx
  ON public.infra_markings (organization_id, version_id, sort_order);
CREATE INDEX IF NOT EXISTS infra_markings_capture_idx
  ON public.infra_markings (organization_id, capture_id);

DROP TRIGGER IF EXISTS infra_markings_append_only ON public.infra_markings;
CREATE TRIGGER infra_markings_append_only
  BEFORE UPDATE ON public.infra_markings
  FOR EACH ROW EXECUTE FUNCTION app.infra_block_update();

--------------------------------------------------------------------------------
-- 4. infra_comparisons : explicitly saved locate results (before / after + alignment data)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.infra_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  location_id uuid NOT NULL,
  task_id uuid,
  client_comparison_id uuid,
  mode text NOT NULL,
  -- The documented "before" photo (catalogued) and the saved "after" photo (stored as a capture).
  before_capture_id uuid,
  after_capture_id uuid,
  -- Rendered overlay snapshot (an evidence photo), when the user chose to keep one.
  result_evidence_id uuid,
  -- Everything needed to reopen the comparison: 4+4 normalised pins, fit kind, matrix, opacity, view.
  alignment jsonb NOT NULL,
  alignment_kind text NOT NULL,
  reliable boolean NOT NULL DEFAULT true,
  note text,
  -- Sidecar JSON written next to the files in the organization's cloud (alignment data for reopening).
  sidecar_connection_id uuid,
  sidecar_external_file_id text,
  sidecar_file_name text,
  created_by_actor_type text NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  vendor_id uuid,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infra_comparisons_mode_known CHECK (mode IN ('two_photos', 'live')),
  CONSTRAINT infra_comparisons_alignment_kind_known CHECK (alignment_kind IN ('similarity', 'perspective')),
  CONSTRAINT infra_comparisons_alignment_object CHECK (jsonb_typeof(alignment) = 'object'),
  -- Reopen contract: 4 + 4 reference pins are always present (normalised 0..1 per photo).
  CONSTRAINT infra_comparisons_alignment_pins CHECK (
    COALESCE(jsonb_typeof(alignment -> 'beforePins') = 'array', false)
    AND COALESCE(jsonb_typeof(alignment -> 'afterPins') = 'array', false)
    AND COALESCE(jsonb_array_length(alignment -> 'beforePins') = 4, false)
    AND COALESCE(jsonb_array_length(alignment -> 'afterPins') = 4, false)
  ),
  CONSTRAINT infra_comparisons_note_length CHECK (note IS NULL OR length(note) <= 1000),
  CONSTRAINT infra_comparisons_actor_known CHECK (created_by_actor_type IN ('internal', 'external')),
  CONSTRAINT infra_comparisons_actor_shape CHECK (
    (created_by_actor_type = 'internal' AND created_by_principal_id IS NULL)
    OR (created_by_actor_type = 'external' AND created_by_principal_id IS NOT NULL
      AND created_by_user_id IS NULL AND vendor_id IS NOT NULL)
  ),
  CONSTRAINT infra_comparisons_has_subject CHECK (
    before_capture_id IS NOT NULL OR after_capture_id IS NOT NULL OR result_evidence_id IS NOT NULL
  )
);

ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_project_org_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_location_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_task_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_task_fk
  FOREIGN KEY (task_id, organization_id)
  REFERENCES public.tasks (id, organization_id) ON DELETE SET NULL (task_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_before_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_before_fk
  FOREIGN KEY (before_capture_id, organization_id)
  REFERENCES public.infra_captures (id, organization_id) ON DELETE SET NULL (before_capture_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_after_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_after_fk
  FOREIGN KEY (after_capture_id, organization_id)
  REFERENCES public.infra_captures (id, organization_id) ON DELETE SET NULL (after_capture_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_result_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_result_fk
  FOREIGN KEY (result_evidence_id, organization_id)
  REFERENCES public.evidence_items (id, organization_id) ON DELETE SET NULL (result_evidence_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_sidecar_connection_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_sidecar_connection_fk
  FOREIGN KEY (sidecar_connection_id, organization_id)
  REFERENCES public.organization_storage_connections (id, organization_id) ON DELETE SET NULL (sidecar_connection_id);
ALTER TABLE public.infra_comparisons DROP CONSTRAINT IF EXISTS infra_comparisons_vendor_fk;
ALTER TABLE public.infra_comparisons
  ADD CONSTRAINT infra_comparisons_vendor_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS infra_comparisons_id_organization_id_uq
  ON public.infra_comparisons (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS infra_comparisons_client_uq
  ON public.infra_comparisons (organization_id, client_comparison_id) WHERE client_comparison_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS infra_comparisons_project_idx
  ON public.infra_comparisons (organization_id, project_id, created_at DESC, id DESC)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS infra_comparisons_location_idx
  ON public.infra_comparisons (organization_id, project_id, location_id)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS infra_comparisons_task_idx
  ON public.infra_comparisons (organization_id, task_id) WHERE task_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 5. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.infra_folder_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_folder_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.infra_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_captures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.infra_capture_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_capture_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.infra_markings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_markings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.infra_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_comparisons FORCE ROW LEVEL SECURITY;

-- infra_folder_mappings: internal project members read; every write goes through the trusted
-- (service-role) storage writer after the use-case authorized the caller. Contractors never read it.
DROP POLICY IF EXISTS infra_folder_mappings_select ON public.infra_folder_mappings;
CREATE POLICY infra_folder_mappings_select ON public.infra_folder_mappings
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );
DROP POLICY IF EXISTS infra_folder_mappings_service_all ON public.infra_folder_mappings;
CREATE POLICY infra_folder_mappings_service_all ON public.infra_folder_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- infra_captures: a capture is visible exactly when its evidence row is visible (evidence_items_select
-- already encodes internal project.view, contractor visibility and company scope).
DROP POLICY IF EXISTS infra_captures_select ON public.infra_captures;
CREATE POLICY infra_captures_select ON public.infra_captures
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evidence_items e
      WHERE e.id = infra_captures.evidence_id
        AND e.organization_id = infra_captures.organization_id
    )
  );
DROP POLICY IF EXISTS infra_captures_insert_internal ON public.infra_captures;
CREATE POLICY infra_captures_insert_internal ON public.infra_captures
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
    AND created_by_actor_type = 'internal'
    AND created_by_user_id = app.current_user_id()
  );
DROP POLICY IF EXISTS infra_captures_insert_external ON public.infra_captures;
CREATE POLICY infra_captures_insert_external ON public.infra_captures
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.document.upload')
    AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.document.upload')
  );
DROP POLICY IF EXISTS infra_captures_update_internal ON public.infra_captures;
CREATE POLICY infra_captures_update_internal ON public.infra_captures
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (created_by_actor_type = 'internal' AND created_by_user_id = app.current_user_id()
        AND app.has_project_capability(organization_id, project_id, 'project.view'))
      OR app.has_project_capability(organization_id, project_id, 'documents.share')
      OR app.has_project_capability(organization_id, project_id, 'project.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );
DROP POLICY IF EXISTS infra_captures_update_external ON public.infra_captures;
CREATE POLICY infra_captures_update_external ON public.infra_captures
  FOR UPDATE TO authenticated
  USING (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.document.upload')
  )
  WITH CHECK (created_by_principal_id = app.external_principal_id());
DROP POLICY IF EXISTS infra_captures_service_all ON public.infra_captures;
CREATE POLICY infra_captures_service_all ON public.infra_captures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- infra_capture_versions / infra_markings: readable when the parent capture is readable;
-- insertable by the capture's author or a project manager.
DROP POLICY IF EXISTS infra_capture_versions_select ON public.infra_capture_versions;
CREATE POLICY infra_capture_versions_select ON public.infra_capture_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.infra_captures c
      WHERE c.id = infra_capture_versions.capture_id
        AND c.organization_id = infra_capture_versions.organization_id
    )
  );
DROP POLICY IF EXISTS infra_capture_versions_insert ON public.infra_capture_versions;
CREATE POLICY infra_capture_versions_insert ON public.infra_capture_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.infra_captures c
      WHERE c.id = infra_capture_versions.capture_id
        AND c.organization_id = infra_capture_versions.organization_id
        AND c.project_id = infra_capture_versions.project_id
        AND (
          (c.created_by_actor_type = 'internal' AND c.created_by_user_id = app.current_user_id()
            AND infra_capture_versions.created_by_actor_type = 'internal'
            AND infra_capture_versions.created_by_user_id = app.current_user_id())
          OR (c.created_by_actor_type = 'external'
            AND c.created_by_principal_id = app.external_principal_id()
            AND infra_capture_versions.created_by_actor_type = 'external'
            AND infra_capture_versions.created_by_principal_id = app.external_principal_id())
          OR (app.is_org_member(c.organization_id)
            AND infra_capture_versions.created_by_actor_type = 'internal'
            AND infra_capture_versions.created_by_user_id = app.current_user_id()
            AND (app.has_project_capability(c.organization_id, c.project_id, 'project.manage')
              OR app.has_project_capability(c.organization_id, c.project_id, 'documents.share')))
        )
    )
  );
DROP POLICY IF EXISTS infra_capture_versions_service_all ON public.infra_capture_versions;
CREATE POLICY infra_capture_versions_service_all ON public.infra_capture_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS infra_markings_select ON public.infra_markings;
CREATE POLICY infra_markings_select ON public.infra_markings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.infra_captures c
      WHERE c.id = infra_markings.capture_id
        AND c.organization_id = infra_markings.organization_id
    )
  );
DROP POLICY IF EXISTS infra_markings_insert ON public.infra_markings;
CREATE POLICY infra_markings_insert ON public.infra_markings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.infra_capture_versions v
      WHERE v.id = infra_markings.version_id
        AND v.organization_id = infra_markings.organization_id
        AND v.capture_id = infra_markings.capture_id
        AND v.project_id = infra_markings.project_id
        AND (
          (v.created_by_actor_type = 'internal' AND v.created_by_user_id = app.current_user_id())
          OR (v.created_by_actor_type = 'external'
            AND v.created_by_principal_id = app.external_principal_id())
        )
    )
  );
DROP POLICY IF EXISTS infra_markings_service_all ON public.infra_markings;
CREATE POLICY infra_markings_service_all ON public.infra_markings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- infra_comparisons: internal project members read all; contractors read only their own saves.
DROP POLICY IF EXISTS infra_comparisons_select ON public.infra_comparisons;
CREATE POLICY infra_comparisons_select ON public.infra_comparisons
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR (created_by_actor_type = 'external'
      AND created_by_principal_id = app.external_principal_id())
  );
DROP POLICY IF EXISTS infra_comparisons_insert_internal ON public.infra_comparisons;
CREATE POLICY infra_comparisons_insert_internal ON public.infra_comparisons
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
    AND created_by_actor_type = 'internal'
    AND created_by_user_id = app.current_user_id()
  );
DROP POLICY IF EXISTS infra_comparisons_insert_external ON public.infra_comparisons;
CREATE POLICY infra_comparisons_insert_external ON public.infra_comparisons
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.document.upload')
    AND app.docs_external_capability(organization_id, project_id, vendor_id, 'ext.document.upload')
  );
DROP POLICY IF EXISTS infra_comparisons_update_internal ON public.infra_comparisons;
CREATE POLICY infra_comparisons_update_internal ON public.infra_comparisons
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (created_by_actor_type = 'internal' AND created_by_user_id = app.current_user_id()
        AND app.has_project_capability(organization_id, project_id, 'project.view'))
      OR app.has_project_capability(organization_id, project_id, 'project.manage')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );
DROP POLICY IF EXISTS infra_comparisons_update_external ON public.infra_comparisons;
CREATE POLICY infra_comparisons_update_external ON public.infra_comparisons
  FOR UPDATE TO authenticated
  USING (
    created_by_actor_type = 'external'
    AND created_by_principal_id = app.external_principal_id()
  )
  WITH CHECK (created_by_principal_id = app.external_principal_id());
DROP POLICY IF EXISTS infra_comparisons_service_all ON public.infra_comparisons;
CREATE POLICY infra_comparisons_service_all ON public.infra_comparisons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.infra_folder_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.infra_captures TO authenticated;
GRANT SELECT, INSERT ON public.infra_capture_versions TO authenticated;
GRANT SELECT, INSERT ON public.infra_markings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.infra_comparisons TO authenticated;
GRANT ALL PRIVILEGES ON public.infra_folder_mappings TO service_role;
GRANT ALL PRIVILEGES ON public.infra_captures TO service_role;
GRANT ALL PRIVILEGES ON public.infra_capture_versions TO service_role;
GRANT ALL PRIVILEGES ON public.infra_markings TO service_role;
GRANT ALL PRIVILEGES ON public.infra_comparisons TO service_role;
