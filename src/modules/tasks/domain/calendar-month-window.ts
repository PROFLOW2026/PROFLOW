import { addDays, businessDate, endOfMonth, startOfMonth, type BusinessDate } from '@/shared/dates';

const MONTH_KEY = /^\d{4}-\d{2}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export interface CalendarMonthDueWindow {
  readonly dueFrom: BusinessDate;
  readonly dueTo: BusinessDate;
  readonly monthKey: string;
}

/**
 * Resolves inclusive due-date bounds for the work task calendar lens.
 * Uses `dueFrom`/`dueTo` when both valid; otherwise `month=YYYY-MM`; otherwise current month (org today).
 */
export function resolveCalendarMonthDueWindow(
  params: Record<string, string | string[] | undefined>,
  today: BusinessDate,
): CalendarMonthDueWindow {
  const dueFromRaw = firstParam(params, 'dueFrom');
  const dueToRaw = firstParam(params, 'dueTo');
  if (dueFromRaw && dueToRaw && DATE_KEY.test(dueFromRaw) && DATE_KEY.test(dueToRaw)) {
    return {
      dueFrom: businessDate(dueFromRaw),
      dueTo: businessDate(dueToRaw),
      monthKey: dueFromRaw.slice(0, 7),
    };
  }

  const monthRaw = firstParam(params, 'month');
  const anchor =
    monthRaw && MONTH_KEY.test(monthRaw)
      ? businessDate(`${monthRaw}-01`)
      : businessDate(startOfMonth(today));

  return {
    dueFrom: startOfMonth(anchor),
    dueTo: endOfMonth(anchor),
    monthKey: anchor.slice(0, 7),
  };
}

/** Grid padding for month view (Sunday-start week). */
export function calendarMonthGridBounds(dueFrom: BusinessDate, dueTo: BusinessDate): {
  gridFrom: BusinessDate;
  gridTo: BusinessDate;
} {
  const gridFrom = startOfWeekSunday(dueFrom);
  const gridTo = addDays(startOfWeekSunday(addDays(dueTo, 7)), -1);
  return { gridFrom, gridTo };
}

function startOfWeekSunday(date: BusinessDate): BusinessDate {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  return addDays(date, -day);
}
