-- 0193: Canonical profile images — employee avatar, contractor principal avatar, vendor company logo.
-- Owner SQL approved 2026-10-18. Image bytes live in object storage; columns store keys + metadata only.

-- Employee personal avatar (org-scoped workforce identity).
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS avatar_image_key text,
  ADD COLUMN IF NOT EXISTS avatar_image_content_type text,
  ADD COLUMN IF NOT EXISTS avatar_image_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_image_updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

-- Contractor principal personal avatar (external_principals — not vendor/company).
ALTER TABLE public.external_principals
  ADD COLUMN IF NOT EXISTS avatar_image_key text,
  ADD COLUMN IF NOT EXISTS avatar_image_content_type text,
  ADD COLUMN IF NOT EXISTS avatar_image_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_image_updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

-- Vendor / contractor company logo (distinct from principal avatar).
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS logo_image_key text,
  ADD COLUMN IF NOT EXISTS logo_image_content_type text,
  ADD COLUMN IF NOT EXISTS logo_image_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS logo_image_updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;
