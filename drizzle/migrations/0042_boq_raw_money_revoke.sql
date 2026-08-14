-- 0042_boq_raw_money_revoke
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- 0035 already REVOKE SELECT ON boq_nodes FROM authenticated and grants
-- boq_nodes_secure. This closes remaining DML/ALL grants so ordinary product
-- clients cannot SELECT raw unit prices. Server canonical writes stay on
-- service_role / SECURITY DEFINER RPCs (worker quantity entry included).

REVOKE ALL ON TABLE public.boq_nodes FROM PUBLIC;
REVOKE ALL ON TABLE public.boq_nodes FROM authenticated;

GRANT ALL ON TABLE public.boq_nodes TO service_role;

GRANT SELECT ON public.boq_nodes_secure TO authenticated;
GRANT SELECT ON public.boq_nodes_secure TO service_role;

-- Defense in depth: authenticated must not inherit column-level grants.
REVOKE ALL ON TABLE public.boq_nodes FROM authenticated;
