-- 0075: Organization-configurable work week start day.
-- Additive only. Does NOT modify 0000–0072.
-- UNAPPLIED — Owner applies later.
--
-- 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
-- Default 0 preserves current Sunday-start week behavior.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS work_week_start_day SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_work_week_start_day_range;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_work_week_start_day_range
  CHECK (work_week_start_day >= 0 AND work_week_start_day <= 6);

COMMENT ON COLUMN public.organizations.work_week_start_day IS
  '0=Sunday, 1=Monday, ..., 6=Saturday. Default 0 preserves current Sunday-start weeks.';
