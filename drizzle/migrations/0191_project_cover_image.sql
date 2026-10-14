-- 0191: Project cover image metadata on projects (U12 / OD-60).
-- Pending journal (Gate B). Nullable columns only; existing RLS on projects unchanged.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cover_image_key text,
  ADD COLUMN IF NOT EXISTS cover_image_content_type text,
  ADD COLUMN IF NOT EXISTS cover_image_width integer,
  ADD COLUMN IF NOT EXISTS cover_image_height integer,
  ADD COLUMN IF NOT EXISTS cover_image_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_image_updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_cover_image_dimensions_positive;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_cover_image_dimensions_positive
  CHECK (
    (cover_image_width IS NULL AND cover_image_height IS NULL)
    OR (cover_image_width IS NOT NULL AND cover_image_height IS NOT NULL AND cover_image_width > 0 AND cover_image_height > 0)
  );
