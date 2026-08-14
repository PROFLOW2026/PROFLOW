-- 0036_ap_vat_net_tax_gross
-- Additive only. Does NOT modify 0000–0035 file contents.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Vendor bills: NET + VAT = GROSS.
-- Actual / profit uses NET.
-- Payments / outstanding / aging use GROSS (total_amount).
-- Existing rows: do NOT invent VAT. Preserve economic value as undivided
-- (net = gross = historical total_amount, tax_basis = legacy_undivided).

--------------------------------------------------------------------------------
-- 1) ap_bills tax split
--------------------------------------------------------------------------------

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS net_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS amount_includes_tax boolean,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS tax_basis text NOT NULL DEFAULT 'legacy_undivided';

UPDATE public.ap_bills
SET
  net_amount = total_amount,
  tax_amount = 0,
  gross_amount = total_amount,
  tax_basis = 'legacy_undivided'
WHERE net_amount IS NULL OR gross_amount IS NULL;

ALTER TABLE public.ap_bills
  ALTER COLUMN net_amount SET NOT NULL,
  ALTER COLUMN gross_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bills_tax_basis_known'
  ) THEN
    ALTER TABLE public.ap_bills
      ADD CONSTRAINT ap_bills_tax_basis_known CHECK (
        tax_basis IN ('canonical', 'legacy_undivided', 'zero_exempt')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bills_net_tax_gross'
  ) THEN
    ALTER TABLE public.ap_bills
      ADD CONSTRAINT ap_bills_net_tax_gross CHECK (
        net_amount + tax_amount = gross_amount
        AND gross_amount = total_amount
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bills_legacy_undivided_zero_tax'
  ) THEN
    ALTER TABLE public.ap_bills
      ADD CONSTRAINT ap_bills_legacy_undivided_zero_tax CHECK (
        tax_basis IS DISTINCT FROM 'legacy_undivided'
        OR (tax_amount = 0 AND net_amount = gross_amount)
      );
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 2) ap_vendor_credits tax split (economic reduction uses NET)
--------------------------------------------------------------------------------

ALTER TABLE public.ap_vendor_credits
  ADD COLUMN IF NOT EXISTS net_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS tax_basis text NOT NULL DEFAULT 'legacy_undivided';

UPDATE public.ap_vendor_credits
SET
  net_amount = amount,
  tax_amount = 0,
  gross_amount = amount,
  tax_basis = 'legacy_undivided'
WHERE net_amount IS NULL OR gross_amount IS NULL;

ALTER TABLE public.ap_vendor_credits
  ALTER COLUMN net_amount SET NOT NULL,
  ALTER COLUMN gross_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_tax_basis_known'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      ADD CONSTRAINT ap_vendor_credits_tax_basis_known CHECK (
        tax_basis IN ('canonical', 'legacy_undivided', 'zero_exempt')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_net_tax_gross'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      ADD CONSTRAINT ap_vendor_credits_net_tax_gross CHECK (
        net_amount + tax_amount = gross_amount
        AND gross_amount = amount
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_legacy_undivided_zero_tax'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      ADD CONSTRAINT ap_vendor_credits_legacy_undivided_zero_tax CHECK (
        tax_basis IS DISTINCT FROM 'legacy_undivided'
        OR (tax_amount = 0 AND net_amount = gross_amount)
      );
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 3) Insert defaulting — do NOT invent VAT. Missing split → undivided.
--    Lets pre-0036 writers (tests / drafts) keep inserting only total/amount.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ap_bills_tax_split_default()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.tax_basis = 'legacy_undivided'
     AND NEW.total_amount IS DISTINCT FROM OLD.total_amount
     AND NEW.gross_amount IS NOT DISTINCT FROM OLD.gross_amount
     AND NEW.net_amount IS NOT DISTINCT FROM OLD.net_amount THEN
    NEW.gross_amount := NEW.total_amount;
    NEW.net_amount := NEW.total_amount;
    NEW.tax_amount := 0;
  END IF;
  IF NEW.gross_amount IS NULL THEN
    NEW.gross_amount := NEW.total_amount;
  END IF;
  IF NEW.net_amount IS NULL THEN
    NEW.net_amount := NEW.gross_amount;
  END IF;
  IF NEW.tax_amount IS NULL THEN
    NEW.tax_amount := 0;
  END IF;
  IF NEW.tax_basis IS NULL OR btrim(NEW.tax_basis) = '' THEN
    NEW.tax_basis := CASE
      WHEN NEW.tax_amount = 0 AND NEW.net_amount = NEW.gross_amount THEN 'legacy_undivided'
      ELSE 'canonical'
    END;
  END IF;
  IF NEW.tax_basis = 'legacy_undivided' AND (NEW.tax_amount <> 0 OR NEW.net_amount <> NEW.gross_amount) THEN
    RAISE EXCEPTION 'ap_bills: legacy_undivided cannot carry a tax split'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.total_amount := NEW.gross_amount;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bills_tax_split_default ON public.ap_bills;
CREATE TRIGGER ap_bills_tax_split_default
  BEFORE INSERT OR UPDATE OF total_amount, net_amount, tax_amount, gross_amount, tax_basis
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_bills_tax_split_default();

CREATE OR REPLACE FUNCTION app.ap_vendor_credits_tax_split_default()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.tax_basis = 'legacy_undivided'
     AND NEW.amount IS DISTINCT FROM OLD.amount
     AND NEW.gross_amount IS NOT DISTINCT FROM OLD.gross_amount
     AND NEW.net_amount IS NOT DISTINCT FROM OLD.net_amount THEN
    NEW.gross_amount := NEW.amount;
    NEW.net_amount := NEW.amount;
    NEW.tax_amount := 0;
  END IF;
  IF NEW.gross_amount IS NULL THEN
    NEW.gross_amount := NEW.amount;
  END IF;
  IF NEW.net_amount IS NULL THEN
    NEW.net_amount := NEW.gross_amount;
  END IF;
  IF NEW.tax_amount IS NULL THEN
    NEW.tax_amount := 0;
  END IF;
  IF NEW.tax_basis IS NULL OR btrim(NEW.tax_basis) = '' THEN
    NEW.tax_basis := CASE
      WHEN NEW.tax_amount = 0 AND NEW.net_amount = NEW.gross_amount THEN 'legacy_undivided'
      ELSE 'canonical'
    END;
  END IF;
  IF NEW.tax_basis = 'legacy_undivided' AND (NEW.tax_amount <> 0 OR NEW.net_amount <> NEW.gross_amount) THEN
    RAISE EXCEPTION 'ap_vendor_credits: legacy_undivided cannot carry a tax split'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.amount := NEW.gross_amount;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_vendor_credits_tax_split_default ON public.ap_vendor_credits;
CREATE TRIGGER ap_vendor_credits_tax_split_default
  BEFORE INSERT OR UPDATE OF amount, net_amount, tax_amount, gross_amount, tax_basis
  ON public.ap_vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION app.ap_vendor_credits_tax_split_default();

REVOKE ALL ON FUNCTION app.ap_bills_tax_split_default() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ap_vendor_credits_tax_split_default() FROM PUBLIC;
