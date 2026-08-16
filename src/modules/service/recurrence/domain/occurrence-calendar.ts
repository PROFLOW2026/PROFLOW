/**
 * Pure calendar math for service recurrence templates.
 * Framework-free - unit-tested without DB.
 */

import {
  addDays,
  addMonths,
  businessDate,
  compareBusinessDates,
  type BusinessDate,
} from '@/shared/dates';
import type { RecurrenceFrequency } from './types';

export interface OccurrenceSeriesInput {
  readonly startDate: string;
  readonly endDate?: string | null;
  readonly frequency: RecurrenceFrequency;
  /** Positive integer; defaults to 1 when omitted/invalid. */
  readonly intervalCount?: number | null;
  /**
   * Inclusive horizon. Occurrences after this date are not emitted.
   * Combined with `endDate` via the earlier bound.
   */
  readonly untilInclusive: string;
  /**
   * When set, only dates strictly after this value are emitted
   * (used after skip / generate to advance the series).
   */
  readonly afterExclusive?: string | null;
  /** Hard cap to avoid runaway loops on bad input. */
  readonly maxCount?: number;
}

function normalizeInterval(intervalCount: number | null | undefined): number {
  if (intervalCount == null || !Number.isFinite(intervalCount)) return 1;
  const n = Math.trunc(intervalCount);
  return n < 1 ? 1 : n;
}

/**
 * Advances one occurrence by frequency × interval.
 * Monthly/quarterly/yearly clamp day-of-month (e.g. Jan 31 → Feb 28).
 */
export function advanceOccurrenceDate(
  date: BusinessDate,
  frequency: RecurrenceFrequency,
  intervalCount: number | null | undefined = 1,
): BusinessDate {
  const n = normalizeInterval(intervalCount);
  switch (frequency) {
    case 'daily':
      return addDays(date, n);
    case 'weekly':
      return addDays(date, 7 * n);
    case 'monthly':
      return addMonths(date, n);
    case 'quarterly':
      return addMonths(date, 3 * n);
    case 'yearly':
      return addMonths(date, 12 * n);
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

function resolveSeriesEnd(
  endDate: string | null | undefined,
  untilInclusive: BusinessDate,
): BusinessDate {
  if (!endDate) return untilInclusive;
  const capped = businessDate(endDate);
  return compareBusinessDates(capped, untilInclusive) <= 0 ? capped : untilInclusive;
}

/**
 * Enumerates occurrence calendar dates for a recurrence template.
 * Inclusive of `startDate` when it falls within the horizon and after the exclusive cursor.
 */
export function enumerateOccurrenceDates(input: OccurrenceSeriesInput): BusinessDate[] {
  const start = businessDate(input.startDate);
  const until = resolveSeriesEnd(input.endDate, businessDate(input.untilInclusive));
  const after = input.afterExclusive ? businessDate(input.afterExclusive) : null;
  const maxCount = input.maxCount ?? 366;
  const interval = normalizeInterval(input.intervalCount);

  if (compareBusinessDates(start, until) > 0) return [];

  const dates: BusinessDate[] = [];
  let cursor = start;

  // Fast-forward past `afterExclusive` without emitting.
  while (after && compareBusinessDates(cursor, after) <= 0) {
    cursor = advanceOccurrenceDate(cursor, input.frequency, interval);
    if (compareBusinessDates(cursor, until) > 0) return [];
  }

  while (compareBusinessDates(cursor, until) <= 0 && dates.length < maxCount) {
    dates.push(cursor);
    cursor = advanceOccurrenceDate(cursor, input.frequency, interval);
  }

  return dates;
}

/**
 * Next occurrence on or after `onOrAfter`, respecting optional series end.
 * Returns null when the series is exhausted.
 */
export function computeNextOccurrenceDate(input: {
  readonly startDate: string;
  readonly endDate?: string | null;
  readonly frequency: RecurrenceFrequency;
  readonly intervalCount?: number | null;
  readonly onOrAfter: string;
}): BusinessDate | null {
  const start = businessDate(input.startDate);
  const onOrAfter = businessDate(input.onOrAfter);
  const end = input.endDate ? businessDate(input.endDate) : null;
  const interval = normalizeInterval(input.intervalCount);

  let cursor = start;
  // Bound iterations: daily over ~100 years.
  for (let i = 0; i < 40_000; i += 1) {
    if (end && compareBusinessDates(cursor, end) > 0) return null;
    if (compareBusinessDates(cursor, onOrAfter) >= 0) return cursor;
    cursor = advanceOccurrenceDate(cursor, input.frequency, interval);
  }
  return null;
}
