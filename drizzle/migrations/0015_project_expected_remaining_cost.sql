-- Wave 2 Agent 2: minimal Expected Remaining Cost (ETC) for forecast final cost.
-- Numbered 0015 after Agent 1's 0014_allocation_engine.
-- FORECAST = ACTUAL + REMAINING COMMITMENTS + EXPECTED REMAINING (no double count).

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "expected_remaining_cost_amount" numeric(18, 6);

ALTER TABLE "projects"
  DROP CONSTRAINT IF EXISTS "projects_expected_remaining_cost_non_negative";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_expected_remaining_cost_non_negative"
  CHECK (
    "expected_remaining_cost_amount" IS NULL
    OR "expected_remaining_cost_amount" >= 0
  );

COMMENT ON COLUMN "projects"."expected_remaining_cost_amount" IS
  'User-entered uncovenanted remaining cost (ETC). Currency = project currency (or org base). Null/absent means zero. Never includes open PO commitments (those live on committed_costs).';
