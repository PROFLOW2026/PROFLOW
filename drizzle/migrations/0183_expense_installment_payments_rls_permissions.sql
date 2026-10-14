-- 0183: 0180 RLS used non-catalog permissions financials.read / financials.write.
-- Pending journal (Gate B). Aligns with 0180 table + 0182 grants; single corrective RLS install.
-- Align with expenses.finalize (write) and project_financials.read (select).

SELECT app.install_org_parent_table_rls(
  'expense_installment_payments',
  'expenses',
  'expense_id',
  'project_financials.read',
  'expenses.finalize'
);
