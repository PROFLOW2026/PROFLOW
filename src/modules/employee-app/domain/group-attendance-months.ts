import type { AttendanceDayStatus } from '@/modules/workforce';

export interface EmployeeAttendanceDayRow {
  readonly id: string;
  readonly workDate: string;
  readonly status: AttendanceDayStatus;
  readonly clockInAt: string | null;
  readonly clockOutAt: string | null;
}

export interface EmployeeAttendanceMonthGroup {
  readonly monthKey: string;
  readonly monthLabel: string;
  readonly dayCount: number;
  readonly totalHours: number | null;
  readonly days: readonly EmployeeAttendanceDayRow[];
}

/** Worked hours from first clock-in to last clock-out when both exist. */
export function attendanceDayWorkedHours(
  clockInAt: string | null,
  clockOutAt: string | null,
): number | null {
  if (!clockInAt || !clockOutAt) return null;
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / (1000 * 60 * 60);
}

export function groupEmployeeAttendanceByMonth(
  days: readonly EmployeeAttendanceDayRow[],
  locale: string,
  timeZone: string,
): EmployeeAttendanceMonthGroup[] {
  const monthFormatter = new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'he-IL', {
    month: 'long',
    year: 'numeric',
    timeZone,
  });

  const byMonth = new Map<string, EmployeeAttendanceDayRow[]>();

  for (const day of days) {
    const monthKey = day.workDate.slice(0, 7);
    const bucket = byMonth.get(monthKey);
    if (bucket) bucket.push(day);
    else byMonth.set(monthKey, [day]);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthDays]) => {
      const sortedDays = [...monthDays].sort((a, b) => b.workDate.localeCompare(a.workDate));
      const recordedDays = sortedDays.filter((day) => day.status !== 'void');
      let totalHours = 0;
      let hasHours = false;

      for (const day of recordedDays) {
        const hours = attendanceDayWorkedHours(day.clockInAt, day.clockOutAt);
        if (hours != null) {
          totalHours += hours;
          hasHours = true;
        }
      }

      const labelDate = new Date(`${monthKey}-15T12:00:00`);

      return {
        monthKey,
        monthLabel: monthFormatter.format(labelDate),
        dayCount: recordedDays.length,
        totalHours: hasHours ? totalHours : null,
        days: sortedDays,
      };
    });
}
