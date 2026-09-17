import { describe, expect, it } from 'vitest';
import {
  attendanceDayWorkedHours,
  groupEmployeeAttendanceByMonth,
} from '@/modules/employee-app/domain/group-attendance-months';

describe('groupEmployeeAttendanceByMonth', () => {
  it('groups days by month with Hebrew labels and hour totals', () => {
    const groups = groupEmployeeAttendanceByMonth(
      [
        {
          id: '1',
          workDate: '2026-09-17',
          status: 'complete',
          clockInAt: '2026-09-17T06:00:00.000Z',
          clockOutAt: '2026-09-17T14:00:00.000Z',
        },
        {
          id: '2',
          workDate: '2026-09-16',
          status: 'complete',
          clockInAt: '2026-09-16T06:00:00.000Z',
          clockOutAt: '2026-09-16T14:00:00.000Z',
        },
        {
          id: '3',
          workDate: '2026-08-30',
          status: 'complete',
          clockInAt: '2026-08-30T06:00:00.000Z',
          clockOutAt: '2026-08-30T12:00:00.000Z',
        },
      ],
      'he-IL',
      'Asia/Jerusalem',
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.monthKey).toBe('2026-09');
    expect(groups[0]?.dayCount).toBe(2);
    expect(groups[0]?.totalHours).toBe(16);
    expect(groups[1]?.monthKey).toBe('2026-08');
    expect(groups[1]?.dayCount).toBe(1);
  });

  it('computes worked hours only when both clock times exist', () => {
    expect(
      attendanceDayWorkedHours('2026-09-17T08:00:00.000Z', '2026-09-17T16:00:00.000Z'),
    ).toBe(8);
    expect(attendanceDayWorkedHours('2026-09-17T08:00:00.000Z', null)).toBeNull();
  });
});
