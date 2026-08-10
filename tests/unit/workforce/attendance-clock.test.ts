import { describe, expect, it } from 'vitest';
import {
  canClockIn,
  canClockOut,
  deriveAttendanceDayStatus,
  listActiveAttendanceEvents,
  resolveClockPresenceState,
  type AttendanceEventLike,
} from '@/modules/workforce/domain/attendance';

function event(
  eventType: AttendanceEventLike['eventType'],
  occurredAt: string,
  voidedAt: string | null = null,
): AttendanceEventLike {
  return { eventType, occurredAt, voidedAt };
}

describe('listActiveAttendanceEvents', () => {
  it('drops voided events and sorts by occurredAt', () => {
    const active = listActiveAttendanceEvents([
      event('clock_out', '2026-08-11T17:00:00.000Z'),
      event('clock_in', '2026-08-11T08:00:00.000Z'),
      event('clock_in', '2026-08-11T07:00:00.000Z', '2026-08-11T07:30:00.000Z'),
    ]);
    expect(active.map((row) => row.eventType)).toEqual(['clock_in', 'clock_out']);
  });
});

describe('resolveClockPresenceState', () => {
  it('starts absent with no events', () => {
    expect(resolveClockPresenceState([])).toBe('absent');
  });

  it('clocks in then out', () => {
    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
      ]),
    ).toBe('clocked_in');

    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('clock_out', '2026-08-11T17:00:00.000Z'),
      ]),
    ).toBe('absent');
  });

  it('ignores a second clock_in while already clocked in', () => {
    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('clock_in', '2026-08-11T09:00:00.000Z'),
      ]),
    ).toBe('clocked_in');
  });

  it('supports break start/end between clock in and out', () => {
    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('break_start', '2026-08-11T12:00:00.000Z'),
      ]),
    ).toBe('on_break');

    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('break_start', '2026-08-11T12:00:00.000Z'),
        event('break_end', '2026-08-11T12:30:00.000Z'),
      ]),
    ).toBe('clocked_in');
  });

  it('allows clock_out while on break', () => {
    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('break_start', '2026-08-11T12:00:00.000Z'),
        event('clock_out', '2026-08-11T12:15:00.000Z'),
      ]),
    ).toBe('absent');
  });

  it('ignores voided clock_in so presence returns to absent', () => {
    expect(
      resolveClockPresenceState([
        event('clock_in', '2026-08-11T08:00:00.000Z', '2026-08-11T08:05:00.000Z'),
      ]),
    ).toBe('absent');
  });
});

describe('canClockIn / canClockOut', () => {
  it('only allows clock_in when absent', () => {
    expect(canClockIn('absent')).toBe(true);
    expect(canClockIn('clocked_in')).toBe(false);
    expect(canClockIn('on_break')).toBe(false);
  });

  it('allows clock_out when clocked in or on break', () => {
    expect(canClockOut('absent')).toBe(false);
    expect(canClockOut('clocked_in')).toBe(true);
    expect(canClockOut('on_break')).toBe(true);
  });
});

describe('deriveAttendanceDayStatus', () => {
  it('keeps void days void', () => {
    expect(
      deriveAttendanceDayStatus([event('clock_in', '2026-08-11T08:00:00.000Z')], 'void'),
    ).toBe('void');
  });

  it('is open while clocked in', () => {
    expect(
      deriveAttendanceDayStatus([event('clock_in', '2026-08-11T08:00:00.000Z')]),
    ).toBe('open');
  });

  it('is complete after a finished clock_in/out pair', () => {
    expect(
      deriveAttendanceDayStatus([
        event('clock_in', '2026-08-11T08:00:00.000Z'),
        event('clock_out', '2026-08-11T17:00:00.000Z'),
      ]),
    ).toBe('complete');
  });

  it('stays open with no active events', () => {
    expect(deriveAttendanceDayStatus([])).toBe('open');
  });
});
