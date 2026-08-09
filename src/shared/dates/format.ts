import type { BusinessDate } from './dates';

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatterCache.set(key, formatter);
  }
  return formatter;
}

export type DateStyle = 'short' | 'medium' | 'long';

/**
 * Business dates carry no time zone, so they are formatted in UTC to avoid the
 * classic off-by-one-day shift.
 */
export function formatBusinessDate(date: BusinessDate, locale: string, style: DateStyle = 'medium'): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const value = new Date(Date.UTC(year, month - 1, day));
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { year: '2-digit', month: '2-digit', day: '2-digit', timeZone: 'UTC' }
      : style === 'long'
        ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
        : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
  return getFormatter(locale, options).format(value);
}

/** Instants are rendered in the organisation's time zone. */
export function formatInstant(
  value: Date | string,
  locale: string,
  timeZone: string,
  options: { withTime?: boolean } = {},
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return getFormatter(locale, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(options.withTime === false ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(date);
}

export function formatDateRange(
  from: BusinessDate,
  to: BusinessDate | null,
  locale: string,
  openEndedLabel: string,
): string {
  const start = formatBusinessDate(from, locale);
  return to === null ? `${start} – ${openEndedLabel}` : `${start} – ${formatBusinessDate(to, locale)}`;
}
