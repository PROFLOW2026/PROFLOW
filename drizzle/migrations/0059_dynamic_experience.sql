-- 0059_dynamic_experience
-- Additive only. Does NOT modify 0000–0058.
-- UNAPPLIED — Owner applies later.
--
-- Optional projects.experience_profile for presentation/defaults only.
-- NULL = derive at runtime from work kind + org business profile (no backfill).
-- Does not invent a second financial entity or project engine.
--
-- RLS: no new table; existing projects RLS covers this column.

--------------------------------------------------------------------------------
-- projects.experience_profile (nullable presentation overlay)
--------------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS experience_profile text;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_experience_profile_known;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_experience_profile_known CHECK (
    experience_profile IS NULL
    OR experience_profile IN (
      'simple',
      'full',
      'boq',
      'consulting',
      'service_installation',
      'small_job'
    )
  );
