-- 0196: (1) optional level on an infrastructure capture, (2) per-location restriction of a contractor grant.
--
-- STATUS: PREPARED, NOT APPLIED. Do not run without separate explicit Owner SQL approval.
-- 0195 is already applied and is NOT modified; this is the next additive migration.
--
-- Additive only: two nullable columns, one composite FK, one index and two CHECK constraints.
-- No existing row is read, moved, rewritten or deleted. Existing captures keep level_id = NULL (the
-- gallery then falls back to the location tree, exactly as before) and existing grants keep
-- allowed_location_ids = NULL (= no restriction, exactly as before).

--------------------------------------------------------------------------------
-- 1. infra_captures.level_id: the level a photo/video was documented on (units that span several levels)
--------------------------------------------------------------------------------

ALTER TABLE public.infra_captures
  ADD COLUMN IF NOT EXISTS level_id uuid;

-- Same organization AND project as the capture; a deleted level only clears the column (the capture stays).
ALTER TABLE public.infra_captures DROP CONSTRAINT IF EXISTS infra_captures_level_fk;
ALTER TABLE public.infra_captures
  ADD CONSTRAINT infra_captures_level_fk
  FOREIGN KEY (level_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (level_id);

CREATE INDEX IF NOT EXISTS infra_captures_level_idx
  ON public.infra_captures (organization_id, project_id, level_id, captured_at DESC, id DESC)
  WHERE removed_at IS NULL AND level_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. external_access_grants.allowed_location_ids: restrict a contractor grant to specific units/locations
--    NULL = the whole project (every existing grant). The application enforces the restriction on the server
--    (location tree, captures, files); the array holds location ids of the grant's own project.
--------------------------------------------------------------------------------

ALTER TABLE public.external_access_grants
  ADD COLUMN IF NOT EXISTS allowed_location_ids uuid[];

ALTER TABLE public.external_access_grants DROP CONSTRAINT IF EXISTS external_access_grants_allowed_locations_shape;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_allowed_locations_shape CHECK (
    allowed_location_ids IS NULL
    OR (
      portal_kind = 'contractor'
      AND project_id IS NOT NULL
      AND cardinality(allowed_location_ids) BETWEEN 1 AND 200
    )
  );
