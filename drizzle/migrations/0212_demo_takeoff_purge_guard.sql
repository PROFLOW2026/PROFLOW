-- 0212_demo_takeoff_purge_guard.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- Local PGlite probe on 2026-11-15, tables probe_org / probe_analysis / probe_detection:
--   CASCADE child BEFORE DELETE: pg_trigger_depth() = 2, organization row gone, analysis row gone,
--   transaction-local nonce still equal to the value written by the organization BEFORE DELETE.
--   Direct DELETE: pg_trigger_depth() = 1, even when the same transaction sets the nonce.
--   Analysis-only DELETE: depth 2, organization row still visible, analysis row gone.
-- Measured direct depth is 1. The allow threshold is therefore depth > 1.
--
-- Does not edit 0205-0210. Does not replace documents_current_version_guard or takeoff_approvals_guard.
-- Real-organization DELETE still fails: no proof row is written, and an organization cascade
-- has already removed the organization row so the analysis-delete exception does not apply.
-- The analysis-delete exception below keeps the journal's 0210 behavior for a real analysis
-- delete, where the organization row is still visible. It does not authorize deleting a real organization.

CREATE TABLE IF NOT EXISTS public.demo_takeoff_purge_proof (
  organization_id uuid PRIMARY KEY,
  nonce text NOT NULL,
  CONSTRAINT demo_takeoff_purge_proof_nonce_present CHECK (nonce <> '')
);

ALTER TABLE public.demo_takeoff_purge_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_takeoff_purge_proof FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_takeoff_purge_proof FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.demo_takeoff_purge_proof_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_nonce text;
BEGIN
  IF OLD.demo_kind = 'session' AND EXISTS (
    SELECT 1 FROM public.demo_sessions AS session_row
    WHERE session_row.organization_id = OLD.id
  ) THEN
    v_nonce := gen_random_uuid()::text;
    DELETE FROM public.demo_takeoff_purge_proof WHERE organization_id = OLD.id;
    INSERT INTO public.demo_takeoff_purge_proof (organization_id, nonce)
    VALUES (OLD.id, v_nonce);
    PERFORM set_config('app.demo_takeoff_purge_nonce', v_nonce, true);
  ELSE
    DELETE FROM public.demo_takeoff_purge_proof WHERE organization_id = OLD.id;
    PERFORM set_config('app.demo_takeoff_purge_nonce', '', true);
  END IF;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS organizations_demo_takeoff_purge_proof ON public.organizations;
CREATE TRIGGER organizations_demo_takeoff_purge_proof
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION app.demo_takeoff_purge_proof_write();

CREATE OR REPLACE FUNCTION app.takeoff_block_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_nonce text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_nonce := current_setting('app.demo_takeoff_purge_nonce', true);
    IF pg_trigger_depth() > 1
       AND v_nonce IS NOT NULL
       AND v_nonce <> ''
       AND EXISTS (
         SELECT 1
         FROM public.demo_takeoff_purge_proof AS proof
         WHERE proof.organization_id = OLD.organization_id
           AND proof.nonce = v_nonce
       ) THEN
      RETURN OLD;
    END IF;

    -- 0210 analysis delete: the analysis row is already gone and the organization row remains.
    -- An organization DELETE has already removed that row, so this branch does not allow it.
    IF NOT EXISTS (
      SELECT 1
      FROM public.takeoff_analyses AS analysis
      WHERE analysis.id = OLD.analysis_id
        AND analysis.organization_id = OLD.organization_id
    ) AND EXISTS (
      SELECT 1
      FROM public.organizations AS org
      WHERE org.id = OLD.organization_id
    ) THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

REVOKE ALL ON FUNCTION app.demo_takeoff_purge_proof_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.takeoff_block_update() FROM PUBLIC;
