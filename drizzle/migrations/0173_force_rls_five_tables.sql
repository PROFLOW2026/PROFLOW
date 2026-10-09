-- 0173: OPS-B-003 — FORCE RLS on five tenant tables (0001 invariant parity).
-- PREPARED ONLY — Owner applies after review. Purely additive; no policy/grant changes.
--
-- PURPOSE: migrations.test.ts requires every public heap table with organization_id to have
-- ENABLE + FORCE row level security. These five had ENABLE only (0152–0163 era).
--
-- DATA MUTATION: none
-- SCHEMA MUTATION: relforcerowsecurity only

ALTER TABLE public.subcontract_claim_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_submittal_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_text_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_default_text_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_correction_requests FORCE ROW LEVEL SECURITY;
