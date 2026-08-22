import { describe, expect, it } from 'vitest';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { groupTimeEntriesByDate } from '@/modules/workforce/domain/time-entry-list-grouping';
import { buildTimeEntryDailySummaryFromTotals } from '@/modules/workforce/application/time-entry-daily-summaries';
import type { TimeEntryListItem } from '@/modules/workforce/domain/types';

describe('formatWorkHoursValue', () => {
  it('strips six-decimal DB precision', () => {
    expect(formatWorkHoursValue('8.000000')).toBe('8');
    expect(formatWorkHoursValue('7.500000')).toBe('7.5');
    expect(formatWorkHoursValue('2.250000')).toBe('2.25');
  });

  it('handles edge values', () => {
    expect(formatWorkHoursValue('0')).toBe('0');
    expect(formatWorkHoursValue(null)).toBe('0');
    expect(formatWorkHoursValue('10.333333')).toBe('10.33');
  });
});

describe('groupTimeEntriesByDate', () => {
  const base = {
    organizationId: 'org',
    employeeName: 'Test',
    projectName: 'P',
    workPackageName: null,
    timeCodeName: null,
    kind: 'project' as const,
    projectId: 'p1',
    workPackageId: null,
    phaseId: null,
    timeCodeId: null,
    rateVersionId: null,
    costAmount: null,
    costCurrency: null,
    description: null,
    createdByUserId: null,
    status: 'recorded' as const,
    voidedAt: null,
    correctsEntryId: null,
    bulkBatchId: null,
    timesheetId: null,
    approvalStatus: 'draft' as const,
    submittedAt: null,
    submittedByUserId: null,
    decidedAt: null,
    decidedByUserId: null,
    managerNote: null,
    excessHours: null,
    excessApprovalStatus: null,
    clientRequestId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('groups entries by work date preserving order', () => {
    const entries: TimeEntryListItem[] = [
      { ...base, id: '1', employeeId: 'e1', workDate: '2026-08-22', hours: '4.000000' },
      { ...base, id: '2', employeeId: 'e1', workDate: '2026-08-22', hours: '4.000000', projectName: 'B' },
      { ...base, id: '3', employeeId: 'e1', workDate: '2026-08-21', hours: '8.000000' },
    ];

    const groups = groupTimeEntriesByDate(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.workDate).toBe('2026-08-22');
    expect(groups[0]?.entries).toHaveLength(2);
    expect(groups[0]?.dayTotalHours).toBe('8');
  });
});

describe('buildTimeEntryDailySummaryFromTotals', () => {
  it('computes remaining when within framework', () => {
    const summary = buildTimeEntryDailySummaryFromTotals({
      reportedTotal: '8',
      frameworkHours: '8',
    });
    expect(summary.excessHours).toBeNull();
  });

  it('computes excess when over framework', () => {
    const summary = buildTimeEntryDailySummaryFromTotals({
      reportedTotal: '10',
      frameworkHours: '8',
    });
    expect(summary.excessHours).toBe('2');
  });
});
