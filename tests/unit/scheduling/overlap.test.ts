import { describe, expect, it } from 'vitest';
import {
  anyPairOverlaps,
  bookingOverlapsUnavailability,
  bookingsConflict,
  inclusiveDatesOverlap,
  instantsOverlap,
} from '@/modules/scheduling/domain/overlap';

describe('scheduling overlap detection', () => {
  const morning = {
    startAt: new Date('2026-08-15T08:00:00Z'),
    endAt: new Date('2026-08-15T12:00:00Z'),
  };
  const afternoon = {
    startAt: new Date('2026-08-15T12:00:00Z'),
    endAt: new Date('2026-08-15T16:00:00Z'),
  };
  const lateMorning = {
    startAt: new Date('2026-08-15T11:00:00Z'),
    endAt: new Date('2026-08-15T13:00:00Z'),
  };

  it('treats touching intervals as not overlapping (half-open)', () => {
    expect(instantsOverlap(morning, afternoon)).toBe(false);
    expect(bookingsConflict(morning, afternoon)).toBe(false);
  });

  it('detects overlapping bookings', () => {
    expect(instantsOverlap(morning, lateMorning)).toBe(true);
    expect(bookingsConflict(morning, lateMorning)).toBe(true);
    expect(anyPairOverlaps([morning, afternoon, lateMorning])).toBe(true);
    expect(anyPairOverlaps([morning, afternoon])).toBe(false);
  });

  it('detects inclusive date-range overlap for unavailability', () => {
    expect(
      inclusiveDatesOverlap(
        { startDate: '2026-08-14', endDate: '2026-08-16' },
        { startDate: '2026-08-16', endDate: '2026-08-18' },
      ),
    ).toBe(true);
    expect(
      inclusiveDatesOverlap(
        { startDate: '2026-08-14', endDate: '2026-08-15' },
        { startDate: '2026-08-16', endDate: '2026-08-18' },
      ),
    ).toBe(false);
  });
});

describe('unavailability vs booking', () => {
  it('blocks a booking whose window sits inside leave', () => {
    const booking = {
      startAt: new Date('2026-08-15T09:00:00Z'),
      endAt: new Date('2026-08-15T11:00:00Z'),
    };
    expect(
      bookingOverlapsUnavailability(
        booking,
        { startDate: '2026-08-15', endDate: '2026-08-15' },
        'UTC',
      ),
    ).toBe(true);
  });

  it('allows a booking on the day after leave ends', () => {
    const booking = {
      startAt: new Date('2026-08-16T09:00:00Z'),
      endAt: new Date('2026-08-16T11:00:00Z'),
    };
    expect(
      bookingOverlapsUnavailability(
        booking,
        { startDate: '2026-08-14', endDate: '2026-08-15' },
        'UTC',
      ),
    ).toBe(false);
  });
});
