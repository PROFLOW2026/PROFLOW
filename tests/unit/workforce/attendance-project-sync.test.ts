import { describe, expect, it } from 'vitest';
import {
  breakdownDailyHours,
  hoursEqualLoose,
  isExactDuplicateCandidate,
} from '@/modules/workforce/domain/daily-time-integrity';
import { expandWorkDatesInRange, WEEKDAY_WORKDAYS } from '@/modules/workforce/domain/bulk-time-expand';
import { hoursBetweenClockTimes } from '@/modules/workforce/validation/schemas';

describe('daily framework reportedSoFar=0 (attendance→project create)', () => {
  it('accepts coalesce sum 0 without invalidHours', () => {
    const breakdown = breakdownDailyHours({
      standardHoursPerDay: '8',
      reportedSoFar: '0',
      newHours: '8',
    });
    expect(breakdown.regularHours).toBe('8');
    expect(breakdown.exceedsDailyFramework).toBe(false);
  });
});

describe('attendance→project hours + dates', () => {
  it('maps 09:00–17:00 to 8 hours', () => {
    expect(hoursBetweenClockTimes('09:00', '17:00')).toBe('8');
  });

  it('July 2026 א׳–ה׳ yields 22 work dates', () => {
    expect(
      expandWorkDatesInRange({
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
        weekdays: WEEKDAY_WORKDAYS,
      }),
    ).toHaveLength(22);
  });

  it('treats same project day/hours as duplicate ignoring notes', () => {
    expect(
      isExactDuplicateCandidate({
        candidate: {
          employeeId: 'e',
          workDate: '2026-07-01',
          kind: 'project',
          projectId: 'p',
          hours: '8',
          workPackageId: 'w',
          phaseId: null,
          timeCodeId: null,
          description: 'note a',
        },
        existing: {
          id: '1',
          workDate: '2026-07-01',
          projectId: 'p',
          hours: '8.000000',
          workPackageId: 'w',
          phaseId: null,
          timeCodeId: null,
          description: 'note b',
        },
      }),
    ).toBe(true);
    expect(hoursEqualLoose('8', '8.000000')).toBe(true);
  });
});
