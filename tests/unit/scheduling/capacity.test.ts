import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAY_CAPACITY_HOURS,
  capacityHoursForDays,
  isOverCapacity,
  resolvePlannedHours,
} from '@/modules/scheduling/domain/capacity';
import { availabilityForDay } from '@/modules/scheduling/domain/availability';

describe('scheduling capacity overtime', () => {
  it('defaults to 8 hours per day', () => {
    expect(DEFAULT_DAY_CAPACITY_HOURS).toBe(8);
    expect(capacityHoursForDays(1)).toBe(8);
    expect(capacityHoursForDays(5)).toBe(40);
  });

  it('flags overtime when planned hours exceed capacity', () => {
    expect(isOverCapacity(8, 1)).toBe(false);
    expect(isOverCapacity(8.25, 1)).toBe(true);
    expect(isOverCapacity(16, 2)).toBe(false);
    expect(isOverCapacity(17, 2)).toBe(true);
  });

  it('uses explicit planned hours over wall-clock duration', () => {
    const start = new Date('2026-08-15T08:00:00Z');
    const end = new Date('2026-08-15T10:00:00Z');
    expect(resolvePlannedHours(start, end, null)).toBe(2);
    expect(resolvePlannedHours(start, end, '10')).toBe(10);
    expect(isOverCapacity(resolvePlannedHours(start, end, '10'), 1)).toBe(true);
  });
});

describe('availability signals', () => {
  const morning = {
    startAt: new Date('2026-08-15T08:00:00Z'),
    endAt: new Date('2026-08-15T12:00:00Z'),
  };
  const overlap = {
    startAt: new Date('2026-08-15T11:00:00Z'),
    endAt: new Date('2026-08-15T15:00:00Z'),
  };

  it('returns unavailable before other signals', () => {
    expect(
      availabilityForDay({
        unavailable: true,
        intervals: [morning, overlap],
        plannedHours: 10,
      }),
    ).toBe('unavailable');
  });

  it('returns conflict when timed bookings overlap', () => {
    expect(
      availabilityForDay({
        unavailable: false,
        intervals: [morning, overlap],
        plannedHours: 6,
      }),
    ).toBe('conflict');
  });

  it('returns over_capacity when hours exceed 8 without interval clash', () => {
    expect(
      availabilityForDay({
        unavailable: false,
        intervals: [morning],
        plannedHours: 10,
      }),
    ).toBe('over_capacity');
  });

  it('returns fully_booked at capacity and partially_booked below it', () => {
    expect(
      availabilityForDay({
        unavailable: false,
        intervals: [morning],
        plannedHours: 8,
      }),
    ).toBe('fully_booked');
    expect(
      availabilityForDay({
        unavailable: false,
        intervals: [morning],
        plannedHours: 4,
      }),
    ).toBe('partially_booked');
    expect(
      availabilityForDay({
        unavailable: false,
        intervals: [],
        plannedHours: 0,
      }),
    ).toBe('available');
  });
});
