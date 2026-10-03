/** Calendar-date helpers for date-keyed field records (YYYY-MM-DD, no time zone). */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function shiftIsoDate(value: string, days: number): string {
  if (!isIsoDate(value)) throw new Error(`Invalid ISO date: ${value}`);
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `to` going back `count` days (newest first). */
export function dateWindowDescending(to: string, count: number): string[] {
  const result: string[] = [];
  for (let offset = 0; offset < count; offset += 1) result.push(shiftIsoDate(to, -offset));
  return result;
}
