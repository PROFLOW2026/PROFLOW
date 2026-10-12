-- 0180 installed RLS via app.install_org_parent_table_rls but omitted table GRANTs for authenticated.
-- Without SELECT, dashboard recognized-cost reads fail with SQLSTATE 42501 on Production.

REVOKE ALL ON public.expense_installment_payments FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expense_installment_payments TO authenticated;
GRANT ALL PRIVILEGES ON public.expense_installment_payments TO service_role;
