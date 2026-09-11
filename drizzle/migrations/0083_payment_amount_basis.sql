-- Explicit payment amount basis (NET business vs GROSS cash).
-- Owner applies manually. Do not modify 0000–0082.

CREATE TYPE payment_amount_basis AS ENUM ('net', 'gross');

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_basis payment_amount_basis;

COMMENT ON COLUMN public.payments.amount_basis IS
  'Semantic of payments.amount: net = business collection ex-VAT; gross = cash incl. VAT.';

-- Audited legacy 9 (org מתח ח.י — VAT-repaired invoices, NET settlement semantics).
UPDATE public.payments
SET amount_basis = 'net'
WHERE id IN (
  'd70fd7db-334a-47b2-9db9-1d991692d938',
  'c6f72c76-b2a8-4a8a-9b50-1f4d54120bd8',
  'fb9a0d05-5d12-4cd7-a6f0-a477db1e0a3c',
  '2b1970a2-e344-45f8-a78d-c76b12be23af',
  '8c9abbdd-2dfd-4cf4-853e-d25992f36d7e',
  '27256611-f188-4b76-9a9a-945571fa09a9',
  '8caf579d-d1a5-4d80-adb7-5096ee3851ff',
  '855503f4-6e89-4386-a91a-41d686cebc28',
  '2157d3c7-ca20-4624-bc2d-7ec4d5200336'
);

ALTER TABLE public.payments
  ALTER COLUMN amount_basis SET DEFAULT 'net';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_recorded_amount_basis_required;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_recorded_amount_basis_required
  CHECK (status <> 'recorded' OR amount_basis IS NOT NULL);
