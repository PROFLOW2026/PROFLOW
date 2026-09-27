import { DomainRuleError } from '@/shared/errors';
import type { TimeApprovalStatus, TimeEntryStatus, TimesheetStatus } from './types';

/**
 * Timesheet / time-entry approval lifecycle.
 *
 * Allowed: draft → submitted → approved | returned → submitted → approved.
 * Returned can be edited then resubmitted. Approved recorded rows are locked;
 * corrections use void+replace (`correctTimeEntry`), never in-place hour edits.
 *
 * Labor Actual: status='recorded' AND approval_status='approved' only.
 * Draft/submitted/returned never create Actual.
 *
 * New entries always start as draft (safer default). Having `time.approve`
 * does not auto-approve on create - Actual waits for an explicit approve.
 *
 * -----------------------------------------------------------------------
 * TIMESHEET vs TIME ENTRY — intended relationship (Task 5)
 * -----------------------------------------------------------------------
 *
 * TIME ENTRY (`time_entries`)
 *   A single row of project-time allocation for one employee on one work date.
 *   - Represents: "Employee X worked N hours on Project Y on date D."
 *   - Source: employee self-service, manager entry, or bulk template.
 *   - Approval lifecycle: draft → submitted → approved | returned.
 *   - Only approved + recorded entries create labor Actual (cost).
 *   - Corrections: void the original entry, insert a replacement (audit trail).
 *   - A time entry is INDEPENDENT of attendance — it is the "project allocation"
 *     layer, not the presence layer. An entry does NOT prove the employee was
 *     physically present (that is the attendance_days / attendance_events layer).
 *
 * TIMESHEET (`timesheets`)
 *   An optional grouping container for one employee's time entries within a
 *   calendar week (period_start … period_end).
 *   - Purpose: batch submission and approval — one approval action covers all
 *     entries in the period rather than approving each entry individually.
 *   - A timesheet can exist without individual entry-level approval tracking:
 *     when a timesheet is approved, all its attached entries are bulk-approved.
 *   - Timesheets are NOT mandatory; entries may be submitted / approved
 *     individually without ever being attached to a timesheet (`timesheetId IS NULL`).
 *   - One active (non-approved) timesheet per employee per period_start.
 *
 * KEY DIFFERENCES
 *   | Dimension          | Time Entry                | Timesheet                  |
 *   |--------------------|-----------------------------|----------------------------|
 *   | Granularity        | Single day × project        | Week container             |
 *   | Creates Actual     | Yes (when approved+recorded)| No (delegates to entries)  |
 *   | Mandatory          | Yes (labor cost requires it)| No (optional workflow)     |
 *   | Correction method  | void + replacement entry    | reopen → re-submit         |
 *   | Attendance link    | None (separate layer)       | None                       |
 *
 * ATTENDANCE vs TIME ENTRIES
 *   Attendance (attendance_days + attendance_events) is the presence layer:
 *   it records clock-in / clock-out times (physical presence) but NEVER creates
 *   labor cost by itself.  Project time entries are the allocation layer: they
 *   route hours to specific projects and trigger Actual after approval.
 *   An employee may have attendance hours with zero time entries (unallocated) —
 *   this is flagged by the month-close completeness checker.
 * -----------------------------------------------------------------------
 */

export const TIMESHEET_TRANSITIONS: Readonly<
  Record<TimesheetStatus, readonly TimesheetStatus[]>
> = {
  draft: ['submitted'],
  submitted: ['approved', 'returned'],
  returned: ['submitted'],
  approved: [],
};

export function canTransitionTimesheetStatus(
  from: TimesheetStatus,
  to: TimesheetStatus,
): boolean {
  return TIMESHEET_TRANSITIONS[from].includes(to);
}

export function assertTimesheetTransition(
  from: TimesheetStatus,
  to: TimesheetStatus,
): void {
  if (!canTransitionTimesheetStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition timesheet from ${from} to ${to}`,
      'workforce.errors.invalidTimesheetTransition',
      { from, to },
    );
  }
}

export function canTransitionTimeApprovalStatus(
  from: TimeApprovalStatus,
  to: TimeApprovalStatus,
): boolean {
  return canTransitionTimesheetStatus(from, to);
}

export function assertTimeApprovalTransition(
  from: TimeApprovalStatus,
  to: TimeApprovalStatus,
): void {
  if (!canTransitionTimeApprovalStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition time entry approval from ${from} to ${to}`,
      'workforce.errors.invalidTimesheetTransition',
      { from, to },
    );
  }
}

/** Recorded + approved is the only combination that creates labor Actual. */
export function contributesLaborActual(input: {
  readonly status: TimeEntryStatus;
  readonly approvalStatus: TimeApprovalStatus;
}): boolean {
  return input.status === 'recorded' && input.approvalStatus === 'approved';
}

/**
 * Approved recorded rows cannot be edited in place (hours/cost/date/employee/project/kind).
 * Void + correction remains allowed (DB trigger keeps approval_status on void).
 */
export function isApprovedRecordedLocked(input: {
  readonly status: TimeEntryStatus;
  readonly approvalStatus: TimeApprovalStatus;
}): boolean {
  return input.status === 'recorded' && input.approvalStatus === 'approved';
}

export function canEditTimeEntryHours(input: {
  readonly status: TimeEntryStatus;
  readonly approvalStatus: TimeApprovalStatus;
}): boolean {
  return (
    input.status === 'recorded' &&
    (input.approvalStatus === 'draft' || input.approvalStatus === 'returned')
  );
}

export function assertTimeEntryHoursEditable(input: {
  readonly status: TimeEntryStatus;
  readonly approvalStatus: TimeApprovalStatus;
}): void {
  if (isApprovedRecordedLocked(input)) {
    throw new DomainRuleError(
      'Approved time is locked; use a correction',
      'workforce.errors.timeEntryApprovedLocked',
    );
  }
  if (!canEditTimeEntryHours(input)) {
    throw new DomainRuleError(
      'Only draft or returned time entries can be edited',
      'workforce.errors.timeEntryNotEditable',
      { status: input.status, approvalStatus: input.approvalStatus },
    );
  }
}

export function canSubmitApprovalStatus(status: TimeApprovalStatus): boolean {
  return status === 'draft' || status === 'returned';
}

export function canDecideApprovalStatus(status: TimeApprovalStatus): boolean {
  return status === 'submitted';
}

/**
 * Work week for a date. `weekStart` is JS weekday (0=Sunday … 6=Saturday).
 * Default 0 preserves historic Sunday–Saturday Israeli weeks.
 * One active timesheet per employee per period_start.
 */
export function timesheetPeriodForWorkDate(
  workDate: string,
  weekStart = 0,
): {
  readonly periodStart: string;
  readonly periodEnd: string;
} {
  const date = parseUtcDate(workDate);
  const startDay = ((weekStart % 7) + 7) % 7;
  const daysFromStart = (date.getUTCDay() - startDay + 7) % 7;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - daysFromStart);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { periodStart: formatUtcDate(start), periodEnd: formatUtcDate(end) };
}

function parseUtcDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new DomainRuleError('Invalid work date', 'workforce.errors.invalidTimesheetPeriod', {
      workDate: value,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DomainRuleError('Invalid work date', 'workforce.errors.invalidTimesheetPeriod', {
      workDate: value,
    });
  }
  return date;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
