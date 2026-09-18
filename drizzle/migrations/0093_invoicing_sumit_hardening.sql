-- SUMIT invoicing integration hardening (Phase 1 / Milestone A).
-- Owner applies manually — do not modify 0000–0092.

--------------------------------------------------------------------------------
-- Composite unique for credential vault FK (connection + org)
-- MUST precede app.invoicing_provider_credential_refs — PostgreSQL requires
-- the referenced UNIQUE/PK constraint to exist when the FK is created.
-- Pattern: 0087 organization_storage_connections_id_org_uq before vault table.
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS external_invoicing_provider_connections_id_org_uq
  ON public.external_invoicing_provider_connections (id, organization_id);

--------------------------------------------------------------------------------
-- Service-only credential vault for external invoicing providers
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.invoicing_provider_credential_refs (
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL PRIMARY KEY,
  credentials_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoicing_provider_credential_refs_nonblank CHECK (
    length(btrim(credentials_ref)) > 0
  ),
  CONSTRAINT invoicing_provider_credential_refs_connection_fk
    FOREIGN KEY (connection_id, organization_id)
    REFERENCES public.external_invoicing_provider_connections (id, organization_id)
    ON DELETE CASCADE
);

ALTER TABLE app.invoicing_provider_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoicing_provider_credential_refs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoicing_provider_credential_refs_service_all
  ON app.invoicing_provider_credential_refs;
CREATE POLICY invoicing_provider_credential_refs_service_all
  ON app.invoicing_provider_credential_refs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE app.invoicing_provider_credential_refs FROM PUBLIC;
REVOKE ALL ON TABLE app.invoicing_provider_credential_refs FROM anon;
REVOKE ALL ON TABLE app.invoicing_provider_credential_refs FROM authenticated;
GRANT ALL ON TABLE app.invoicing_provider_credential_refs TO service_role;

--------------------------------------------------------------------------------
-- External statutory documents — issuance + reconciliation
--------------------------------------------------------------------------------

ALTER TABLE public.external_statutory_documents
  ADD COLUMN IF NOT EXISTS issuance_outcome text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS reconciliation_metadata jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.external_statutory_documents
  DROP CONSTRAINT IF EXISTS external_statutory_documents_issuance_outcome_known;

ALTER TABLE public.external_statutory_documents
  ADD CONSTRAINT external_statutory_documents_issuance_outcome_known
  CHECK (
    issuance_outcome IS NULL
    OR issuance_outcome IN (
      'in_flight',
      'confirmed_rejected',
      'confirmed_created',
      'ambiguous'
    )
  );

ALTER TABLE public.external_statutory_documents
  DROP CONSTRAINT IF EXISTS external_statutory_documents_reconciliation_status_known;

ALTER TABLE public.external_statutory_documents
  ADD CONSTRAINT external_statutory_documents_reconciliation_status_known
  CHECK (
    reconciliation_status IS NULL
    OR reconciliation_status IN ('pending', 'matched', 'mismatch', 'not_available')
  );

COMMENT ON COLUMN public.external_statutory_documents.issuance_outcome IS
  'Provider create attempt outcome — blocks duplicate issuance when in_flight/ambiguous/confirmed_created.';

COMMENT ON COLUMN public.external_statutory_documents.reconciliation_status IS
  'Orthogonal to status — amount match vs billing after confirmed provider document.';

COMMENT ON COLUMN public.external_statutory_documents.idempotency_key IS
  'Canonical PF key pf:{billingRecordId}:{kind}:v1 — also SUMIT ExternalReference. One row per key; confirmed_rejected retry reopens the same row (no second INSERT).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_stat_docs_blocking_tax_invoice_uq
  ON public.external_statutory_documents (organization_id, billing_record_id, kind)
  WHERE kind = 'tax_invoice'
    AND issuance_outcome IN ('in_flight', 'ambiguous', 'confirmed_created');

-- Enforces one external_statutory_documents row per canonical billing idempotency key.
-- Compatible with confirmed_rejected retry: application reopens the same row in_flight
-- instead of INSERTing a second row with the same pf:{billingRecordId}:{kind}:v1 key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_stat_docs_org_idempotency_uq
  ON public.external_statutory_documents (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ext_stat_docs_org_issuance_outcome
  ON public.external_statutory_documents (organization_id, issuance_outcome)
  WHERE issuance_outcome IS NOT NULL;

--------------------------------------------------------------------------------
-- Billing — customer snapshot for statutory issuance
--------------------------------------------------------------------------------

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS customer_snapshot jsonb;

COMMENT ON COLUMN public.billing_records.customer_snapshot IS
  'Frozen buyer identity at finalize (or deliberate issuance capture) for external statutory docs.';

--------------------------------------------------------------------------------
-- RLS hardening on provider connections
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls(
  'external_invoicing_provider_connections',
  'integrations.read',
  'settings.manage',
  NULL
);
