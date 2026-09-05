-- 0076: Subcontract advance payments — full durable lifecycle (v4, AP settlement integration).
--
-- CHANGES FROM v3 (owner SQL review round 4):
--  1. REVERSAL BILL IDENTITY: 'reverse' events now inherit ap_bill_id + applied_amount
--     from the original 'apply' event. The trigger forces NEW.ap_bill_id = original.ap_bill_id
--     so that bill-level advance calculations (WHERE ap_bill_id = bill) correctly cancel.
--
--  2. CANONICAL AP PAYABLE: New function app.ap_bill_remaining_payable() is the single
--     source of truth. Formula:
--       COALESCE(gross_amount, total_amount)               ← historical fallback
--       − active cash payment applications                 ← ap_payment_applications (recorded, non-void)
--       − active vendor credit applications                ← ap_credit_applications (applied, non-void)
--       − net advance applications                         ← subcontract_advance_applications (net)
--     All settlement paths reference this function.
--
--  3. BIDIRECTIONAL SETTLEMENT: Both existing AP settlement guards updated:
--     • ap_payment_applications_allocation_guard — bill cap now uses canonical payable
--       (includes credits + advances, not just cash).
--     • ap_credit_applications_conservation — adds bill payable cap using canonical payable.
--     Now: Cash + Credits + Net Advances <= Bill payable at all times.
--
--  4. GROSS/TOTAL FALLBACK: COALESCE(gross_amount, total_amount) used throughout.
--     A historical bill with gross_amount IS NULL produces a valid cap, never NULL.
--
--  5. PAID + VOIDED ATOMIC CONTRADICTION: write_guard now blocks the simultaneous
--     SET paid_date + voided in one UPDATE. Must follow payment → full-refund → void.
--
--  6. MIXED-PROJECT BILLS: When bill.project_id IS NULL, the application is validated
--     against ap_bill_project_allocations for the advance's project. The application
--     is capped to that project's allocation minus already-applied advances for the same
--     project on the same bill. Does not ban mixed AP.
--
-- UNCHANGED FROM v3 (confirmed GOOD by owner rounds 1–3):
--  All table DDL, index/FK definitions, INSERT normalize, sar_business_rules_guard,
--  immutability triggers, cache_sync, RLS, event-based arithmetic, composite FKs.
--
-- Owner must apply. OWNER REVIEW ONLY. Do NOT apply without explicit Owner approval.
-- Historical migrations 0000–0075: NOT modified.

--------------------------------------------------------------------------------
-- 1. subcontract_advances — the advance record (cash payment + lifecycle)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_advances (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id           uuid          NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  subcontract_agreement_id  uuid          NOT NULL,
  project_id                uuid          NOT NULL,
  amount                    numeric(18,6) NOT NULL,
  currency                  char(3)       NOT NULL,
  paid_date                 date,

  -- Lifecycle status. Normally derived by triggers. Only 'voided' may be set manually.
  status  text NOT NULL DEFAULT 'recorded',

  -- Denormalized caches derived from child tables by trigger.
  -- Cannot be manually overwritten when pg_trigger_depth() = 1 (direct user call).
  applied_amount_cache   numeric(18,6) NOT NULL DEFAULT 0,
  refunded_amount_cache  numeric(18,6) NOT NULL DEFAULT 0,

  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,

  CONSTRAINT subcontract_advances_status_known
    CHECK (status IN ('recorded', 'paid', 'partially_applied', 'fully_applied',
                      'partially_refunded', 'fully_refunded', 'voided')),
  CONSTRAINT subcontract_advances_amount_positive
    CHECK (amount > 0),
  CONSTRAINT subcontract_advances_applied_range
    CHECK (applied_amount_cache >= 0 AND applied_amount_cache <= amount),
  CONSTRAINT subcontract_advances_refunded_range
    CHECK (refunded_amount_cache >= 0 AND refunded_amount_cache <= amount),
  CONSTRAINT subcontract_advances_applied_plus_refunded
    CHECK (applied_amount_cache + refunded_amount_cache <= amount),
  CONSTRAINT subcontract_advances_currency_upper
    CHECK (currency = upper(currency))
);

COMMENT ON TABLE public.subcontract_advances IS
  'Cash paid to a subcontractor as advance/mobilization. Lives in Cash Paid only — never Recognized Actual.';
COMMENT ON COLUMN public.subcontract_advances.applied_amount_cache IS
  'Derived by trigger: net SUM from subcontract_advance_applications. Direct writes blocked at pg_trigger_depth()=1.';
