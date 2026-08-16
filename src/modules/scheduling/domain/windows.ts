/**
 * Org-timezone window math for the scheduling board.
 * Framework-free - unit-tested without DB.
 */

import { addDays, businessDate, type BusinessDate } from '@/shared/dates';

/**
 * Start of a calendar day in `timeZone`, as a UTC instant.
 * Iterative correction (same approach as dispatch) - not a full TZ library.
 */
export function startOfDayInTimeZone(date: string, timeZone: string): Date {
  const day = businessDate(date);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const localY = Number(get('year'));
    const localM = Number(get('month'));
    const localD = Number(get('day'));
    const localH = Number(get('hour'));
    const localMin = Number(get('minute'));
    const dayDeltaMs = Date.UTC(y, m - 1, d) - Date.UTC(localY, localM - 1, localD);
    const timeOfDayMs = (localH * 60 + localMin) * 60_000;
    guess = guess + dayDeltaMs - timeOfDayMs;
  }
  return new Date(guess);
}

export function businessDateInTimeZone(instant: Date, timeZone: string): BusinessDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return businessDate(parts);
}

/** Inclusive `from`/`to` calendar days as a half-open instant window. */
export function instantWindowForDates(
  from: string,
  to: string,
  timeZone: string,
): { start: Date; endExclusive: Date } {
  return {
    start: startOfDayInTimeZone(from, timeZone),
    endExclusive: startOfDayInTimeZone(addDays(businessDate(to), 1), timeZone),
  };
}

export function enumerateBusinessDates(from: string, to: string, maxDays = 31): BusinessDate[] {
  const start = businessDate(from);
  const end = businessDate(to);
  if (start > end) return [];
  const days: BusinessDate[] = [];
  let cursor = start;
  while (cursor <= end && days.length < maxDays) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Sunday-start week (typical Israeli calendar). */
export function startOfWeekSunday(date: string): BusinessDate {
  const day = businessDate(date);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -weekday);
}

export function endOfWeekSunday(date: string): BusinessDate {
  return addDays(startOfWeekSunday(date), 6);
}
