-- Statutory receipt / payment linkage + extended document kinds (Phase B).
-- Owner applies via npm run db:migrate — do not modify 0000–0093.

--------------------------------------------------------------------------------
-- Link statutory documents to confirmed payments (receipts)
--------------------------------------------------------------------------------

ALTER TABLE public.external_statutory_documents
  ADD COLUMN IF NOT EXISTS payment_id uuid;

ALTER TABLE public.external_statutory_documents
  DROP CONSTRAINT IF EXISTS external_statutory_documents_payment_org_fk;

ALTER TABLE public.external_statutory_documents
  ADD CONSTRAINT external_statutory_documents_payment_org_fk
  FOREIGN KEY (payment_id, organization_id)
  REFERENCES public.payments (id, organization_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ext_stat_docs_org_payment
  ON public.external_statutory_documents (organization_id, payment_id)
  WHERE payment_id IS NOT NULL;

COMMENT ON COLUMN public.external_statutory_documents.payment_id IS
  'Confirmed ProjectFlow payment for receipt / payment-linked statutory documents.';

--------------------------------------------------------------------------------
-- Extended document kinds
--------------------------------------------------------------------------------

ALTER TABLE public.external_statutory_documents
  DROP CONSTRAINT IF EXISTS external_statutory_documents_kind_known;

ALTER TABLE public.external_statutory_documents
  ADD CONSTRAINT external_statutory_documents_kind_known
  CHECK (
    kind IN (
      'tax_invoice',
      'credit_note',
      'receipt',
      'proforma',
      'other',
      'tax_invoice_receipt',
      'transaction_invoice'
    )
  );

--------------------------------------------------------------------------------
-- One blocking receipt per payment (idempotency scope)
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_stat_docs_blocking_receipt_payment_uq
  ON public.external_statutory_documents (organization_id, payment_id)
  WHERE
    kind = 'receipt'
    AND payment_id IS NOT NULL
    AND issuance_outcome IN ('in_flight', 'ambiguous', 'confirmed_created');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_stat_docs_blocking_tax_invoice_receipt_payment_uq
  ON public.external_statutory_documents (organization_id, payment_id)
  WHERE
    kind = 'tax_invoice_receipt'
    AND payment_id IS NOT NULL
    AND issuance_outcome IN ('in_flight', 'ambiguous', 'confirmed_created');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_stat_docs_blocking_transaction_invoice_uq
  ON public.external_statutory_documents (organization_id, billing_record_id, kind)
  WHERE
    kind = 'transaction_invoice'
    AND issuance_outcome IN ('in_flight', 'ambiguous', 'confirmed_created');
