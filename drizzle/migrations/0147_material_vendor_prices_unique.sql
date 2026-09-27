-- 0147: Add unique constraint to material_vendor_prices for idempotent imports
--
-- The constraint prevents re-importing the SAME price observation twice.
-- Multiple prices for the same item/vendor/date ARE allowed (different invoices);
-- they all contribute to the monthly average in the supplier signal calculation.
--
-- Uniqueness key: (organization_id, material_item_id, vendor_id, effective_from, unit_price)
-- This is the idempotency key used by the importer.
--
-- Idempotent: safe to re-run even if constraint already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'material_vendor_prices'
      AND constraint_name = 'material_vendor_prices_item_vendor_date_price_uq'
  ) THEN
    ALTER TABLE public.material_vendor_prices
      ADD CONSTRAINT material_vendor_prices_item_vendor_date_price_uq
        UNIQUE (organization_id, material_item_id, vendor_id, effective_from, unit_price);
  END IF;
END $$;
