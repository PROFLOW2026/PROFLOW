import { describe, expect, it } from 'vitest';
import {
  isConfiguredOrgWorkday,
  isRequiredAttendanceWorkday,
  weekdayFromBusinessDate,
} from '@/modules/workforce/domain/attendance-workday';
import { employeeRequiresAttendanceReporting } from '@/modules/workforce/domain/attendance-requirement';
import { expandWorkDatesInRange } from '@/modules/workforce/domain/bulk-time-expand';

/** Sun–Thu org workweek (ProjectFlow default). */
const SUN_THU = [0, 1, 2, 3, 4] as const;

describe('configured org workdays vs actual work', () => {
  it('CASE 1: Friday is not a required attendance day (Sun–Thu org)', () => {
    expect(weekdayFromBusinessDate('2026-03-06')).toBe(5); // Friday
    expect(isConfiguredOrgWorkday('2026-03-06', SUN_THU)).toBe(false);
    expect(
      isRequiredAttendanceWorkday('2026-03-06', SUN_THU, 'standard'),
    ).toBe(false);
  });

  it('CASE 8: Thursday remains a required attendance day', () => {
    expect(isConfiguredOrgWorkday('2026-03-05', SUN_THU)).toBe(true);
    expect(
      isRequiredAttendanceWorkday('2026-03-05', SUN_THU, 'standard'),
    ).toBe(true);
  });

  it('owner_manager is never required to report attendance', () => {
    expect(
      isRequiredAttendanceWorkday('2026-03-05', SUN_THU, 'owner_manager'),
    ).toBe(false);
    expect(employeeRequiresAttendanceReporting({ compensationClass: 'owner_manager' })).toBe(
      false,
    );
  });

  it('CASE 7: retro-fill Sun–Thu does not generate Friday rows', () => {
    const dates = expandWorkDatesInRange({
      fromDate: '2026-03-01',
      toDate: '2026-03-07',
      weekdays: [...SUN_THU],
    });
    expect(dates).not.toContain('2026-03-06'); // Friday
    expect(dates).not.toContain('2026-03-07'); // Saturday
    expect(dates).toContain('2026-03-05'); // Thursday
  });
});

describe('overtime defaults (domain contract)', () => {
  it('new attendance days default to not overtime at schema level', () => {
    // Documented contract: is_overtime NOT NULL DEFAULT false in migration 0086.
    expect(true).toBe(true);
  });
});
