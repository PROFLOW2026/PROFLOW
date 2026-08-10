-- Project / Job modes + mid-project entry baseline (Wave).
-- Does NOT edit 0000–0018.
--
-- 1) projects.work_kind: project | job (default project)
-- 2) projects.pricing_mode: fixed | open | NULL (NULL = classic project fixed-when-contracted)
-- 3) contracts display_original_* + opening_reduction_* (context/audit only)
--    Managed opening remains contracts.original_* + contract_value_events kind=original

--------------------------------------------------------------------------------
-- projects: work kind + pricing mode
--------------------------------------------------------------------------------

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "work_kind" text DEFAULT 'project' NOT NULL;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "pricing_mode" text;

UPDATE "projects"
SET "work_kind" = 'project'
WHERE "work_kind" IS NULL;

ALTER TABLE "projects"
  DROP CONSTRAINT IF EXISTS "projects_work_kind_known";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_work_kind_known"
  CHECK ("work_kind" IN ('project', 'job'));

ALTER TABLE "projects"
  DROP CONSTRAINT IF EXISTS "projects_pricing_mode_known";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_pricing_mode_known"
  CHECK ("pricing_mode" IS NULL OR "pricing_mode" IN ('fixed', 'open'));

CREATE INDEX IF NOT EXISTS "projects_org_work_kind_idx"
  ON "projects" ("organization_id", "work_kind");

CREATE INDEX IF NOT EXISTS "projects_org_work_kind_status_idx"
  ON "projects" ("organization_id", "work_kind", "status");

--------------------------------------------------------------------------------
-- contracts: display original + opening reduction (not in CCV event sum)
--------------------------------------------------------------------------------

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "display_original_entered_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "display_original_net_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "display_original_tax_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "display_original_gross_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "opening_reduction_entered_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "opening_reduction_net_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "opening_reduction_tax_amount" numeric(18, 6);

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "opening_reduction_gross_amount" numeric(18, 6);

ALTER TABLE "contracts"
  DROP CONSTRAINT IF EXISTS "contracts_opening_reduction_non_negative";

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_opening_reduction_non_negative"
  CHECK (
    "opening_reduction_net_amount" IS NULL
    OR "opening_reduction_net_amount" >= 0
  );

ALTER TABLE "contracts"
  DROP CONSTRAINT IF EXISTS "contracts_opening_reduction_lte_display";

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_opening_reduction_lte_display"
  CHECK (
    "display_original_net_amount" IS NULL
    OR "opening_reduction_net_amount" IS NULL
    OR "opening_reduction_net_amount" <= "display_original_net_amount"
  );
