-- 0136: Change Order Billing Handoff — billing_condition on change_orders
-- Migration after 0135. Do not modify migrations 0000–0135.
--
-- PURPOSE: Add billing_condition to change_orders so the billing team knows
--   *when* the owner expects to invoice for an approved change (immediate,
--   milestone, custom_terms, or deferred). No auto-create of billing records.
--
-- ADDITIVE ONLY: new enum type + nullable column. No backfill needed; NULL
--   means "not yet decided" which is the same as the legacy default.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_condition') THEN
    CREATE TYPE billing_condition AS ENUM (
      'immediate',
      'milestone',
      'custom_terms',
      'deferred'
    );
  END IF;
END $$;

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS billing_condition billing_condition NULL;

-- Index is not critical (low-cardinality column on a small table) but useful
-- for dashboard queries that count change orders by billing condition.
CREATE INDEX IF NOT EXISTS change_orders_billing_condition_idx
  ON change_orders (organization_id, billing_condition)
  WHERE billing_condition IS NOT NULL;
