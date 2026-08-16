/**
 * Date primitives (doc 71 §8).
 *
 * Two distinct concepts, deliberately not interchangeable:
 *  - BusinessDate - a calendar day with no time zone (expense date, due date,
 *    rate effective date). Stored in Postgres `date`.
 *  - Instant - an exact moment. Stored in Postgres `timestamptz` as UTC.
 *
 * The organisation time zone only affects *display* and "what day is it for
 * this business right now"; it never rewrites a stored instant.
 */

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD`, time-zone free. */
export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateError';
  }
}

export function isBusinessDate(value: unknown): value is BusinessDate {
  if (typeof value !== 'string' || !BUSINESS_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

export function businessDate(value: string | Date): BusinessDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DateError('Invalid Date instance');
    const iso = value.toISOString().slice(0, 10);
    return iso as BusinessDate;
  }
  const trimmed = value.trim();
  if (!isBusinessDate(trimmed)) throw new DateError(`Invalid business date: "${value}" (expected YYYY-MM-DD)`);
  return trimmed;
}

/** Today in the organisation's time zone, not the server's. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): BusinessDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return businessDate(parts);
}

export function compareBusinessDates(left: BusinessDate, right: BusinessDate): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isBefore(left: BusinessDate, right: BusinessDate): boolean {
  return left < right;
}

export function isAfter(left: BusinessDate, right: BusinessDate): boolean {
  return left > right;
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day + days));
  return businessDate(probe);
}

export function daysBetween(from: BusinessDate, to: BusinessDate): number {
  const parse = (value: BusinessDate) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export function startOfMonth(date: BusinessDate): BusinessDate {
  return `${date.slice(0, 7)}-01` as BusinessDate;
}

export function endOfMonth(date: BusinessDate): BusinessDate {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return businessDate(new Date(Date.UTC(year, month, 0)));
}

/** Calendar months forward/back; day-of-month is clamped to the target month length. */
export function addMonths(date: BusinessDate, months: number): BusinessDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const lastDay = endOfMonth(businessDate(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`));
  const lastDayNum = Number(lastDay.slice(8, 10));
  const clampedDay = Math.min(day, lastDayNum);
  return businessDate(
    `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`,
  );
}

export function maxBusinessDate(left: BusinessDate, right: BusinessDate): BusinessDate {
  return left >= right ? left : right;
}

export function minBusinessDate(left: BusinessDate, right: BusinessDate): BusinessDate {
  return left <= right ? left : right;
}

/**
 * Effective-dated range check used by rate versions and tax rules (docs 06, 11).
 * `validFrom` is inclusive, `validTo` is inclusive, and a null `validTo` means
 * "still in force".
 */
export interface EffectiveRange {
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate | null;
}

export function isEffectiveOn(range: EffectiveRange, on: BusinessDate): boolean {
  if (on < range.validFrom) return false;
  if (range.validTo !== null && on > range.validTo) return false;
  return true;
}

export function rangesOverlap(left: EffectiveRange, right: EffectiveRange): boolean {
  const leftEnd = left.validTo ?? '9999-12-31';
  const rightEnd = right.validTo ?? '9999-12-31';
  return left.validFrom <= rightEnd && right.validFrom <= leftEnd;
}

/**
 * Picks the version in force on a given day. Callers rely on this rather than
 * "latest row" so historical costs stay stable after a new rate is added.
 */
export function selectEffective<T extends EffectiveRange>(versions: readonly T[], on: BusinessDate): T | null {
  let selected: T | null = null;
  for (const version of versions) {
    if (!isEffectiveOn(version, on)) continue;
    if (selected === null || version.validFrom > selected.validFrom) selected = version;
  }
  return selected;
}

export function nowUtc(): Date {
  return new Date();
}

export function toIsoInstant(value: Date): string {
  return value.toISOString();
}
