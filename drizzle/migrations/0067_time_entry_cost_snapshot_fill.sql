-- Allow fill-only labor cost snapshots on approved recorded time entries.
-- Narrow exception only: NULL cost/rate/currency → fill, never overwrite cost.
-- Requires workforce.cost.manage. Rate must match org+employee+work_date when set.
-- Owner applies; agent must not apply.
-- Does NOT modify 0000–0066.

CREATE OR REPLACE FUNCTION app.time_entries_approval_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approval_status = 'approved' AND OLD.status = 'recorded' THEN
      RAISE EXCEPTION 'time_entries: approved recorded time cannot be deleted; void and replace'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.approval_status = 'approved' AND OLD.status = 'recorded' THEN
    ------------------------------------------------------------------
    -- Void path: status → void only; economics + 0066 excess fields immutable.
    ------------------------------------------------------------------
    IF NEW.status = 'void' AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
         OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.work_package_id IS DISTINCT FROM OLD.work_package_id
         OR NEW.phase_id IS DISTINCT FROM OLD.phase_id
         OR NEW.time_code_id IS DISTINCT FROM OLD.time_code_id
         OR NEW.work_date IS DISTINCT FROM OLD.work_date
         OR NEW.hours IS DISTINCT FROM OLD.hours
         OR NEW.kind IS DISTINCT FROM OLD.kind
         OR NEW.rate_version_id IS DISTINCT FROM OLD.rate_version_id
         OR NEW.cost_amount IS DISTINCT FROM OLD.cost_amount
         OR NEW.cost_currency IS DISTINCT FROM OLD.cost_currency
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
         OR NEW.corrects_entry_id IS DISTINCT FROM OLD.corrects_entry_id
         OR NEW.bulk_batch_id IS DISTINCT FROM OLD.bulk_batch_id
         OR NEW.timesheet_id IS DISTINCT FROM OLD.timesheet_id
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
         OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
         OR NEW.decided_by_user_id IS DISTINCT FROM OLD.decided_by_user_id
         OR NEW.manager_note IS DISTINCT FROM OLD.manager_note
         OR NEW.excess_hours IS DISTINCT FROM OLD.excess_hours
         OR NEW.excess_approval_status IS DISTINCT FROM OLD.excess_approval_status
         OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
         OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'time_entries: voiding approved time cannot rewrite history'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      -- voided_at may change on the void path.
      RETURN NEW;
    END IF;

    ------------------------------------------------------------------
    -- Fill-only missing labor cost / rate snapshot (cost.manage only).
    -- Identity, hours/date/project, voided_at, and 0066 excess fields stay locked.
    -- updated_at may change.
    ------------------------------------------------------------------
    IF NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
       AND NEW.voided_at IS NOT DISTINCT FROM OLD.voided_at
       AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
       AND NEW.work_package_id IS NOT DISTINCT FROM OLD.work_package_id
       AND NEW.phase_id IS NOT DISTINCT FROM OLD.phase_id
       AND NEW.time_code_id IS NOT DISTINCT FROM OLD.time_code_id
       AND NEW.work_date IS NOT DISTINCT FROM OLD.work_date
       AND NEW.hours IS NOT DISTINCT FROM OLD.hours
       AND NEW.kind IS NOT DISTINCT FROM OLD.kind
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id
       AND NEW.corrects_entry_id IS NOT DISTINCT FROM OLD.corrects_entry_id
       AND NEW.bulk_batch_id IS NOT DISTINCT FROM OLD.bulk_batch_id
       AND NEW.timesheet_id IS NOT DISTINCT FROM OLD.timesheet_id
       AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at
       AND NEW.submitted_by_user_id IS NOT DISTINCT FROM OLD.submitted_by_user_id
       AND NEW.decided_at IS NOT DISTINCT FROM OLD.decided_at
       AND NEW.decided_by_user_id IS NOT DISTINCT FROM OLD.decided_by_user_id
       AND NEW.manager_note IS NOT DISTINCT FROM OLD.manager_note
       AND NEW.excess_hours IS NOT DISTINCT FROM OLD.excess_hours
       AND NEW.excess_approval_status IS NOT DISTINCT FROM OLD.excess_approval_status
       AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
       AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND (
         -- Path A: fill NULL cost_amount (+ currency / optional rate)
         (
           OLD.cost_amount IS NULL
           AND NEW.cost_amount IS NOT NULL
           AND NEW.cost_currency IS NOT NULL
           AND (
             OLD.cost_currency IS NULL
             OR NEW.cost_currency IS NOT DISTINCT FROM OLD.cost_currency
           )
           AND (
             OLD.rate_version_id IS NULL
             OR NEW.rate_version_id IS NOT DISTINCT FROM OLD.rate_version_id
           )
         )
         -- Path B: fill NULL rate_version_id only (existing cost untouched)
         OR (
           OLD.cost_amount IS NOT NULL
           AND NEW.cost_amount IS NOT DISTINCT FROM OLD.cost_amount
           AND NEW.cost_currency IS NOT DISTINCT FROM OLD.cost_currency
           AND OLD.rate_version_id IS NULL
           AND NEW.rate_version_id IS NOT NULL
         )
       )
    THEN
      IF NOT app.has_org_permission(OLD.organization_id, 'workforce.cost.manage') THEN
        RAISE EXCEPTION 'time_entries: cost snapshot fill requires workforce.cost.manage'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NEW.rate_version_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.rate_versions rv
          WHERE rv.id = NEW.rate_version_id
            AND rv.organization_id = OLD.organization_id
            AND rv.employee_id = OLD.employee_id
            AND rv.valid_from <= NEW.work_date
            AND (rv.valid_to IS NULL OR rv.valid_to >= NEW.work_date)
        ) THEN
          RAISE EXCEPTION 'time_entries: rate_version_id must belong to the same org/employee and cover work_date'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
      END IF;

      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'time_entries: approved time is locked; use a correction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION app.time_entries_approval_lock() IS
  'Locks approved recorded time. Allows void (economics+0066 excess immutable) and fill-only null cost/rate snapshots for workforce.cost.manage.';
