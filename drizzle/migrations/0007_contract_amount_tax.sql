-- Contract amount tax mode: capture entered amount, include/exclude VAT, and
-- derived net / tax / gross. original_value_amount remains the net commercial
-- figure used by contract value events and profitability.

ALTER TABLE "contracts"
  ADD COLUMN "entered_value_amount" numeric(18, 6),
  ADD COLUMN "amount_includes_tax" boolean DEFAULT false NOT NULL,
  ADD COLUMN "original_tax_amount" numeric(18, 6),
  ADD COLUMN "original_gross_amount" numeric(18, 6),
  ADD COLUMN "tax_snapshot" jsonb;

-- Historical rows: treat the stored original as net / excluding VAT.
UPDATE "contracts"
SET
  "entered_value_amount" = "original_value_amount",
  "amount_includes_tax" = false,
  "original_tax_amount" = CASE
    WHEN "original_value_amount" IS NULL THEN NULL
    ELSE 0
  END,
  "original_gross_amount" = "original_value_amount"
WHERE "original_value_amount" IS NOT NULL;
