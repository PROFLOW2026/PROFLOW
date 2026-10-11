-- Prepared only — do NOT apply to Production without explicit Owner approval.
-- Canonical per-installment payment ledger (mirrors audit + future writes from expense-payments).

CREATE TABLE IF NOT EXISTS expense_installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL,
  installment_index integer NOT NULL,
  due_date date NOT NULL,
  actual_paid_at date NOT NULL,
  gross_paid numeric(18, 6) NOT NULL CHECK (gross_paid > 0),
  net_paid numeric(18, 6) NOT NULL CHECK (net_paid >= 0),
  vat_paid numeric(18, 6) NOT NULL DEFAULT 0 CHECK (vat_paid >= 0),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'voided', 'credited')),
  payment_reference text,
  audit_event_id uuid REFERENCES audit_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_installment_payments_expense_org_fk
    FOREIGN KEY (expense_id, organization_id) REFERENCES expenses(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT expense_installment_payments_index_range
    CHECK (installment_index >= 0 AND installment_index < 120),
  CONSTRAINT expense_installment_payments_unique_active
    UNIQUE (organization_id, expense_id, installment_index, status)
);

CREATE INDEX IF NOT EXISTS expense_installment_payments_org_paid_idx
  ON expense_installment_payments (organization_id, actual_paid_at);

CREATE INDEX IF NOT EXISTS expense_installment_payments_expense_idx
  ON expense_installment_payments (expense_id);

COMMENT ON TABLE expense_installment_payments IS
  'Per-installment actual payment dates and amounts. Runtime may use audit_events until backfill.';
