import { addDays, businessDate, compareBusinessDates, daysBetween, type BusinessDate } from '@/shared/dates';

/** JS weekday: 0 = Sunday … 6 = Saturday (UTC calendar day). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ALL_WEEKDAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Canonical ProjectFlow work week: Sunday–Thursday (א׳–ה׳).
 * JS/UTC weekday indexes: 0=Sun … 4=Thu. Friday/Saturday excluded.
 */
export const WEEKDAY_WORKDAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4];

/** @deprecated Alias — use WEEKDAY_WORKDAYS (canonical א׳–ה׳). */
export const DEFAULT_WORK_WEEKDAYS = WEEKDAY_WORKDAYS;

export interface BulkDayHours {
  readonly workDate: string;
  readonly hours: string;
}

const MAX_BULK_SPAN_DAYS = 62;

function weekdayOf(date: BusinessDate): WeekdayIndex {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as WeekdayIndex;
}

/**
 * Expand a from→to range into concrete work dates with hours.
 * - `weekdays` filters which calendar days are included (default: all).
 * - `dayHours` optionally overrides hours for specific dates (must fall in range + filter).
 * - When `dayHours` is provided and non-empty without a shared `hours`, only listed days are kept.
 */
export function expandBulkWorkDates(input: {
  readonly fromDate: string;
  readonly toDate: string;
  readonly hours?: string;
  readonly weekdays?: readonly number[];
  readonly dayHours?: readonly { workDate: string; hours: string }[];
}): BulkDayHours[] {
  const from = businessDate(input.fromDate);
  const to = businessDate(input.toDate);
  if (compareBusinessDates(from, to) > 0) {
    throw new Error('fromDate must be on or before toDate');
  }

  const span = daysBetween(from, to);
  if (span > MAX_BULK_SPAN_DAYS) {
    throw new Error(`Bulk range exceeds ${MAX_BULK_SPAN_DAYS} days`);
  }

  const weekdaySet = new Set<number>(
    (input.weekdays ?? ALL_WEEKDAYS).filter((day) => day >= 0 && day <= 6),
  );
  if (weekdaySet.size === 0) {
    throw new Error('At least one weekday must be selected');
  }

  const overrideMap = new Map<string, string>();
  for (const row of input.dayHours ?? []) {
    const date = businessDate(row.workDate);
    if (compareBusinessDates(date, from) < 0 || compareBusinessDates(date, to) > 0) continue;
    if (!weekdaySet.has(weekdayOf(date))) continue;
    overrideMap.set(date, row.hours.trim());
  }

  const useOverridesOnly = Boolean(input.dayHours?.length) && !input.hours?.trim();
  const defaultHours = input.hours?.trim() ?? '';

  const result: BulkDayHours[] = [];
  let cursor = from;
  while (compareBusinessDates(cursor, to) <= 0) {
    if (weekdaySet.has(weekdayOf(cursor))) {
      const override = overrideMap.get(cursor);
      if (override) {
        if (Number(override) > 0) {
          result.push({ workDate: cursor, hours: override });
        }
      } else if (!useOverridesOnly && defaultHours && Number(defaultHours) > 0) {
        result.push({ workDate: cursor, hours: defaultHours });
      }
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

export function previewBulkTimeEntries(input: {
  readonly fromDate: string;
  readonly toDate: string;
  readonly hours?: string;
  readonly weekdays?: readonly number[];
  readonly dayHours?: readonly { workDate: string; hours: string }[];
}): { readonly days: readonly BulkDayHours[]; readonly totalHours: string; readonly entryCount: number } {
  const days = expandBulkWorkDates(input);
  const total = days.reduce((sum, day) => sum + Number(day.hours), 0);
  return {
    days,
    totalHours: Number.isFinite(total) ? String(total) : '0',
    entryCount: days.length,
  };
}

/**
 * Expand from→to into concrete calendar dates matching selected weekdays
 * (no hours payload — used by attendance range and similar).
 */
export function expandWorkDatesInRange(input: {
  readonly fromDate: string;
  readonly toDate: string;
  readonly weekdays?: readonly number[];
}): readonly string[] {
  return expandBulkWorkDates({
    fromDate: input.fromDate,
    toDate: input.toDate,
    weekdays: input.weekdays,
    hours: '1',
  }).map((day) => day.workDate);
}
