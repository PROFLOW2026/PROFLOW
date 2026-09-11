-- Billing VAT repair (owner-approved 9 legacy rows) + explicit vat_mode invariant.
-- Owner applies manually — do not modify 0000–0081.

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS vat_mode text;

ALTER TABLE public.billing_records
  DROP CONSTRAINT IF EXISTS billing_records_vat_mode_known;

ALTER TABLE public.billing_records
  ADD CONSTRAINT billing_records_vat_mode_known
  CHECK (vat_mode IS NULL OR vat_mode IN ('inclusive', 'exclusive', 'zero'));

COMMENT ON COLUMN public.billing_records.vat_mode IS
  'Explicit VAT classification at capture/finalize: inclusive | exclusive | zero. Required when status = finalized.';

-- Owner-approved repair: 9 legacy invoices (18% VAT on NET). Org: מתח ח.י הנדסת חשמל.
-- Do not modify reference 0013 (already correct).

UPDATE public.billing_records
SET
  tax_amount = v.tax::numeric,
  total_amount = v.gross::numeric,
  vat_mode = 'exclusive',
  tax_snapshot = jsonb_build_object(
    'currency', currency,
    'subtotalAmount', subtotal_amount,
    'taxAmount', v.tax,
    'totalAmount', v.gross,
    'capturedAt', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
FROM (
  VALUES
    ('0004', '6300.000000', '41300.000000'),
    ('0002', '15102.900000', '99007.900000'),
    ('0003', '2851.200000', '18691.200000'),
    ('0005', '2700.000000', '17700.000000'),
    ('0006', '24300.000000', '159300.000000'),
    ('0007', '7696.530000', '50455.030000'),
    ('0008', '9712.800000', '63672.800000'),
    ('0011', '11883.600000', '77903.600000'),
    ('0012', '13230.000000', '86730.000000')
) AS v(ref, tax, gross)
WHERE billing_records.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND billing_records.reference = v.ref
  AND billing_records.status = 'finalized'
  AND billing_records.archived_at IS NULL;

-- 0013: amounts already correct — classify only.
UPDATE public.billing_records
SET vat_mode = 'exclusive'
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND reference = '0013'
  AND status = 'finalized'
  AND archived_at IS NULL;

-- Backfill other finalized rows so the invariant can be enforced globally.
UPDATE public.billing_records
SET vat_mode = 'exclusive'
WHERE status = 'finalized'
  AND vat_mode IS NULL
  AND tax_amount IS NOT NULL
  AND tax_amount::numeric > 0;

UPDATE public.billing_records
SET
  vat_mode = 'zero',
  tax_amount = '0'
WHERE status = 'finalized'
  AND vat_mode IS NULL
  AND (tax_amount IS NULL OR tax_amount::numeric = 0)
  AND subtotal_amount = total_amount;

-- Finalized billing must have explicit, deterministic VAT state.
ALTER TABLE public.billing_records
  DROP CONSTRAINT IF EXISTS billing_records_finalized_vat_explicit;

ALTER TABLE public.billing_records
  ADD CONSTRAINT billing_records_finalized_vat_explicit
  CHECK (
    status <> 'finalized'
    OR (
      vat_mode IS NOT NULL
      AND (
        (
          vat_mode = 'zero'
          AND COALESCE(tax_amount::numeric, 0) = 0
          AND subtotal_amount = total_amount
        )
        OR (
          vat_mode IN ('inclusive', 'exclusive')
          AND tax_amount IS NOT NULL
          AND ABS(
            total_amount::numeric - (subtotal_amount::numeric + tax_amount::numeric)
          ) <= 0.01
        )
      )
    )
  );
