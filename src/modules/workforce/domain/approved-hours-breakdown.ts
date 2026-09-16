/**
 * Approved hours split from recorded time entries (regular vs classified excess).
 * Hours only — no payroll rates or supplements.
 */

export interface TimeEntryHoursSlice {
  readonly hours: string;
  readonly approvalStatus: string;
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
}

export interface ApprovedHoursBreakdown {
  readonly approvedTotalHours: number;
  readonly approvedRegularHours: number | null;
  readonly approvedOvertimeHours: number | null;
  /** When false, report shows approved total only (pending excess classification). */
  readonly canSplitRegularOvertime: boolean;
}

export function computeApprovedHoursBreakdown(
  entries: readonly TimeEntryHoursSlice[],
): ApprovedHoursBreakdown {
  const approved = entries.filter((entry) => entry.approvalStatus === 'approved');
  let total = 0;
  let overtime = 0;
  let canSplit = true;

  for (const entry of approved) {
    const hours = Number(entry.hours) || 0;
    total += hours;
    const excess = Number(entry.excessHours) || 0;
    if (excess <= 0) continue;

    if (entry.excessApprovalStatus === 'approved') {
      overtime += excess;
      continue;
    }
    if (entry.excessApprovalStatus === 'pending') {
      canSplit = false;
    }
  }

  if (approved.length === 0) {
    return {
      approvedTotalHours: 0,
      approvedRegularHours: 0,
      approvedOvertimeHours: 0,
      canSplitRegularOvertime: true,
    };
  }

  if (!canSplit) {
    return {
      approvedTotalHours: total,
      approvedRegularHours: null,
      approvedOvertimeHours: null,
      canSplitRegularOvertime: false,
    };
  }

  const regular = total - overtime;
  return {
    approvedTotalHours: total,
    approvedRegularHours: regular,
    approvedOvertimeHours: overtime,
    canSplitRegularOvertime: true,
  };
}
