-- 0061_ops_expense_usage_kinds
-- Allow explicit material/equipment usage → expense draft links (never auto Actual).

ALTER TABLE public.ops_expense_links DROP CONSTRAINT IF EXISTS ops_expense_links_kind_known;
ALTER TABLE public.ops_expense_links
  ADD CONSTRAINT ops_expense_links_kind_known
  CHECK (
    ops_record_kind IN (
      'maintenance_record',
      'compliance_artifact',
      'fleet_vehicle',
      'recurring_business_cost',
      'material_usage_record',
      'equipment_usage_record'
    )
  );

COMMENT ON CONSTRAINT ops_expense_links_kind_known ON public.ops_expense_links IS
  'Ops→finance link kinds. Inventory movements remain forbidden. Usage links create drafts only.';
