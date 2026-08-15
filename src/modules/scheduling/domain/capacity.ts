/**
 * Simple capacity: 8 hours per calendar day unless a caller supplies another day length.
 * Overtime / over-capacity when planned hours exceed that budget.
 */

import { addDays, businessDate, type BusinessDate } from '@/shared/dates';
import type { Interval } from './types';
import { instantsOverlap } from './overlap';
import { businessDateInTimeZone, startOfDayInTimeZone } from './windows';

export const DEFAULT_DAY_CAPACITY_HOURS = 8;

export function parseHours(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function hoursBetween(startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}

export function resolvePlannedHours(
  startAt: Date,
  endAt: Date,
  plannedHours: string | number | null | undefined,
): number {
  return parseHours(plannedHours) ?? hoursBetween(startAt, endAt);
}

export function capacityHoursForDays(
  dayCount: number,
  hoursPerDay: number = DEFAULT_DAY_CAPACITY_HOURS,
): number {
  const days = Number.isFinite(dayCount) ? Math.max(0, Math.trunc(dayCount)) : 0;
  return days * hoursPerDay;
}

export function isOverCapacity(
  plannedHours: number,
  dayCount: number,
  hoursPerDay: number = DEFAULT_DAY_CAPACITY_HOURS,
): boolean {
  return plannedHours > capacityHoursForDays(dayCount, hoursPerDay);
}

export function overlapHours(left: Interval, right: Interval): number {
  const start = Math.max(left.startAt.getTime(), right.startAt.getTime());
  const end = Math.min(left.endAt.getTime(), right.endAt.getTime());
  if (end <= start) return 0;
  return (end - start) / 3_600_000;
}

/** Hours of a booking that fall on a single calendar day in `timeZone`. */
export function hoursOnBusinessDate(
  booking: Interval & { plannedHours?: string | number | null },
  day: string,
  timeZone: string,
): number {
  const dayStart = startOfDayInTimeZone(day, timeZone);
  const dayEnd = startOfDayInTimeZone(addDays(businessDate(day), 1), timeZone);
  const dayInterval: Interval = { startAt: dayStart, endAt: dayEnd };
  if (!instantsOverlap(booking, dayInterval)) return 0;

  const totalHours = hoursBetween(booking.startAt, booking.endAt);
  const slice = overlapHours(booking, dayInterval);
  const planned = parseHours(booking.plannedHours);
  if (planned == null || totalHours <= 0) return slice;
  return planned * (slice / totalHours);
}

export function occupiedBusinessDates(
  booking: Interval,
  timeZone: string,
  cap = 31,
): BusinessDate[] {
  const from = businessDateInTimeZone(booking.startAt, timeZone);
  const lastInstant = new Date(booking.endAt.getTime() - 1);
  const to = businessDateInTimeZone(lastInstant, timeZone);
  const days: BusinessDate[] = [];
  let cursor = from;
  while (cursor <= to && days.length < cap) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
