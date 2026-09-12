-- Explicit owner-controlled overtime classification on attendance days.
-- Default false — never inferred from day-of-week or non-standard workdays.

ALTER TABLE attendance_days
  ADD COLUMN IF NOT EXISTS is_overtime boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance_days.is_overtime IS
  'When true, attendance is classified as overtime by an authorized manager. Never set by employee self-service.';
