-- Workforce time integrity: daily framework, excess approval, idempotency.
-- Owner applies; do not modify applied migrations.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS standard_hours_per_day numeric(8, 4);

COMMENT ON COLUMN employees.standard_hours_per_day IS
  'Optional daily work-hour framework override. NULL inherits organization labor_cost_defaults.standardHoursPerDay.';

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS excess_hours numeric(8, 4),
  ADD COLUMN IF NOT EXISTS excess_approval_status text,
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON COLUMN time_entries.excess_hours IS
  'Portion of hours above the employee daily framework on work_date. Requires manager approval for labor Actual.';

COMMENT ON COLUMN time_entries.excess_approval_status IS
  'pending | approved | rejected — governs whether excess_hours contribute to labor Actual.';

COMMENT ON COLUMN time_entries.client_request_id IS
  'Optional idempotency key for concurrent-safe create (one row per org+request).';

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_standard_hours_per_day_range;

ALTER TABLE employees
  ADD CONSTRAINT employees_standard_hours_per_day_range
  CHECK (
    standard_hours_per_day IS NULL
    OR (standard_hours_per_day > 0 AND standard_hours_per_day <= 24)
  );

ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_excess_approval_status_known;

ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_excess_approval_status_known
  CHECK (
    excess_approval_status IS NULL
    OR excess_approval_status IN ('pending', 'approved', 'rejected')
  );

ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_excess_hours_non_negative;

ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_excess_hours_within_entry;

ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_excess_hours_within_entry
  CHECK (
    excess_hours IS NULL
    OR (excess_hours >= 0 AND excess_hours <= hours)
  );

ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_excess_hours_status_coupling;

ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_excess_hours_status_coupling
  CHECK (
    (
      (excess_hours IS NULL OR excess_hours = 0)
      AND excess_approval_status IS NULL
    )
    OR (
      excess_hours IS NOT NULL
      AND excess_hours > 0
      AND excess_approval_status IN ('pending', 'approved', 'rejected')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_org_client_request_uq
  ON time_entries (organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
