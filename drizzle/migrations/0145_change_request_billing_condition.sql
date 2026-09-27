-- 0145: Add billing_condition to change_requests (draft stage)
--
-- The billing_condition enum was already created in migration 0136 for
-- change_orders. This migration extends it to change_requests so the
-- owner can set expected billing timing while the change is still a draft.
-- The value is preserved and visible on the change order after approval.
--
-- Additive only — nullable column, no data mutation.

ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS billing_condition billing_condition NULL;

CREATE INDEX IF NOT EXISTS change_requests_billing_condition_idx
  ON public.change_requests (organization_id, billing_condition)
  WHERE billing_condition IS NOT NULL;
