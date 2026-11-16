import { addDays, businessDate } from '@/shared/dates';

const JERUSALEM = 'Asia/Jerusalem';

/** Calendar YYYY-MM-DD for an instant in Asia/Jerusalem (not server local / not UTC slice). */
function jerusalemCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Demo fixture dates relative to the session anchor: offset 0 is the Jerusalem
 * calendar day of `anchor`, regardless of server timezone or UTC midnight edges.
 */
export function demoDay(anchor: Date, daysFromSession: number): string {
  const sessionDay = businessDate(jerusalemCalendarDay(anchor));
  return addDays(sessionDay, daysFromSession);
}

export function demoDays(anchor: Date, offsets: readonly number[]): string[] {
  return offsets.map((offset) => demoDay(anchor, offset));
}