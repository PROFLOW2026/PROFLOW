import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors';
import { localWallTimeToDate } from '@/modules/workforce/application/attendance';

describe('localWallTimeToDate (organization time zone)', () => {
  it('reads 09:00 on a summer work date as Asia/Jerusalem daylight time', () => {
    const workDate = '2026-07-01';
    const instant = localWallTimeToDate(workDate, '09:00', 'Asia/Jerusalem');
    expect(instant.toISOString()).toBe('2026-07-01T06:00:00.000Z');
  });

  it('reads 09:00 on a winter work date as Asia/Jerusalem standard time', () => {
    const instant = localWallTimeToDate('2026-01-15', '09:00', 'Asia/Jerusalem');
    expect(instant.toISOString()).toBe('2026-01-15T07:00:00.000Z');
  });

  it('keeps the chosen work date when that wall clock is the previous UTC day', () => {
    const workDate = '2026-01-15';
    const instant = localWallTimeToDate(workDate, '01:30', 'Asia/Jerusalem');
    expect(instant.toISOString()).toBe('2026-01-14T23:30:00.000Z');
  });

  it('accepts HH:mm:ss and follows the organization zone', () => {
    const jerusalem = localWallTimeToDate('2026-07-01', '09:00:00', 'Asia/Jerusalem');
    const newYork = localWallTimeToDate('2026-07-01', '09:00', 'America/New_York');
    expect(jerusalem.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(newYork.toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });

  it('rejects a clock time that is not a wall time', () => {
    expect(() => localWallTimeToDate('2026-01-15', 'xx', 'Asia/Jerusalem')).toThrow(ValidationError);
  });
});
