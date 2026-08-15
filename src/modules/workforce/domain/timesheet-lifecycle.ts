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
 * does not auto-approve on create — Actual waits for an explicit approve.
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
 * Israeli week: Sunday–Saturday, derived from the work date (YYYY-MM-DD).
 * One active timesheet per employee per period_start.
 */
export function timesheetPeriodForWorkDate(workDate: string): {
  readonly periodStart: string;
  readonly periodEnd: string;
} {
  const date = parseUtcDate(workDate);
  const daysFromSunday = date.getUTCDay();
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - daysFromSunday);
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
