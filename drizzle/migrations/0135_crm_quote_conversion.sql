-- Migration 0135: CRM quote → product quote traceability
-- Adds source_crm_quote_id to estimates so product quotes created by converting
-- a CRM sales quote carry a back-reference to the originating CRM quote.
-- Safe to apply: additive-only, SET NULL on CRM quote delete.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS source_crm_quote_id uuid
    REFERENCES crm_sales_quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS estimates_source_crm_quote_id_idx
  ON estimates (source_crm_quote_id)
  WHERE source_crm_quote_id IS NOT NULL;
