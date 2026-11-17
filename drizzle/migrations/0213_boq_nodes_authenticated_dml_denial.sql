-- 0213_boq_nodes_authenticated_dml_denial.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
-- 0042 revokes authenticated DML on boq_nodes; integration PGlite runs as superuser (SET ROLE
-- authenticated) so table grants do not deny. Mirror production: draft writes stay on SECURITY
-- DEFINER RPCs only (app.boq_mutate_draft_node and internal allocation writers).

CREATE OR REPLACE FUNCTION app.boq_nodes_block_authenticated_direct_dml()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'permission denied for table boq_nodes' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.boq_nodes_block_authenticated_direct_dml() FROM PUBLIC;

DROP TRIGGER IF EXISTS boq_nodes_block_authenticated_direct_dml_trg ON public.boq_nodes;
CREATE TRIGGER boq_nodes_block_authenticated_direct_dml_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.boq_nodes
  FOR EACH ROW
  EXECUTE FUNCTION app.boq_nodes_block_authenticated_direct_dml();