-- 0031_ocr_vendor_credit_target
-- OWNER SQL REVIEW REQUIRED — do not apply until approved.
--
-- Makes Vendor Credit a first-class OCR confirmed draft target.
-- Extends 0020 ocr_extraction_jobs without modifying 0000–0030 files.
--
-- Changes:
-- 1) Add confirmed_vendor_credit_id (org-scoped FK → ap_vendor_credits)
-- 2) Allow confirmed_draft_target = 'vendor_credit'
-- 3) STRICT confirmed target shape: every target requires its matching ID
-- 4) Replace OCR financial FKs with ON DELETE RESTRICT (preserve audit links)
-- 5) Safe raw_metadata backfill (UUID-validated; never invents IDs)
--
-- 0020 audit note:
-- Prior CHECK allowed target='expense'|'vendor_bill' with a NULL matching ID.
-- Before installing the strict CHECK, clear such incomplete targets (do not invent IDs).
-- Expense/bill FKs previously used ON DELETE SET NULL, which would leave target
-- without ID under the strict invariant — 0031 recreates them as RESTRICT.

--------------------------------------------------------------------------------
-- Column
--------------------------------------------------------------------------------

ALTER TABLE "ocr_extraction_jobs"
  ADD COLUMN IF NOT EXISTS "confirmed_vendor_credit_id" uuid;

--------------------------------------------------------------------------------
-- Normalize incomplete 0020-era targets (no invented IDs)
--------------------------------------------------------------------------------

UPDATE "ocr_extraction_jobs"
SET "confirmed_draft_target" = NULL
WHERE "confirmed_draft_target" = 'expense'
  AND "confirmed_expense_id" IS NULL;

UPDATE "ocr_extraction_jobs"
SET "confirmed_draft_target" = NULL
WHERE "confirmed_draft_target" = 'vendor_bill'
  AND "confirmed_vendor_bill_id" IS NULL;

--------------------------------------------------------------------------------
-- Known target enum
--------------------------------------------------------------------------------

ALTER TABLE "ocr_extraction_jobs"
  DROP CONSTRAINT IF EXISTS "ocr_extraction_jobs_draft_target_known";

ALTER TABLE "ocr_extraction_jobs"
  ADD CONSTRAINT "ocr_extraction_jobs_draft_target_known" CHECK (
    "confirmed_draft_target" IS NULL
    OR "confirmed_draft_target" IN ('expense', 'vendor_bill', 'vendor_credit')
  );

--------------------------------------------------------------------------------
-- STRICT confirmed target shape
--------------------------------------------------------------------------------

ALTER TABLE "ocr_extraction_jobs"
  DROP CONSTRAINT IF EXISTS "ocr_extraction_jobs_confirmed_target_shape";

ALTER TABLE "ocr_extraction_jobs"
  ADD CONSTRAINT "ocr_extraction_jobs_confirmed_target_shape" CHECK (
    (
      "confirmed_draft_target" IS NULL
      AND "confirmed_expense_id" IS NULL
      AND "confirmed_vendor_bill_id" IS NULL
      AND "confirmed_vendor_credit_id" IS NULL
    )
    OR (
      "confirmed_draft_target" = 'expense'
      AND "confirmed_expense_id" IS NOT NULL
      AND "confirmed_vendor_bill_id" IS NULL
      AND "confirmed_vendor_credit_id" IS NULL
    )
    OR (
      "confirmed_draft_target" = 'vendor_bill'
      AND "confirmed_vendor_bill_id" IS NOT NULL
      AND "confirmed_expense_id" IS NULL
      AND "confirmed_vendor_credit_id" IS NULL
    )
    OR (
      "confirmed_draft_target" = 'vendor_credit'
      AND "confirmed_vendor_credit_id" IS NOT NULL
      AND "confirmed_expense_id" IS NULL
      AND "confirmed_vendor_bill_id" IS NULL
    )
  );

--------------------------------------------------------------------------------
-- Financial FKs: RESTRICT so confirmed OCR drafts stay auditable
-- (document FK remains SET NULL — source file may be detached without erasing confirm)
--------------------------------------------------------------------------------

ALTER TABLE "ocr_extraction_jobs"
  DROP CONSTRAINT IF EXISTS "ocr_extraction_jobs_expense_org_fk";

ALTER TABLE "ocr_extraction_jobs"
  DROP CONSTRAINT IF EXISTS "ocr_extraction_jobs_vendor_bill_org_fk";

ALTER TABLE "ocr_extraction_jobs"
  DROP CONSTRAINT IF EXISTS "ocr_extraction_jobs_vendor_credit_org_fk";

ALTER TABLE "ocr_extraction_jobs"
  ADD CONSTRAINT "ocr_extraction_jobs_expense_org_fk"
  FOREIGN KEY ("confirmed_expense_id", "organization_id")
  REFERENCES "expenses" ("id", "organization_id")
  ON DELETE RESTRICT;

ALTER TABLE "ocr_extraction_jobs"
  ADD CONSTRAINT "ocr_extraction_jobs_vendor_bill_org_fk"
  FOREIGN KEY ("confirmed_vendor_bill_id", "organization_id")
  REFERENCES "ap_bills" ("id", "organization_id")
  ON DELETE RESTRICT;

ALTER TABLE "ocr_extraction_jobs"
  ADD CONSTRAINT "ocr_extraction_jobs_vendor_credit_org_fk"
  FOREIGN KEY ("confirmed_vendor_credit_id", "organization_id")
  REFERENCES "ap_vendor_credits" ("id", "organization_id")
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "ocr_extraction_jobs_org_credit_idx"
  ON "ocr_extraction_jobs" ("organization_id", "confirmed_vendor_credit_id")
  WHERE "confirmed_vendor_credit_id" IS NOT NULL;

--------------------------------------------------------------------------------
-- Safe backfill from early raw_metadata credit confirms
-- Validate UUID text before cast; require same-org credit; no other confirm set.
--------------------------------------------------------------------------------

UPDATE "ocr_extraction_jobs" AS j
SET
  "confirmed_draft_target" = 'vendor_credit',
  "confirmed_vendor_credit_id" = (j."raw_metadata"->>'confirmedVendorCreditId')::uuid
WHERE j."confirmed_draft_target" IS NULL
  AND j."confirmed_expense_id" IS NULL
  AND j."confirmed_vendor_bill_id" IS NULL
  AND j."confirmed_vendor_credit_id" IS NULL
  AND j."raw_metadata"->>'confirmedApplicationTarget' = 'vendor_credit'
  AND j."raw_metadata"->>'confirmedVendorCreditId' IS NOT NULL
  AND j."raw_metadata"->>'confirmedVendorCreditId' ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM "ap_vendor_credits" AS c
    WHERE c."id" = (j."raw_metadata"->>'confirmedVendorCreditId')::uuid
      AND c."organization_id" = j."organization_id"
  );
