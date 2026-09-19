-- Universal Work Management: Organization profile type + terminology/module config.
-- Migration N+0 (0096). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0095.

--------------------------------------------------------------------------------
-- 1. Enum: org_profile_type
--------------------------------------------------------------------------------

CREATE TYPE public.org_profile_type AS ENUM (
  'contractor',
  'subcontractor',
  'architect',
  'engineer',
  'consultant',
  'project_manager',
  'developer',
  'supervisor',
  'other'
);

--------------------------------------------------------------------------------
-- 2. Extend organizations table
--------------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_profile_type public.org_profile_type,
  ADD COLUMN IF NOT EXISTS terminology_config jsonb,
  ADD COLUMN IF NOT EXISTS module_config jsonb;

COMMENT ON COLUMN public.organizations.org_profile_type IS
  'Profession type controlling default stages, templates and navigation presets.';
COMMENT ON COLUMN public.organizations.terminology_config IS
  'JSON map of canonical entity names to org-defined labels (e.g. {"project":"File","task":"Action"}).';
COMMENT ON COLUMN public.organizations.module_config IS
  'JSON map of module keys to enabled booleans (navigation/UX only — no data deleted).';
