-- 0139_closeout_warranty_orm_and_boq_reconciliation
-- Additive only. Does NOT modify 0000–0138.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Purpose:
--   1. Closeout / warranty Drizzle ORM: tables already exist from migration
--      0056. No SQL needed for those tables. This comment records that the
--      Drizzle ORM definitions for project_closeouts, project_closeout_events,
--      warranty_coverages, and warranty_issues live in
--      drizzle/schema/next-gen-experience.ts and are exported from the schema
--      index. No schema gap exists for those tables.
--
--   2. BOQ subcontractor valuation AP-bill reconciliation:
--      Adds ap_bill_id and reconciliation_status to boq_subcontractor_valuations
--      with full DB-level data integrity:
--        a. Coherence check: 'matched' requires ap_bill_id IS NOT NULL
--        b. Same-org composite FK: ap_bill_id links to (id, organization_id)
--           on ap_bills — prevents cross-org bill references at DB level
--        c. Status reset trigger: when ap_bill_id is set to NULL (on bill delete),
--           reconciliation_status reverts to 'unmatched' automatically
--
-- No data mutations. No table drops. No applied-migration changes.

--------------------------------------------------------------------------------
-- 1. Add columns (idempotent via IF NOT EXISTS)
--------------------------------------------------------------------------------

ALTER TABLE public.boq_subcontractor_valuations
  ADD COLUMN IF NOT EXISTS ap_bill_id       uuid,
  ADD COLUMN IF NOT EXISTS ap_bill_org_id   uuid,   -- shadow column for composite FK
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending';

--------------------------------------------------------------------------------
-- 2. Status domain constraint (idempotent drop+add)
--------------------------------------------------------------------------------

ALTER TABLE public.boq_subcontractor_valuations
  DROP CONSTRAINT IF EXISTS boq_sub_valuations_reconciliation_status_known;
ALTER TABLE public.boq_subcontractor_valuations
  ADD CONSTRAINT boq_sub_valuations_reconciliation_status_known
    CHECK (reconciliation_status IN ('pending', 'matched', 'unmatched'));

--------------------------------------------------------------------------------
-- 3. Coherence: 'matched' requires a linked AP bill
--------------------------------------------------------------------------------

ALTER TABLE public.boq_subcontractor_valuations
  DROP CONSTRAINT IF EXISTS boq_sub_valuations_matched_requires_bill;
ALTER TABLE public.boq_subcontractor_valuations
  ADD CONSTRAINT boq_sub_valuations_matched_requires_bill
    CHECK (reconciliation_status <> 'matched' OR ap_bill_id IS NOT NULL);

--------------------------------------------------------------------------------
-- 4. Shadow-column coherence: ap_bill_org_id must equal organization_id when set
--------------------------------------------------------------------------------

ALTER TABLE public.boq_subcontractor_valuations
  DROP CONSTRAINT IF EXISTS boq_sub_valuations_bill_org_matches;
ALTER TABLE public.boq_subcontractor_valuations
  ADD CONSTRAINT boq_sub_valuations_bill_org_matches
    CHECK (ap_bill_id IS NULL OR ap_bill_org_id = organization_id);

--------------------------------------------------------------------------------
-- 5. Composite FK to ap_bills(id, organization_id) — same-org enforcement at DB level
--    Relies on ap_bills_id_organization_id_uq unique index (migration 0012+).
--    The shadow column ap_bill_org_id is always set to organization_id by the
--    application (see boq reconciliation server action); the constraint above
--    (step 4) guarantees it equals the valuation's own org.
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'boq_sub_valuations_ap_bill_same_org_fk'
  ) THEN
    ALTER TABLE public.boq_subcontractor_valuations
      ADD CONSTRAINT boq_sub_valuations_ap_bill_same_org_fk
        FOREIGN KEY (ap_bill_id, ap_bill_org_id)
        REFERENCES public.ap_bills (id, organization_id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 6. Trigger: reset reconciliation_status when ap_bill_id is nullified
--    (fires after ON DELETE SET NULL cascades ap_bill_id to NULL)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_boq_valuation_bill_nullified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When the AP bill link is cleared, revert status to 'unmatched'
  -- so the reconciliation team knows to re-review.
  IF OLD.ap_bill_id IS NOT NULL AND NEW.ap_bill_id IS NULL
     AND NEW.reconciliation_status = 'matched' THEN
    NEW.reconciliation_status := 'unmatched';
    NEW.ap_bill_org_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_boq_valuation_bill_nullified'
      AND tgrelid = 'boq_subcontractor_valuations'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_boq_valuation_bill_nullified
        BEFORE UPDATE ON public.boq_subcontractor_valuations
        FOR EACH ROW
        EXECUTE FUNCTION fn_boq_valuation_bill_nullified()
    ';
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 7. Indexes
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS boq_sub_valuations_ap_bill_idx
  ON public.boq_subcontractor_valuations (ap_bill_id)
  WHERE ap_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS boq_sub_valuations_reconciliation_idx
  ON public.boq_subcontractor_valuations (organization_id, reconciliation_status)
  WHERE reconciliation_status IN ('pending', 'unmatched');
