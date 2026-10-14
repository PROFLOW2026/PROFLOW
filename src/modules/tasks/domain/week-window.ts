import { addDays, type BusinessDate } from '@/shared/dates';

/**
 * Upper bound for My Work "this week" and Insights "due this week" (through upcoming Sunday).
 */
export function upcomingSundayFrom(today: BusinessDate): BusinessDate {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysUntilSunday = weekday === 0 ? 7 : 7 - weekday;
  return addDays(today, daysUntilSunday);
}

export function resolveThisWeekDueRange(today: BusinessDate): { from: BusinessDate; to: BusinessDate } {
  return { from: today, to: upcomingSundayFrom(today) };
}
