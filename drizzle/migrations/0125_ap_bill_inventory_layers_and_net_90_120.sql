-- 0125: AP-bill inventory cost layers, and Net 90 / Net 120 payment terms.
-- Migration after 0124. Additive. Do not modify 0000–0124.
--
-- PURPOSE
-- ───────
-- 1. Allow inventory_cost_layers.source_kind = 'ap_bill' so a vendor bill
--    classified as a stock purchase can book a FIFO layer. Operating actual
--    still starts at project_consume, not at the bill.
-- 2. Seed net_90 and net_120 (net_days) for organizations that already exist.
--    New organizations receive them from DEFAULT_PAYMENT_TERMS.

--------------------------------------------------------------------------------
-- Section A — inventory cost layer source shape
--------------------------------------------------------------------------------

ALTER TABLE public.inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_source_shape;

ALTER TABLE public.inventory_cost_layers
  ADD CONSTRAINT inventory_cost_layers_source_shape
  CHECK (
    (source_kind = 'expense' AND source_expense_id IS NOT NULL AND source_ap_bill_id IS NULL)
    OR (source_kind = 'ap_bill' AND source_ap_bill_id IS NOT NULL AND source_expense_id IS NULL)
    OR (
      source_kind = 'opening_balance'
      AND source_expense_id IS NULL
      AND source_ap_bill_id IS NULL
      AND opening_reference IS NOT NULL
      AND length(trim(opening_reference)) > 0
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_source_ap_bill_uq
  ON public.inventory_cost_layers (organization_id, source_ap_bill_id)
  WHERE source_ap_bill_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_cost_layers.source_ap_bill_id IS
  'Set when source_kind = ap_bill. One layer per vendor bill. Stock value until project_consume.';

--------------------------------------------------------------------------------
-- Section B — Net 90 and Net 120 for existing organizations
--------------------------------------------------------------------------------

INSERT INTO public.organization_catalog_entries (
  organization_id, kind, key, name, metadata, sort_order, is_system, is_active
)
SELECT o.id, v.kind, v.key, v.name, v.metadata::jsonb, v.sort_order, true, true
FROM public.organizations o
CROSS JOIN (
  VALUES
    (
      'payment_term',
      'net_90',
      'Net 90',
      '{"strategy":"net_days","netDays":90}',
      62
    ),
    (
      'payment_term',
      'net_120',
      'Net 120',
      '{"strategy":"net_days","netDays":120}',
      64
    )
) AS v(kind, key, name, metadata, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_catalog_entries e
  WHERE e.organization_id = o.id
    AND e.kind = v.kind
    AND e.key = v.key
);
