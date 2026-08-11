import { ValidationError } from '@/shared/errors';

const YEAR_MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value);
}

export function assertYearMonth(value: string): string {
  const trimmed = value.trim();
  if (!isYearMonth(trimmed)) {
    throw new ValidationError(
      [{ path: 'yearMonth', message: 'Expected YYYY-MM' }],
      'Invalid year-month',
    );
  }
  return trimmed;
}

/** Inclusive calendar bounds for a YYYY-MM period (UTC date strings). */
export function yearMonthBounds(yearMonth: string): { startDate: string; endDate: string } {
  const ym = assertYearMonth(yearMonth);
  const [yearPart, monthPart] = ym.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDay = String(lastDay).padStart(2, '0');
  return {
    startDate: `${ym}-01`,
    endDate: `${ym}-${endDay}`,
  };
}

/**
 * Derive YYYY-MM from a business date (YYYY-MM-DD) for month-close freeze checks.
 */
export function yearMonthFromBusinessDate(date: string): string {
  const trimmed = date.trim();
  if (trimmed.length < 7) {
    throw new ValidationError(
      [{ path: 'date', message: 'Expected YYYY-MM-DD business date' }],
      'Invalid business date',
    );
  }
  return assertYearMonth(trimmed.slice(0, 7));
}

/** Current calendar month in the given IANA timezone (fallback UTC). */
export function currentYearMonth(timeZone = 'UTC'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (year && month) return `${year}-${month}`;
  } catch {
    // fall through
  }
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}
