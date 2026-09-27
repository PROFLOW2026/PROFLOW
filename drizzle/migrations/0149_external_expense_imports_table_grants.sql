-- 0149: external_expense_imports table privileges for authenticated and service_role.
-- 0095 created the table with RLS policies but omitted table GRANTs. Without GRANTs,
-- authenticated SELECT fails with 42501 before RLS runs. Do NOT modify 0095 (already applied).

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.external_expense_imports
TO authenticated;

GRANT ALL PRIVILEGES
ON public.external_expense_imports
TO service_role;
