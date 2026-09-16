import { describe, expect, it } from 'vitest';
import { computeApprovedHoursBreakdown } from '@/modules/workforce/domain/approved-hours-breakdown';

describe('computeApprovedHoursBreakdown', () => {
  it('splits approved excess into regular and overtime', () => {
    const result = computeApprovedHoursBreakdown([
      {
        hours: '10',
        approvalStatus: 'approved',
        excessHours: '2',
        excessApprovalStatus: 'approved',
      },
      {
        hours: '8',
        approvalStatus: 'approved',
        excessHours: null,
        excessApprovalStatus: null,
      },
    ]);

    expect(result.approvedTotalHours).toBe(18);
    expect(result.approvedOvertimeHours).toBe(2);
    expect(result.approvedRegularHours).toBe(16);
    expect(result.canSplitRegularOvertime).toBe(true);
  });

  it('omits split when excess approval is still pending', () => {
    const result = computeApprovedHoursBreakdown([
      {
        hours: '9',
        approvalStatus: 'approved',
        excessHours: '1',
        excessApprovalStatus: 'pending',
      },
    ]);

    expect(result.approvedTotalHours).toBe(9);
    expect(result.approvedRegularHours).toBeNull();
    expect(result.approvedOvertimeHours).toBeNull();
    expect(result.canSplitRegularOvertime).toBe(false);
  });

  it('does not count rejected excess as overtime', () => {
    const result = computeApprovedHoursBreakdown([
      {
        hours: '9',
        approvalStatus: 'approved',
        excessHours: '1',
        excessApprovalStatus: 'rejected',
      },
    ]);

    expect(result.approvedTotalHours).toBe(9);
    expect(result.approvedOvertimeHours).toBe(0);
    expect(result.approvedRegularHours).toBe(9);
  });

  it('ignores non-approved entries in totals', () => {
    const result = computeApprovedHoursBreakdown([
      {
        hours: '6',
        approvalStatus: 'submitted',
        excessHours: '2',
        excessApprovalStatus: 'approved',
      },
      {
        hours: '4',
        approvalStatus: 'approved',
        excessHours: null,
        excessApprovalStatus: null,
      },
    ]);

    expect(result.approvedTotalHours).toBe(4);
    expect(result.approvedRegularHours).toBe(4);
    expect(result.approvedOvertimeHours).toBe(0);
  });
});
