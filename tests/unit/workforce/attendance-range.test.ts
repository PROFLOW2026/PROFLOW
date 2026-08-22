import { describe, expect, it } from 'vitest';
import { requiresAttendanceOverwriteApproval } from '@/modules/workforce/application/attendance';
import { expandWorkDatesInRange, WEEKDAY_WORKDAYS } from '@/modules/workforce/domain/bulk-time-expand';
import {
  hoursBetweenClockTimes,
  manualAttendanceWorkdayRangeSchema,
} from '@/modules/workforce/validation/schemas';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';

describe('expandWorkDatesInRange (attendance)', () => {
  it('expands July 2026 Sun–Thu and excludes Fri/Sat by default', () => {
    const dates = expandWorkDatesInRange({
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      weekdays: WEEKDAY_WORKDAYS,
    });

    expect(dates[0]).toBe('2026-07-01'); // Wednesday
    expect(dates).toContain('2026-07-05'); // Sunday
    expect(dates).not.toContain('2026-07-03'); // Friday
    expect(dates).not.toContain('2026-07-04'); // Saturday
    expect(dates).toHaveLength(22);
  });

  it('inherits custom org weekdays when provided', () => {
    const orgWeek = resolveOrgWorkWeekdays({ workWeekdays: [0, 1, 2, 3, 4, 5] });
    const dates = expandWorkDatesInRange({
      fromDate: '2026-07-01',
      toDate: '2026-07-07',
      weekdays: orgWeek,
    });
    expect(dates).toContain('2026-07-03'); // Friday included
    expect(dates).not.toContain('2026-07-04'); // Saturday still out
  });

  it('falls back to canonical א׳–ה׳ when org week is unset', () => {
    expect(resolveOrgWorkWeekdays(null)).toEqual([0, 1, 2, 3, 4]);
    expect(resolveOrgWorkWeekdays({ workWeekdays: null })).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('hoursBetweenClockTimes', () => {
  it('computes whole and fractional hours', () => {
    expect(hoursBetweenClockTimes('09:00', '17:00')).toBe('8');
    expect(hoursBetweenClockTimes('09:00', '17:30')).toBe('8.5');
    expect(hoursBetweenClockTimes('08:00', '18:00')).toBe('10');
  });
});

describe('manualAttendanceWorkdayRangeSchema', () => {
  const base = {
    employeeId: '11111111-1111-4111-8111-111111111111',
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    weekdays: [0, 1, 2, 3, 4],
    clockInTime: '09:00',
    clockOutTime: '17:00',
    notes: null,
    updateExisting: false,
    workScope: 'general' as const,
    projectId: null,
  };

  it('accepts a historical workday range template', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it('accepts optional project association', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      ...base,
      workScope: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires project when workScope is project', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      ...base,
      workScope: 'project',
      projectId: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects clock-out before clock-in', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      ...base,
      clockOutTime: '08:00',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects inverted date range', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      ...base,
      fromDate: '2026-07-31',
      toDate: '2026-07-01',
    });
    expect(parsed.success).toBe(false);
  });

  it('defaults overwriteConfirmed to false', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.overwriteConfirmed).toBe(false);
    }
  });

  it('accepts overwriteConfirmed for correction', () => {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      ...base,
      overwriteConfirmed: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.overwriteConfirmed).toBe(true);
    }
  });
});

describe('requiresAttendanceOverwriteApproval (Owner write rule)', () => {
  it('allows immediate save when no existing attendance', () => {
    expect(requiresAttendanceOverwriteApproval(0, false)).toBe(false);
    expect(requiresAttendanceOverwriteApproval(0, true)).toBe(false);
  });

  it('requires approval when any existing day is present', () => {
    expect(requiresAttendanceOverwriteApproval(1, false)).toBe(true);
    expect(requiresAttendanceOverwriteApproval(5, false)).toBe(true);
  });

  it('treats mixed ranges the same (existingCount > 0)', () => {
    // Mixed = some new + some existing → still gated until confirmed
    expect(requiresAttendanceOverwriteApproval(3, false)).toBe(true);
  });

  it('allows mutation only after overwriteConfirmed', () => {
    expect(requiresAttendanceOverwriteApproval(2, true)).toBe(false);
  });
});
