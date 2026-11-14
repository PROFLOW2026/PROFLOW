-- Electrical takeoff: persistence mode (org cloud vs ephemeral session)
-- PREPARED — apply only with explicit Owner approval on target DB.

ALTER TABLE public.takeoff_analyses
  ADD COLUMN IF NOT EXISTS persistence_mode text NOT NULL DEFAULT 'persistent';

ALTER TABLE public.takeoff_analyses
  ADD COLUMN IF NOT EXISTS ephemeral_expires_at timestamptz;

ALTER TABLE public.takeoff_analyses
  DROP CONSTRAINT IF EXISTS takeoff_analyses_persistence_known;

ALTER TABLE public.takeoff_analyses
  ADD CONSTRAINT takeoff_analyses_persistence_known
  CHECK (persistence_mode IN ('persistent', 'ephemeral'));

CREATE INDEX IF NOT EXISTS takeoff_analyses_ephemeral_expiry_idx
  ON public.takeoff_analyses (organization_id, ephemeral_expires_at)
  WHERE persistence_mode = 'ephemeral';