-- 0053_estimates_opportunity
-- Additive only. Does NOT modify 0000–0052.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Links the owner-facing bid path (`estimates` / /quotes) to an optional CRM
-- opportunity. Composite org FK so a quote cannot point at another tenant's
-- opportunity. ON DELETE SET NULL (opportunity_id) only — never organization_id.
-- Does not create a second financial engine. CRM sales quotes stay internal.
-- Portal stays off.

CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_id_organization_id_uq
  ON public.crm_opportunities (id, organization_id);

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS opportunity_id uuid;

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_opportunity_fk;
ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_opportunity_org_fk;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_opportunity_org_fk
  FOREIGN KEY (opportunity_id, organization_id)
  REFERENCES public.crm_opportunities (id, organization_id)
  ON DELETE SET NULL (opportunity_id);

CREATE INDEX IF NOT EXISTS estimates_org_opportunity_idx
  ON public.estimates (organization_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL;
