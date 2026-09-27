-- 0137: Attendance Correction Requests — employee self-service correction flow.
-- Migration after 0132. Do not modify migrations 0000–0136.
-- Additive only — no data mutation.
--
-- BUSINESS CONTEXT
-- Employees can only clock in/out for today via the self-service app.
-- For past days an employee must submit a *correction request* (with reason) to
-- their manager.  The manager can approve or reject. On approval the system
-- applies the corrected clock-in/clock-out to the attendance_days record.
--
-- DESIGN
-- • status: pending → approved | rejected
-- • On approval the application layer voids existing events for the day and
--   inserts clock_in + clock_out from requested_clock_in / requested_clock_out.
-- • applied_attendance_day_id links to the attendance_days row that was updated.
-- • Full audit trail is kept on the request row (who reviewed, when, notes).
--
-- DO NOT APPLY without explicit Owner approval.

CREATE TABLE IF NOT EXISTS public.attendance_correction_requests (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id               uuid        NOT NULL REFERENCES public.employees (id)     ON DELETE CASCADE,
  work_date                 date        NOT NULL,
  requested_clock_in        timestamptz NOT NULL,
  requested_clock_out       timestamptz NOT NULL,
  reason                    text        NOT NULL,
  status                    text        NOT NULL DEFAULT 'pending',
  -- Who submitted the request (employee_app user or org user acting for employee).
  requested_by_user_id      uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- Manager review fields.
  reviewed_by_user_id       uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at               timestamptz,
  reviewer_note             text,
  -- Set after approval — points to the attendance day that was patched.
  applied_attendance_day_id uuid        REFERENCES public.attendance_days (id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_correction_requests_status_known CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT attendance_correction_requests_times_valid CHECK (
    requested_clock_out > requested_clock_in
  ),
  CONSTRAINT attendance_correction_requests_review_coherent CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
  )
);

-- Org-wide pending queue lookup (manager dashboard).
CREATE INDEX IF NOT EXISTS attendance_correction_requests_org_status_idx
  ON public.attendance_correction_requests (organization_id, status, created_at DESC);

-- Employee history lookup.
CREATE INDEX IF NOT EXISTS attendance_correction_requests_employee_idx
  ON public.attendance_correction_requests (employee_id, work_date DESC);

-- Compound unique: only one PENDING request per employee per work_date.
-- (Approved/rejected requests are kept for audit; a new pending can be opened.)
CREATE UNIQUE INDEX IF NOT EXISTS attendance_correction_requests_one_pending_per_day_uq
  ON public.attendance_correction_requests (organization_id, employee_id, work_date)
  WHERE status = 'pending';

-- RLS: tenant isolation — only rows belonging to the row's organization are visible
-- to authenticated application sessions.  The application layer enforces further
-- permission checks (ATTENDANCE_MANAGE for manager actions, ATTENDANCE_SELF for
-- employee submission).
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_correction_requests_org_isolation
  ON public.attendance_correction_requests
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = app.current_user_id()
        AND status = 'active'
    )
  );

-- service_role bypasses RLS (used by server-side application code).
GRANT ALL ON public.attendance_correction_requests TO service_role;
GRANT SELECT ON public.attendance_correction_requests TO authenticated;