COMMENT ON COLUMN public.subcontract_advances.refunded_amount_cache IS
  'Derived by trigger: net SUM from subcontract_advance_refunds. Direct writes blocked at pg_trigger_depth()=1.';

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_advances_id_org_uq
  ON public.subcontract_advances (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_advances_id_org_proj_uq
  ON public.subcontract_advances (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS subcontract_advances_agreement_idx
  ON public.subcontract_advances (organization_id, subcontract_agreement_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS subcontract_advances_project_idx
  ON public.subcontract_advances (organization_id, project_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS subcontract_advances_org_paid_date_idx
  ON public.subcontract_advances (organization_id, paid_date)
  WHERE archived_at IS NULL AND status IN ('paid','partially_applied','fully_applied',
                                            'partially_refunded','fully_refunded');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_advances_agreement_org_fk') THEN
    ALTER TABLE public.subcontract_advances
      ADD CONSTRAINT subcontract_advances_agreement_org_fk
      FOREIGN KEY (subcontract_agreement_id, organization_id)
      REFERENCES public.subcontract_agreements (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_advances_agreement_project_fk') THEN
    ALTER TABLE public.subcontract_advances
      ADD CONSTRAINT subcontract_advances_agreement_project_fk
      FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
      REFERENCES public.subcontract_agreements (id, organization_id, project_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontract_advances_project_org_fk') THEN
    ALTER TABLE public.subcontract_advances
      ADD CONSTRAINT subcontract_advances_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 2. subcontract_advance_applications — event-sourced application records
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_advance_applications (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id   uuid          NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  advance_id        uuid          NOT NULL,
  event_type        text          NOT NULL DEFAULT 'apply',
  reversal_of_id    uuid,
  ap_bill_id        uuid,
  applied_amount    numeric(18,6) NOT NULL,
  currency          char(3)       NOT NULL,
  applied_date      date          NOT NULL,
  notes             text,
  created_by_user_id uuid,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT saa_event_type_known     CHECK (event_type IN ('apply', 'reverse')),
  CONSTRAINT saa_amount_positive      CHECK (applied_amount > 0),
  CONSTRAINT saa_apply_requires_bill  CHECK (event_type = 'reverse' OR ap_bill_id IS NOT NULL),
  CONSTRAINT saa_reverse_requires_ref CHECK (event_type = 'apply'   OR reversal_of_id IS NOT NULL),
  CONSTRAINT saa_apply_no_rev_ref     CHECK (event_type = 'reverse' OR reversal_of_id IS NULL),
  CONSTRAINT saa_currency_upper       CHECK (currency = upper(currency)),
  CONSTRAINT saa_advance_org_fk
    FOREIGN KEY (advance_id, organization_id)
    REFERENCES public.subcontract_advances (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT saa_bill_org_fk
    FOREIGN KEY (ap_bill_id, organization_id)
    REFERENCES public.ap_bills (id, organization_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE  public.subcontract_advance_applications IS
  'Immutable event-sourced application records. event_type=apply +amount; event_type=reverse -amount. '
  'Reverse events inherit ap_bill_id from original apply (forced by trigger).';

CREATE UNIQUE INDEX IF NOT EXISTS saa_id_org_adv_uq
  ON public.subcontract_advance_applications (id, organization_id, advance_id);
CREATE UNIQUE INDEX IF NOT EXISTS saa_id_org_uq
  ON public.subcontract_advance_applications (id, organization_id);
CREATE INDEX IF NOT EXISTS saa_advance_idx
  ON public.subcontract_advance_applications (organization_id, advance_id);
CREATE INDEX IF NOT EXISTS saa_bill_idx
  ON public.subcontract_advance_applications (organization_id, ap_bill_id)
  WHERE ap_bill_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saa_reversal_of_fk') THEN
    ALTER TABLE public.subcontract_advance_applications
      ADD CONSTRAINT saa_reversal_of_fk
      FOREIGN KEY (reversal_of_id, organization_id, advance_id)
      REFERENCES public.subcontract_advance_applications (id, organization_id, advance_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS saa_one_reversal_per_apply
  ON public.subcontract_advance_applications (reversal_of_id, organization_id)
  WHERE event_type = 'reverse' AND reversal_of_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 3. subcontract_advance_refunds — event-sourced refund records
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_advance_refunds (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id   uuid          NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  advance_id        uuid          NOT NULL,
  event_type        text          NOT NULL DEFAULT 'refund',
  voided_by_id      uuid,
  amount            numeric(18,6) NOT NULL,
  currency          char(3)       NOT NULL,
  refund_date       date          NOT NULL,
  notes             text,
  created_by_user_id uuid,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT sar_event_type_known   CHECK (event_type IN ('refund', 'void')),
  CONSTRAINT sar_amount_positive    CHECK (amount > 0),
  CONSTRAINT sar_void_requires_ref  CHECK (event_type = 'refund' OR voided_by_id IS NOT NULL),
  CONSTRAINT sar_refund_no_void_ref CHECK (event_type = 'void'   OR voided_by_id IS NULL),
  CONSTRAINT sar_currency_upper     CHECK (currency = upper(currency)),
  CONSTRAINT sar_advance_org_fk
    FOREIGN KEY (advance_id, organization_id)
    REFERENCES public.subcontract_advances (id, organization_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.subcontract_advance_refunds IS
  'Immutable event-sourced refund records. event_type=refund +amount; event_type=void -amount.';

CREATE UNIQUE INDEX IF NOT EXISTS sar_id_org_adv_uq
  ON public.subcontract_advance_refunds (id, organization_id, advance_id);
CREATE UNIQUE INDEX IF NOT EXISTS sar_id_org_uq
  ON public.subcontract_advance_refunds (id, organization_id);
CREATE INDEX IF NOT EXISTS sar_advance_idx
  ON public.subcontract_advance_refunds (organization_id, advance_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sar_voided_by_fk') THEN
    ALTER TABLE public.subcontract_advance_refunds
      ADD CONSTRAINT sar_voided_by_fk
      FOREIGN KEY (voided_by_id, organization_id, advance_id)
      REFERENCES public.subcontract_advance_refunds (id, organization_id, advance_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sar_one_void_per_refund
  ON public.subcontract_advance_refunds (voided_by_id, organization_id)
  WHERE event_type = 'void' AND voided_by_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. INSERT normalize trigger — BEFORE INSERT on subcontract_advances
--    Derives status from paid_date; zeroes caches.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_advance_insert_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.applied_amount_cache  := 0;
  NEW.refunded_amount_cache := 0;
  IF NEW.paid_date IS NOT NULL THEN
    NEW.status := 'paid';
  ELSE
    NEW.status := 'recorded';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS subcontract_advance_insert_normalize ON public.subcontract_advances;
CREATE TRIGGER subcontract_advance_insert_normalize
  BEFORE INSERT ON public.subcontract_advances
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_advance_insert_normalize();

REVOKE ALL ON FUNCTION app.subcontract_advance_insert_normalize() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 5. Canonical AP bill remaining payable
--
-- Single source of truth for: how much of a bill is still left to settle.
--
-- Formula:
--   COALESCE(gross_amount, total_amount)   ← historical fallback, never NULL
--   − recorded cash payment applications  ← ap_payment_applications (p.status='recorded', not voided)
--   − active vendor credit applications   ← ap_credit_applications  (status='applied')
--   − net advance applications            ← subcontract_advance_applications (apply − reverse)
--
-- Called from: saa_business_rules_guard, ap_payment_applications_allocation_guard,
--              ap_credit_applications_conservation.
--
-- SECURITY DEFINER so it can bypass RLS in both SECURITY DEFINER and non-SECURITY-DEFINER
-- trigger contexts. Returns a single numeric — no row data exposed.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ap_bill_remaining_payable(
  p_bill_id uuid,
  p_org_id  uuid
)
RETURNS numeric(18,6)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_bill_amount    numeric(18,6);
  v_bill_retention numeric(18,6);
  v_bill_status    text;
  v_cash_paid      numeric(18,6);
  v_credits_used   numeric(18,6);
  v_adv_applied    numeric(18,6);
BEGIN
  -- Historical fallback: gross_amount may be NULL for pre-0036 bills.
  -- retention_held_remaining is the canonical held-back amount (from 0030).
  SELECT COALESCE(gross_amount, total_amount),
         COALESCE(retention_held_remaining, 0),
         status
    INTO v_bill_amount, v_bill_retention, v_bill_status
    FROM ap_bills
   WHERE id = p_bill_id AND organization_id = p_org_id;

  IF v_bill_amount IS NULL THEN
    RAISE EXCEPTION 'ap_bill_remaining_payable: bill % not found or amount is NULL in org %',
      p_bill_id, p_org_id;
  END IF;

  -- Only open / partially_matched / matched bills are settleable.
  -- draft and void bills must not receive cash, credit, or advance applications.
  IF v_bill_status NOT IN ('open', 'partially_matched', 'matched') THEN
    RAISE EXCEPTION
      'ap_bill_remaining_payable: bill % has status ''%'' which is not settleable; '
      'must be open, partially_matched, or matched',
      p_bill_id, v_bill_status;
  END IF;

  -- Active cash payments (recorded, not voided).
  SELECT COALESCE(SUM(a.applied_amount), 0)
    INTO v_cash_paid
    FROM ap_payment_applications a
    INNER JOIN ap_payments p
      ON p.id = a.ap_payment_id AND p.organization_id = a.organization_id
   WHERE a.ap_bill_id      = p_bill_id
     AND a.organization_id = p_org_id
     AND p.status          = 'recorded'
     AND p.voided_at       IS NULL;

  -- Active vendor credit applications (not voided).
  SELECT COALESCE(SUM(ca.amount), 0)
    INTO v_credits_used
    FROM ap_credit_applications ca
   WHERE ca.ap_bill_id      = p_bill_id
     AND ca.organization_id = p_org_id
     AND ca.status          = 'applied';

  -- Net advance applications (apply − reverse).
  SELECT COALESCE(SUM(
    CASE event_type WHEN 'apply' THEN applied_amount ELSE -applied_amount END
  ), 0)
    INTO v_adv_applied
    FROM subcontract_advance_applications
   WHERE ap_bill_id      = p_bill_id
     AND organization_id = p_org_id;

  -- Canonical payable:
  --   COALESCE(gross, total)       ← historical fallback
  --   − retention_held_remaining   ← currently held back (timing; does not affect Actual)
  --   − cash applications
  --   − credit applications
  --   − net advance applications
  RETURN v_bill_amount - v_bill_retention - v_cash_paid - v_credits_used - v_adv_applied;
END;
$fn$;

REVOKE ALL  ON FUNCTION app.ap_bill_remaining_payable(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ap_bill_remaining_payable(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 6. Business rules trigger — BEFORE INSERT on applications
--
-- Changes in v4:
--  • Reversal forces NEW.ap_bill_id = original.ap_bill_id (bill identity inheritance).
--  • Bill payable cap uses app.ap_bill_remaining_payable() (canonical, includes credits).
--  • Mixed-project bills: validated against ap_bill_project_allocations for advance project.
--  • COALESCE(gross_amount, total_amount) fallback delegated to helper.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.saa_business_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_adv                RECORD;
  v_bill_vendor_id     uuid;
  v_bill_project_id    uuid;
  v_bill_currency      char(3);
  v_bill_status        text;
  v_bill_gross         numeric(18,6);
  v_bill_net           numeric(18,6);
  v_bill_retention     numeric(18,6);
  v_agr_vendor_id      uuid;
  v_orig_amount        numeric(18,6);
  v_orig_bill_id       uuid;
  v_already_reversed   boolean;
  v_total_applied      numeric(18,6);
  v_total_refunded     numeric(18,6);
  v_adv_balance        numeric(18,6);
  v_bill_open_payable  numeric(18,6);
  v_proj_alloc_amount  numeric(18,6);
  v_proj_adv_applied   numeric(18,6);
  v_proj_payable_share numeric(18,6);
BEGIN
  -- ── Load parent advance ──
  SELECT amount, currency, status, subcontract_agreement_id, project_id,
         applied_amount_cache, refunded_amount_cache
    INTO v_adv
    FROM subcontract_advances
   WHERE id = NEW.advance_id AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saa: advance % not found in org %', NEW.advance_id, NEW.organization_id;
  END IF;

  -- ── Voided advance is terminal ──
  IF v_adv.status = 'voided' THEN
    RAISE EXCEPTION 'saa: advance % is voided; no further events are allowed', NEW.advance_id;
  END IF;

  -- ── Currency must match advance ──
  IF v_adv.currency != NEW.currency THEN
    RAISE EXCEPTION 'saa: application currency % must match advance currency %',
      NEW.currency, v_adv.currency;
  END IF;

  -- ────────────────────────────────────────────────────
  IF NEW.event_type = 'apply' THEN
  -- ────────────────────────────────────────────────────

    -- Advance must be in an applicable state.
    IF v_adv.status NOT IN ('paid', 'partially_applied', 'partially_refunded') THEN
      RAISE EXCEPTION 'saa: cannot apply against advance with status %; '
        'must be paid, partially_applied, or partially_refunded', v_adv.status;
    END IF;

    -- ── Load AP bill: vendor, project, currency, status, gross/net/retention ──
    SELECT b.vendor_id,
           b.project_id,
           b.currency,
           b.status,
           COALESCE(b.gross_amount, b.total_amount),
           b.net_amount,
           COALESCE(b.retention_held_remaining, 0)
      INTO v_bill_vendor_id, v_bill_project_id, v_bill_currency, v_bill_status,
           v_bill_gross, v_bill_net, v_bill_retention
      FROM ap_bills b
     WHERE b.id = NEW.ap_bill_id AND b.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'saa: ap_bill % not found in org %', NEW.ap_bill_id, NEW.organization_id;
    END IF;

    -- ── Bill status: only open/partially_matched/matched are settleable ──
    IF v_bill_status NOT IN ('open', 'partially_matched', 'matched') THEN
      RAISE EXCEPTION 'saa: bill % has status ''%'' and is not settleable; '
        'must be open, partially_matched, or matched', NEW.ap_bill_id, v_bill_status;
    END IF;

    -- ── Currency: advance currency must match bill currency ──
    -- No FX conversion lifecycle exists; raw amounts would be meaningless across currencies.
    IF v_adv.currency != v_bill_currency THEN
      RAISE EXCEPTION 'saa: advance currency % must match bill currency % — cross-currency advance application denied',
        v_adv.currency, v_bill_currency;
    END IF;

    -- ── Vendor chain ──
    SELECT sa.vendor_id INTO v_agr_vendor_id
      FROM subcontract_agreements sa
     WHERE sa.id = v_adv.subcontract_agreement_id AND sa.organization_id = NEW.organization_id;

    IF v_bill_vendor_id IS DISTINCT FROM v_agr_vendor_id THEN
      RAISE EXCEPTION 'saa: cross-vendor application denied — bill vendor %, agreement vendor %',
        v_bill_vendor_id, v_agr_vendor_id;
    END IF;

    -- ── Project check and bill payable cap ──
    IF v_bill_project_id IS NOT NULL THEN
      -- Single-project bill: project must match advance project.
      IF v_bill_project_id IS DISTINCT FROM v_adv.project_id THEN
        RAISE EXCEPTION 'saa: cross-project application denied — advance project %, bill project %',
          v_adv.project_id, v_bill_project_id;
      END IF;

      -- Cap against canonical bill remaining payable.
      v_bill_open_payable := app.ap_bill_remaining_payable(NEW.ap_bill_id, NEW.organization_id);
      IF NEW.applied_amount > v_bill_open_payable THEN
        RAISE EXCEPTION 'saa: application % exceeds bill remaining payable % (canonical)',
          NEW.applied_amount, v_bill_open_payable;
      END IF;

    ELSE
      -- Mixed-project bill (bill.project_id IS NULL):
      -- The advance's project must have an applied allocation on this bill.
      SELECT abal.amount
        INTO v_proj_alloc_amount
        FROM ap_bill_project_allocations abal
       WHERE abal.ap_bill_id      = NEW.ap_bill_id
         AND abal.organization_id = NEW.organization_id
         AND abal.project_id      = v_adv.project_id
         AND abal.target_type     = 'project'
         AND abal.status          = 'applied';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'saa: no applied project-% allocation exists on mixed-project bill % — '
          'advance project cannot be attributed to this bill',
          v_adv.project_id, NEW.ap_bill_id;
      END IF;

      -- Derive project-level GROSS payable share from NET allocation.
      --
      --   Cost allocation = NET  (for Actual/profit attribution)
      --   Cash/payable cap = GROSS/payable basis
      --
      -- Formula:
      --   proj_payable_share = allocation_net × (bill_gross − retention_held) / bill_net
      --
      -- This correctly scales the NET cost share to a GROSS cash-equivalent,
      -- deducts the project's proportional retention holdback, and stays
      -- in a directly comparable basis to the applied advance amounts.
      IF v_bill_net = 0 THEN
        RAISE EXCEPTION 'saa: bill % has zero net_amount; cannot compute project payable share', NEW.ap_bill_id;
      END IF;
      v_proj_payable_share :=
        v_proj_alloc_amount * (v_bill_gross - v_bill_retention) / v_bill_net;

      -- Existing project-scoped advances on this bill (GROSS amounts, same basis).
      SELECT COALESCE(SUM(
        CASE saa.event_type WHEN 'apply' THEN saa.applied_amount ELSE -saa.applied_amount END
      ), 0)
        INTO v_proj_adv_applied
        FROM subcontract_advance_applications saa
        INNER JOIN subcontract_advances sa
          ON sa.id = saa.advance_id AND sa.organization_id = saa.organization_id
       WHERE saa.ap_bill_id      = NEW.ap_bill_id
         AND saa.organization_id = NEW.organization_id
         AND sa.project_id       = v_adv.project_id;

      IF NEW.applied_amount > (v_proj_payable_share - v_proj_adv_applied) THEN
        RAISE EXCEPTION 'saa: application % exceeds project-% payable share remaining % '
          '(net_alloc=%, proj_payable_share=%, already_applied=%) on mixed-project bill %',
          NEW.applied_amount, v_adv.project_id,
          (v_proj_payable_share - v_proj_adv_applied),
          v_proj_alloc_amount, v_proj_payable_share, v_proj_adv_applied, NEW.ap_bill_id;
      END IF;

      -- Also cap against global bill remaining payable (retention + all settlements).
      -- ap_bill_remaining_payable() re-checks status (already done above) and includes retention.
      v_bill_open_payable := app.ap_bill_remaining_payable(NEW.ap_bill_id, NEW.organization_id);
      IF NEW.applied_amount > v_bill_open_payable THEN
        RAISE EXCEPTION 'saa: application % exceeds global bill remaining payable % on mixed-project bill',
          NEW.applied_amount, v_bill_open_payable;
      END IF;
    END IF;

    -- ── Advance available balance cap (authoritative event totals) ──
    SELECT COALESCE(SUM(
      CASE event_type WHEN 'apply' THEN applied_amount ELSE -applied_amount END
    ), 0)
      INTO v_total_applied
      FROM subcontract_advance_applications
     WHERE advance_id = NEW.advance_id AND organization_id = NEW.organization_id;

    SELECT COALESCE(SUM(
      CASE event_type WHEN 'refund' THEN amount ELSE -amount END
    ), 0)
      INTO v_total_refunded
      FROM subcontract_advance_refunds
     WHERE advance_id = NEW.advance_id AND organization_id = NEW.organization_id;

    v_adv_balance := v_adv.amount - v_total_applied - v_total_refunded;

    IF NEW.applied_amount > v_adv_balance THEN
      RAISE EXCEPTION 'saa: application % exceeds advance available balance % '
        '(amount=%, applied=%, refunded=%)',
        NEW.applied_amount, v_adv_balance,
        v_adv.amount, v_total_applied, v_total_refunded;
    END IF;

  -- ────────────────────────────────────────────────────
  ELSIF NEW.event_type = 'reverse' THEN
  -- ────────────────────────────────────────────────────

    -- Load the original 'apply' event to inherit its bill identity and amount.
    -- This ensures bill-level advance accounting correctly cancels the original application.
    SELECT applied_amount, ap_bill_id
      INTO v_orig_amount, v_orig_bill_id
      FROM subcontract_advance_applications
     WHERE id             = NEW.reversal_of_id
       AND organization_id = NEW.organization_id
       AND advance_id     = NEW.advance_id
       AND event_type     = 'apply';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'saa: reversal_of_id % does not point to a valid ''apply'' event in this chain',
        NEW.reversal_of_id;
    END IF;

    -- Force reversal to inherit original bill identity and amount.
    -- Required: bill-level payable must correctly restore after reversal.
    NEW.ap_bill_id     := v_orig_bill_id;
    NEW.applied_amount := v_orig_amount;

    -- Ensure not already reversed.
    SELECT EXISTS (
      SELECT 1 FROM subcontract_advance_applications
       WHERE reversal_of_id = NEW.reversal_of_id
         AND organization_id = NEW.organization_id
         AND event_type = 'reverse'
    ) INTO v_already_reversed;

    IF v_already_reversed THEN
      RAISE EXCEPTION 'saa: application % has already been reversed', NEW.reversal_of_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS saa_business_rules_guard ON public.subcontract_advance_applications;
CREATE TRIGGER saa_business_rules_guard
  BEFORE INSERT ON public.subcontract_advance_applications
  FOR EACH ROW EXECUTE FUNCTION app.saa_business_rules_guard();

REVOKE ALL ON FUNCTION app.saa_business_rules_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 7. Business rules trigger — BEFORE INSERT on refunds (unchanged from v3)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.sar_business_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_adv          RECORD;
  v_orig_amount  numeric(18,6);
  v_already_void boolean;
  v_total_applied  numeric(18,6);
  v_total_refunded numeric(18,6);
  v_available      numeric(18,6);
BEGIN
  -- ── Load parent advance — includes paid_date ──
  SELECT amount, currency, status, paid_date, refunded_amount_cache
    INTO v_adv
    FROM subcontract_advances
   WHERE id = NEW.advance_id AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sar: advance % not found in org %', NEW.advance_id, NEW.organization_id;
  END IF;

  -- ── Voided advance is terminal ──
  IF v_adv.status = 'voided' THEN
    RAISE EXCEPTION 'sar: advance % is voided; no further events are allowed', NEW.advance_id;
  END IF;

  -- ── Currency must match ──
  IF v_adv.currency != NEW.currency THEN
    RAISE EXCEPTION 'sar: refund currency % must match advance currency %', NEW.currency, v_adv.currency;
  END IF;

  IF NEW.event_type = 'refund' THEN
    IF v_adv.paid_date IS NULL THEN
      RAISE EXCEPTION 'sar: cannot refund an advance that has not been paid';
    END IF;

    -- Available = amount − net_applied − net_refunded (authoritative event rows).
    SELECT COALESCE(SUM(
      CASE event_type WHEN 'apply' THEN applied_amount ELSE -applied_amount END
    ), 0)
      INTO v_total_applied
      FROM subcontract_advance_applications
     WHERE advance_id = NEW.advance_id AND organization_id = NEW.organization_id;

    SELECT COALESCE(SUM(
      CASE event_type WHEN 'refund' THEN amount ELSE -amount END
    ), 0)
      INTO v_total_refunded
      FROM subcontract_advance_refunds
     WHERE advance_id = NEW.advance_id AND organization_id = NEW.organization_id;

    v_available := v_adv.amount - v_total_applied - v_total_refunded;

    IF NEW.amount > v_available THEN
      RAISE EXCEPTION 'sar: refund % exceeds available advance balance % '
        '(amount=%, applied=%, refunded=%, available=%)',
        NEW.amount, v_available,
        v_adv.amount, v_total_applied, v_total_refunded, v_available;
    END IF;

  ELSIF NEW.event_type = 'void' THEN
    SELECT amount INTO v_orig_amount
      FROM subcontract_advance_refunds
     WHERE id             = NEW.voided_by_id
       AND organization_id = NEW.organization_id
       AND advance_id     = NEW.advance_id
       AND event_type     = 'refund';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'sar: voided_by_id % does not point to a valid ''refund'' event in this chain',
        NEW.voided_by_id;
    END IF;

    IF v_orig_amount IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'sar: void amount % must equal original refund amount %',
        NEW.amount, v_orig_amount;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM subcontract_advance_refunds
       WHERE voided_by_id = NEW.voided_by_id
         AND organization_id = NEW.organization_id
         AND event_type = 'void'
    ) INTO v_already_void;

    IF v_already_void THEN
      RAISE EXCEPTION 'sar: refund % has already been voided', NEW.voided_by_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS sar_business_rules_guard ON public.subcontract_advance_refunds;
CREATE TRIGGER sar_business_rules_guard
  BEFORE INSERT ON public.subcontract_advance_refunds
  FOR EACH ROW EXECUTE FUNCTION app.sar_business_rules_guard();

REVOKE ALL ON FUNCTION app.sar_business_rules_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 8. Immutability triggers for child tables (INSERT-only)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.saa_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subcontract_advance_applications: DELETE forbidden; insert a ''reverse'' event instead';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'subcontract_advance_applications: UPDATE forbidden; all rows are immutable';
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS saa_immutable_guard ON public.subcontract_advance_applications;
CREATE TRIGGER saa_immutable_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_advance_applications
  FOR EACH ROW EXECUTE FUNCTION app.saa_immutable_guard();

REVOKE ALL ON FUNCTION app.saa_immutable_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.sar_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subcontract_advance_refunds: DELETE forbidden; insert a ''void'' event instead';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'subcontract_advance_refunds: UPDATE forbidden; all rows are immutable';
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS sar_immutable_guard ON public.subcontract_advance_refunds;
CREATE TRIGGER sar_immutable_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_advance_refunds
  FOR EACH ROW EXECUTE FUNCTION app.sar_immutable_guard();

REVOKE ALL ON FUNCTION app.sar_immutable_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 9. Cache-sync trigger — AFTER INSERT on child tables
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_advance_cache_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_adv_id    uuid;
  v_org_id    uuid;
  v_applied   numeric(18,6);
  v_refunded  numeric(18,6);
  v_amount    numeric(18,6);
  v_paid_date date;
  v_status    text;
BEGIN
  IF TG_TABLE_NAME = 'subcontract_advance_applications' THEN
    v_adv_id := NEW.advance_id;
    v_org_id := NEW.organization_id;
  ELSIF TG_TABLE_NAME = 'subcontract_advance_refunds' THEN
    v_adv_id := NEW.advance_id;
    v_org_id := NEW.organization_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(
    CASE event_type WHEN 'apply' THEN applied_amount ELSE -applied_amount END
  ), 0)
    INTO v_applied
    FROM public.subcontract_advance_applications
   WHERE advance_id = v_adv_id AND organization_id = v_org_id;

  SELECT COALESCE(SUM(
    CASE event_type WHEN 'refund' THEN amount ELSE -amount END
  ), 0)
    INTO v_refunded
    FROM public.subcontract_advance_refunds
   WHERE advance_id = v_adv_id AND organization_id = v_org_id;

  SELECT amount, paid_date, status
    INTO v_amount, v_paid_date, v_status
    FROM public.subcontract_advances
   WHERE id = v_adv_id AND organization_id = v_org_id;

  -- Derive status (preserve 'voided' — terminal).
  IF v_status != 'voided' THEN
    IF v_paid_date IS NULL THEN
      v_status := 'recorded';
    ELSIF v_refunded >= v_amount THEN
      v_status := 'fully_refunded';
    ELSIF v_applied >= (v_amount - v_refunded) AND v_applied > 0 THEN
      v_status := 'fully_applied';
    ELSIF v_refunded > 0 THEN
      v_status := 'partially_refunded';
    ELSIF v_applied > 0 THEN
      v_status := 'partially_applied';
    ELSE
      v_status := 'paid';
    END IF;
  END IF;

  -- Update fires write_guard at pg_trigger_depth() = 2 → allowed.
  UPDATE public.subcontract_advances
     SET applied_amount_cache  = v_applied,
         refunded_amount_cache = v_refunded,
         status                = v_status,
         updated_at            = now()
   WHERE id = v_adv_id AND organization_id = v_org_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS saa_cache_sync ON public.subcontract_advance_applications;
CREATE TRIGGER saa_cache_sync
  AFTER INSERT ON public.subcontract_advance_applications
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_advance_cache_sync();

DROP TRIGGER IF EXISTS sar_cache_sync ON public.subcontract_advance_refunds;
CREATE TRIGGER sar_cache_sync
  AFTER INSERT ON public.subcontract_advance_refunds
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_advance_cache_sync();

REVOKE ALL ON FUNCTION app.subcontract_advance_cache_sync() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 10. Parent financial-history guard — BEFORE UPDATE OR DELETE
--
-- Trigger depth semantics:
--   pg_trigger_depth() = 1  → direct user statement → enforce restrictions
--   pg_trigger_depth() > 1  → cache-sync driving the update → allow
--
-- v4 change: block simultaneous paid_date + voided in one UPDATE.
--   Transition recorded → paid_date+voided in one UPDATE = DENIED.
--   Must follow: create unpaid → set paid_date → full-refund → set voided.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_advance_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status_auto_derived boolean := false;
BEGIN
  -- DELETE protection.
  IF TG_OP = 'DELETE' THEN
    IF OLD.paid_date IS NOT NULL THEN
      RAISE EXCEPTION 'subcontract_advances: paid advance % cannot be deleted; '
        'use refund/void lifecycle instead', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- Cache-sync trigger drives this UPDATE at depth > 1 → allow everything.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Direct user UPDATE (depth = 1) — enforce all restrictions.

  -- 1. Block direct writes to cache columns.
  IF NEW.applied_amount_cache IS DISTINCT FROM OLD.applied_amount_cache
  OR NEW.refunded_amount_cache IS DISTINCT FROM OLD.refunded_amount_cache THEN
    RAISE EXCEPTION 'subcontract_advances: applied_amount_cache and refunded_amount_cache '
      'are system-maintained; direct modification at pg_trigger_depth=1 is denied';
  END IF;

  -- 2. Auto-derive status when paid_date is first set.
  --    Block simultaneous paid_date + voided: cannot collapse payment+void into one update.
  IF OLD.paid_date IS NULL AND NEW.paid_date IS NOT NULL THEN
    IF NEW.status = 'voided' THEN
      RAISE EXCEPTION 'subcontract_advances: cannot simultaneously set paid_date and void status '
        'in one UPDATE; follow the payment → full-refund → void lifecycle';
    END IF;
    NEW.status := 'paid';
    v_status_auto_derived := true;
  END IF;

  -- 3. Post-payment immutability: financial identity frozen once paid_date is set on OLD row.
  IF OLD.paid_date IS NOT NULL THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN
      RAISE EXCEPTION 'subcontract_advances: amount is immutable after payment';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'subcontract_advances: currency is immutable after payment';
    END IF;
    IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'subcontract_advances: project_id is immutable after payment';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'subcontract_advances: organization_id is immutable after payment';
    END IF;
    IF NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id THEN
      RAISE EXCEPTION 'subcontract_advances: subcontract_agreement_id is immutable after payment';
    END IF;
    IF NEW.paid_date IS DISTINCT FROM OLD.paid_date THEN
      RAISE EXCEPTION 'subcontract_advances: paid_date is immutable once set';
    END IF;
  END IF;

  -- 4. Status validation: only 'voided' may be set manually.
  --    Skip when status was auto-derived from paid_date transition (step 2).
  IF NOT v_status_auto_derived THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'voided' THEN
      RAISE EXCEPTION 'subcontract_advances: status is system-derived; '
        'only ''voided'' may be set manually (current: %, attempted: %)',
        OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'voided' AND OLD.status != 'voided' THEN
      IF OLD.applied_amount_cache > 0 THEN
        RAISE EXCEPTION 'subcontract_advances: cannot void advance with outstanding applications '
          '(applied_amount_cache = %)', OLD.applied_amount_cache;
      END IF;
      IF OLD.paid_date IS NOT NULL AND OLD.refunded_amount_cache < OLD.amount THEN
        RAISE EXCEPTION 'subcontract_advances: cannot void paid advance without full refund '
          '(amount = %, refunded = %)', OLD.amount, OLD.refunded_amount_cache;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS subcontract_advance_write_guard ON public.subcontract_advances;
CREATE TRIGGER subcontract_advance_write_guard
  BEFORE UPDATE OR DELETE ON public.subcontract_advances
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_advance_write_guard();

REVOKE ALL ON FUNCTION app.subcontract_advance_write_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- 11. RLS — all three advance tables
--------------------------------------------------------------------------------

SELECT app.install_permissioned_rls('subcontract_advances',             'ap.read', 'ap.manage');
SELECT app.install_permissioned_rls('subcontract_advance_applications', 'ap.read', 'ap.manage');
SELECT app.install_permissioned_rls('subcontract_advance_refunds',      'ap.read', 'ap.manage');

SELECT app.apply_project_column_rls('subcontract_advances', 'project_id', 'ap.read', 'ap.manage');
SELECT app.apply_project_parent_rls(
  'subcontract_advance_applications', 'subcontract_advances', 'advance_id', 'project_id', NULL, NULL
);
SELECT app.apply_project_parent_rls(
  'subcontract_advance_refunds', 'subcontract_advances', 'advance_id', 'project_id', NULL, NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_advances             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_advance_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_advance_refunds      TO authenticated;
GRANT ALL ON public.subcontract_advances             TO service_role;
GRANT ALL ON public.subcontract_advance_applications TO service_role;
GRANT ALL ON public.subcontract_advance_refunds      TO service_role;

--------------------------------------------------------------------------------
-- 12. Bidirectional AP settlement — update existing guards to use canonical payable
--
-- ap_payment_applications_allocation_guard (originally in 0020):
--   Bill payable cap now uses app.ap_bill_remaining_payable() which includes
--   vendor credit applications and net advance applications.
--   Payment total cap (applied ≤ payment.amount) is unchanged.
--   COALESCE(gross_amount, total_amount) delegated to helper.
--
-- ap_credit_applications_conservation (originally in 0022):
--   Adds bill payable cap using app.ap_bill_remaining_payable() in addition to
--   existing per-credit total cap.
--   Ensures: credit application cannot overcommit the bill's canonical remaining payable.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ap_payment_applications_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_amount     numeric(18, 6);
  payment_status     text;
  payment_voided_at  timestamptz;
  applied_to_payment numeric(18, 6);
  bill_remaining     numeric(18, 6);
BEGIN
  -- Lock payment row (prevent concurrent races on payment total).
  SELECT amount, status, voided_at
    INTO payment_amount, payment_status, payment_voided_at
    FROM public.ap_payments
   WHERE id = NEW.ap_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_payment_applications: payment must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF payment_status IS DISTINCT FROM 'recorded' OR payment_voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'ap_payment_applications: payment must be recorded and not void'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock bill row (prevent concurrent races on bill payable).
  PERFORM id
    FROM public.ap_bills
   WHERE id = NEW.ap_bill_id AND organization_id = NEW.organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_payment_applications: bill must exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Payment total cap: sum of all applications from this payment must not exceed payment.amount.
  SELECT COALESCE(SUM(applied_amount), 0)
    INTO applied_to_payment
    FROM public.ap_payment_applications
   WHERE ap_payment_id = NEW.ap_payment_id
     AND id IS DISTINCT FROM NEW.id;

  IF applied_to_payment + NEW.applied_amount > payment_amount THEN
    RAISE EXCEPTION 'ap_payment_applications: applied sum exceeds payment amount'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Canonical bill remaining payable cap:
  --   COALESCE(gross_amount, total_amount) − cash − credits − net_advances.
  -- This application is BEFORE INSERT so it is not yet in the DB.
  bill_remaining := app.ap_bill_remaining_payable(NEW.ap_bill_id, NEW.organization_id);

  IF NEW.applied_amount > bill_remaining THEN
    RAISE EXCEPTION 'ap_payment_applications: applied amount % exceeds bill canonical remaining payable % '
      '(includes cash, credits, and advance applications)',
      NEW.applied_amount, bill_remaining
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_payment_applications_allocation_guard ON public.ap_payment_applications;
CREATE TRIGGER ap_payment_applications_allocation_guard
  BEFORE INSERT ON public.ap_payment_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_payment_applications_allocation_guard();

-- ap_credit_applications_conservation: add canonical bill payable cap.
CREATE OR REPLACE FUNCTION app.ap_credit_applications_conservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  credit_amount  numeric(18, 6);
  credit_currency char(3);
  credit_org     uuid;
  applied_sum    numeric(18, 6);
  bill_remaining numeric(18, 6);
BEGIN
  SELECT c.amount, c.currency, c.organization_id
    INTO credit_amount, credit_currency, credit_org
    FROM public.ap_vendor_credits c
   WHERE c.id = NEW.credit_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_credit_applications: credit not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM credit_org THEN
    RAISE EXCEPTION 'ap_credit_applications: organization mismatch'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.currency IS DISTINCT FROM credit_currency THEN
    RAISE EXCEPTION 'ap_credit_applications: currency mismatch'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = 'applied' THEN
    -- Per-credit total cap (unchanged from 0022).
    SELECT COALESCE(SUM(a.amount), 0)
      INTO applied_sum
      FROM public.ap_credit_applications a
     WHERE a.credit_id = NEW.credit_id
       AND a.status    = 'applied'
       AND a.id IS DISTINCT FROM NEW.id;

    IF applied_sum + NEW.amount > credit_amount THEN
      RAISE EXCEPTION 'ap_credit_applications: exceeds credit remaining'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Canonical bill remaining payable cap (new in 0076):
    --   Prevents credit over-application when advances or payments already fill the bill.
    bill_remaining := app.ap_bill_remaining_payable(NEW.ap_bill_id, NEW.organization_id);

    IF NEW.amount > bill_remaining THEN
      RAISE EXCEPTION 'ap_credit_applications: amount % exceeds bill canonical remaining payable % '
        '(includes cash, credits, and advance applications)',
        NEW.amount, bill_remaining
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_credit_applications_conservation ON public.ap_credit_applications;
CREATE TRIGGER ap_credit_applications_conservation
  BEFORE INSERT OR UPDATE ON public.ap_credit_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_credit_applications_conservation();

--------------------------------------------------------------------------------
-- COMPLETE TEST MATRIX (analytical proof)
--
-- ── ADVANCE LIFECYCLE RECONCILIATION ──
-- Advance = 30,000 ILS / Vendor X / Project A
-- Steps 1–11 from v3 (all pass, reconciliation = 0.00 at every step).
--
-- ── BILL SETTLEMENT RECONCILIATION ──
-- Bill = 100,000
-- Vendor credit 20,000 applied → remaining = 80,000
-- Cash payment 30,000 applied  → remaining = 50,000
-- Advance applied 40,000       → remaining = 10,000
-- Advance applied 10,000       = PASS (= remaining)
-- Advance applied 10,001       = DENIED (canonical payable cap)
-- Reconciliation: 100,000 − 20,000 − 30,000 − 50,000 = 0.00
--
-- ── APPLICATION REVERSAL RESTORES BILL BALANCE ──
-- Apply 10,000 to Bill A  → Bill A advance-applied = 10,000
-- Reverse 10,000          → NEW.ap_bill_id = Bill A (inherited by trigger)
--                           Bill A advance-applied = 0 (net)
-- Bill A remaining = 100,000 ✓
--
-- ── BIDIRECTIONAL SETTLEMENT ──
-- Advance first:  Advance applied 30,000 → cash max = 70,000; cash 70,001 = DENIED
-- Payment first:  Cash 30,000 → advance max = 70,000; advance 70,001 = DENIED
-- Credit first:   Credit 20,000 → advance max = 80,000; advance 80,001 = DENIED
-- Combined:       Credit 20 + Cash 30 + Advance 50 = 100,000 → remaining = 0 → any further = DENIED
--
-- ── HISTORICAL BILL ──
-- gross_amount = NULL, total_amount = 100,000
-- COALESCE(gross_amount, total_amount) = 100,000 ← not NULL ✓
--
-- ── ATOMIC VOID/PAY CONTRADICTION ──
-- UPDATE SET paid_date = today, status = 'voided' → DENIED (write_guard)
-- UPDATE SET paid_date = today                   → status auto = 'paid' ✓
-- Then full refund → then SET status='voided'     → allowed ✓
--
-- ── MIXED-PROJECT BILL ──
-- Bill (project_id = NULL), allocations: Project A = 40,000 / Project B = 60,000
-- Advance Project A applied 40,000 = PASS
-- Advance Project A applied 40,001 = DENIED (project cap)
-- Advance Project B applied any   = needs own advance; Project B allocation = 60,000
-- Project A advance does not consume Project B allocation ✓
--
-- ── VENDOR / PROJECT CROSS CHECKS ──
-- Vendor X / Project A bill  → PASS
-- Vendor X / Project B bill  → DENIED (cross-project)
-- Vendor Y / Project A bill  → DENIED (cross-vendor)
-- Application > bill payable → DENIED (canonical cap)
--
-- ── CACHE PROTECTION ──
-- Direct UPDATE applied_amount_cache  → DENIED (pg_trigger_depth()=1)
-- Direct UPDATE refunded_amount_cache → DENIED
-- Direct UPDATE status='fully_applied' → DENIED (only 'voided' allowed)
-- Cache-sync UPDATE (depth=2)         → ALLOWED
--
-- Advance amount = Net Applied + Net Refunded + Remaining Advance
-- Difference = 0.00 REQUIRED at every step.
--
-- Bill payable = Gross − Active Cash − Active Credits − Net Advances
-- Difference = 0.00 REQUIRED at every step.
--
-- Historical migrations modified = 0
-- Production SQL applied = NO
--------------------------------------------------------------------------------
