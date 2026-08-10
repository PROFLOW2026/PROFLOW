/** Calendar-day helpers for planning (ISO `YYYY-MM-DD`, UTC noon to avoid DST edges). */

import type { IsoDate } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is IsoDate {
  return typeof value === 'string' && ISO_DATE.test(value);
}

export function parseIsoDateUtc(value: IsoDate): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function formatIsoDateUtc(date: Date): IsoDate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole calendar days between two ISO dates (end − start). */
export function calendarDaysBetween(start: IsoDate, end: IsoDate): number {
  const ms = parseIsoDateUtc(end).getTime() - parseIsoDateUtc(start).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive duration in days for a start→end span; milestones use 0. */
export function inclusiveDurationDays(
  start: IsoDate | null,
  end: IsoDate | null,
  isMilestone: boolean,
): number {
  if (isMilestone) return 0;
  if (!start || !end) return 0;
  return Math.max(1, calendarDaysBetween(start, end) + 1);
}

export function minIsoDate(dates: readonly IsoDate[]): IsoDate | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a < b ? a : b));
}

export function maxIsoDate(dates: readonly IsoDate[]): IsoDate | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

export function isEndBeforeStart(
  startDate: IsoDate | null | undefined,
  endDate: IsoDate | null | undefined,
): boolean {
  if (!startDate || !endDate) return false;
  return endDate < startDate;
}

export const DATE_ORDER_MESSAGE = 'planning.validation.endBeforeStart';
