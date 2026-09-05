import { describe, expect, it } from 'vitest';
import {
  assertTimeApprovalTransition,
  assertTimeEntryHoursEditable,
  canEditTimeEntryHours,
  canSubmitApprovalStatus,
  canTransitionTimesheetStatus,
  contributesLaborActual,
  isApprovedRecordedLocked,
  timesheetPeriodForWorkDate,
} from '@/modules/workforce/domain/timesheet-lifecycle';

describe('timesheet lifecycle transitions', () => {
  it('allows draft → submitted → approved', () => {
    expect(canTransitionTimesheetStatus('draft', 'submitted')).toBe(true);
    expect(canTransitionTimesheetStatus('submitted', 'approved')).toBe(true);
  });

  it('allows submitted → returned → submitted → approved', () => {
    expect(canTransitionTimesheetStatus('submitted', 'returned')).toBe(true);
    expect(canTransitionTimesheetStatus('returned', 'submitted')).toBe(true);
    expect(canTransitionTimesheetStatus('returned', 'approved')).toBe(false);
    expect(canTransitionTimesheetStatus('approved', 'submitted')).toBe(false);
    expect(canTransitionTimesheetStatus('approved', 'returned')).toBe(false);
  });

  it('rejects skipping submit', () => {
    expect(canTransitionTimesheetStatus('draft', 'approved')).toBe(false);
    expect(() => assertTimeApprovalTransition('draft', 'approved')).toThrow(
      /Cannot transition time entry approval/,
    );
  });
});

describe('approved recorded lock', () => {
  it('locks approved recorded rows against in-place hour edits', () => {
    expect(isApprovedRecordedLocked({ status: 'recorded', approvalStatus: 'approved' })).toBe(true);
    expect(canEditTimeEntryHours({ status: 'recorded', approvalStatus: 'approved' })).toBe(false);
    expect(() =>
      assertTimeEntryHoursEditable({ status: 'recorded', approvalStatus: 'approved' }),
    ).toThrow(/Approved time is locked/);
  });

  it('lets returned and draft rows be edited then resubmitted', () => {
    expect(canEditTimeEntryHours({ status: 'recorded', approvalStatus: 'draft' })).toBe(true);
    expect(canEditTimeEntryHours({ status: 'recorded', approvalStatus: 'returned' })).toBe(true);
    expect(canSubmitApprovalStatus('draft')).toBe(true);
    expect(canSubmitApprovalStatus('returned')).toBe(true);
    expect(canSubmitApprovalStatus('submitted')).toBe(false);
    expect(canEditTimeEntryHours({ status: 'recorded', approvalStatus: 'submitted' })).toBe(false);
  });

  it('does not lock void rows (correction path)', () => {
    expect(isApprovedRecordedLocked({ status: 'void', approvalStatus: 'approved' })).toBe(false);
  });
});

describe('labor Actual gate', () => {
  it('counts only recorded + approved', () => {
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'approved' })).toBe(true);
  });

  it('excludes draft, submitted, and returned even when recorded', () => {
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'draft' })).toBe(false);
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'submitted' })).toBe(false);
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'returned' })).toBe(false);
  });

  it('excludes void approved history', () => {
    expect(contributesLaborActual({ status: 'void', approvalStatus: 'approved' })).toBe(false);
  });
});

describe('timesheetPeriodForWorkDate', () => {
  it('uses Sunday–Saturday Israeli weeks', () => {
    expect(timesheetPeriodForWorkDate('2026-08-12')).toEqual({
      periodStart: '2026-08-09',
      periodEnd: '2026-08-15',
    });
    expect(timesheetPeriodForWorkDate('2026-08-09')).toEqual({
      periodStart: '2026-08-09',
      periodEnd: '2026-08-15',
    });
    expect(timesheetPeriodForWorkDate('2026-08-15')).toEqual({
      periodStart: '2026-08-09',
      periodEnd: '2026-08-15',
    });
  });

  it('honors Monday week start', () => {
    expect(timesheetPeriodForWorkDate('2026-08-12', 1)).toEqual({
      periodStart: '2026-08-10',
      periodEnd: '2026-08-16',
    });
    expect(timesheetPeriodForWorkDate('2026-08-10', 1)).toEqual({
      periodStart: '2026-08-10',
      periodEnd: '2026-08-16',
    });
  });
});
