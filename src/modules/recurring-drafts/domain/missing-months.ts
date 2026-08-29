/**
 * Retro / backfill month helpers for monthly recurring expense templates.
 */

import { businessDate, startOfMonth, type BusinessDate } from '@/shared/dates';
import {
  firstBusinessDateOfYearMonth,
  listYearMonthsInclusive,
  yearMonthFromBusinessDate,
} from './amount-versions';
import { advanceDraftRunDate } from './schedule';
import type { DraftFrequency } from './types';

export interface RetroMonthRange {
  readonly fromYearMonth: string;
  readonly toYearMonth: string;
  readonly months: readonly string[];
  readonly count: number;
}

/** Inclusive YYYY-MM range from template start through `throughDate` (month-grain). */
export function retroMonthRangeFromStart(
  startDate: string,
  throughDate: string,
  endDate: string | null = null,
): RetroMonthRange | null {
  const fromYearMonth = yearMonthFromBusinessDate(startOfMonth(businessDate(startDate)));
  let toYearMonth = yearMonthFromBusinessDate(startOfMonth(businessDate(throughDate)));
  if (endDate) {
    const endYm = yearMonthFromBusinessDate(startOfMonth(businessDate(endDate)));
    if (endYm < toYearMonth) toYearMonth = endYm;
  }
  if (fromYearMonth > toYearMonth) return null;
  const months = listYearMonthsInclusive(fromYearMonth, toYearMonth);
  return { fromYearMonth, toYearMonth, months, count: months.length };
}

export function listMissingOccurrenceMonths(
  expectedMonths: readonly string[],
  existingYearMonths: readonly (string | null | undefined)[],
): string[] {
  const existing = new Set(
    existingYearMonths.filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  return expectedMonths.filter((month) => !existing.has(month));
}

export function missingMonthRange(
  expectedMonths: readonly string[],
  existingYearMonths: readonly (string | null | undefined)[],
): RetroMonthRange | null {
  const missing = listMissingOccurrenceMonths(expectedMonths, existingYearMonths);
  if (missing.length === 0) return null;
  return {
    fromYearMonth: missing[0]!,
    toYearMonth: missing[missing.length - 1]!,
    months: missing,
    count: missing.length,
  };
}

/** Next schedule date after retro through `lastYearMonth`. */
export function nextRunDateAfterRetro(
  lastYearMonth: string,
  templateStartDate: string,
  frequency: DraftFrequency,
  intervalCount: number,
): BusinessDate {
  const runDate = businessDate(firstBusinessDateOfYearMonth(lastYearMonth));
  const advanced = advanceDraftRunDate(runDate, frequency, intervalCount);
  const day = templateStartDate.slice(8, 10);
  return businessDate(`${advanced.slice(0, 7)}-${day}`);
}
