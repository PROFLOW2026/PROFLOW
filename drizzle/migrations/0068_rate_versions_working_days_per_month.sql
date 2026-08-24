-- 0068: Monthly compensation working-days denominator on rate versions.
-- Nullable; meaningful for rate_unit = monthly. NULL → org labor_cost_defaults.workingDaysPerMonth.
-- Owner applies; agent must not apply.
-- Does NOT modify 0000–0067.

ALTER TABLE "rate_versions"
  ADD COLUMN IF NOT EXISTS "working_days_per_month" numeric(8, 4);

COMMENT ON COLUMN public.rate_versions.working_days_per_month IS
  'Optional monthly working-days denominator for MONTHLY compensation. NULL inherits organization labor_cost_defaults.workingDaysPerMonth. Ignored for hourly/daily.';

ALTER TABLE "rate_versions"
  DROP CONSTRAINT IF EXISTS "rate_versions_working_days_per_month_range";

ALTER TABLE "rate_versions"
  ADD CONSTRAINT "rate_versions_working_days_per_month_range"
  CHECK (
    working_days_per_month IS NULL
    OR (working_days_per_month > 0 AND working_days_per_month <= 31)
  );
