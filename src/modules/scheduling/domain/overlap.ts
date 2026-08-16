/**
 * Overlap / conflict detection for bookings and unavailability.
 * Framework-free - unit-tested without DB.
 */

import { addDays, businessDate } from '@/shared/dates';
import type { InclusiveDateRange, Interval } from './types';
import { startOfDayInTimeZone } from './windows';

/** Half-open instants: [start, end). Overlap when each starts before the other ends. */
export function instantsOverlap(left: Interval, right: Interval): boolean {
  return left.startAt.getTime() < right.endAt.getTime() && right.startAt.getTime() < left.endAt.getTime();
}

/** Inclusive calendar dates. */
export function inclusiveDatesOverlap(left: InclusiveDateRange, right: InclusiveDateRange): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

export function unavailabilityToInterval(
  range: InclusiveDateRange,
  timeZone: string,
): Interval {
  return {
    startAt: startOfDayInTimeZone(range.startDate, timeZone),
    endAt: startOfDayInTimeZone(addDays(businessDate(range.endDate), 1), timeZone),
  };
}

/** Hard conflict: a timed booking occupies any part of an unavailability span. */
export function bookingOverlapsUnavailability(
  booking: Interval,
  unavailability: InclusiveDateRange,
  timeZone: string,
): boolean {
  return instantsOverlap(booking, unavailabilityToInterval(unavailability, timeZone));
}

export function findOverlappingIntervals<T extends Interval>(
  candidate: Interval,
  others: readonly T[],
): T[] {
  return others.filter((other) => instantsOverlap(candidate, other));
}

export function findOverlappingDateRanges<T extends InclusiveDateRange>(
  candidate: InclusiveDateRange,
  others: readonly T[],
): T[] {
  return others.filter((other) => inclusiveDatesOverlap(candidate, other));
}

/**
 * Two bookings conflict when their instants overlap.
 * Used for same-employee, active (non-cancelled) rows only - callers filter.
 */
export function bookingsConflict(left: Interval, right: Interval): boolean {
  return instantsOverlap(left, right);
}

/** True when any pair of intervals overlap (used for a day's conflict signal). */
export function anyPairOverlaps(intervals: readonly Interval[]): boolean {
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      if (instantsOverlap(intervals[i]!, intervals[j]!)) return true;
    }
  }
  return false;
}
