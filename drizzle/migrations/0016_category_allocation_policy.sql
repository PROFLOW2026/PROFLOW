-- Wave 3 Agent 4: cost category allocation policy (period behavior).
-- Default allocation method already exists (0014). Period behavior is optional
-- org configuration — never hardcoded per category key (e.g. insurance).

ALTER TABLE "cost_categories"
  ADD COLUMN IF NOT EXISTS "default_period_behavior" text;

ALTER TABLE "cost_categories"
  DROP CONSTRAINT IF EXISTS "cost_categories_period_behavior_known";

ALTER TABLE "cost_categories"
  ADD CONSTRAINT "cost_categories_period_behavior_known" CHECK (
    "default_period_behavior" IS NULL
    OR "default_period_behavior" IN ('one_time', 'monthly', 'date_range')
  );
