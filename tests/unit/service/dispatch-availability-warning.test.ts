import { describe, expect, it } from 'vitest';
import { dispatchAvailabilityWarnings } from '@/modules/service/domain/dispatch-availability-warning';

describe('dispatchAvailabilityWarnings', () => {
  it('warns when employee is on leave', () => {
    expect(dispatchAvailabilityWarnings({ hasUnavailability: true, hasOverlappingBooking: false })).toEqual([
      { code: 'on_leave' },
    ]);
  });

  it('warns on overlapping booking without blocking codes mixing', () => {
    expect(
      dispatchAvailabilityWarnings({ hasUnavailability: true, hasOverlappingBooking: true }).map((w) => w.code),
    ).toEqual(['on_leave', 'overlapping_booking']);
  });

  it('returns no warnings when assignee is available', () => {
    expect(dispatchAvailabilityWarnings({ hasUnavailability: false, hasOverlappingBooking: false })).toEqual([]);
  });
});
