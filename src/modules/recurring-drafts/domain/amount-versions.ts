/**
 * Pure amount effective-dating + retro month listing for recurring drafts.
 * Past months keep historical amounts via version windows; payload is fallback.
 */

import { DomainRuleError, ValidationError } from '@/shared/errors';

const YEAR_MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AmountVersionWindow {
  readonly amount: string;
  readonly currency: string;
  /** Inclusive YYYY-MM-DD */
  readonly validFrom: string;
  /** Inclusive YYYY-MM-DD; null = open-ended */
  readonly validTo: string | null;
}

export interface ResolvedDraftAmount {
  readonly amount: string;
  readonly currency: string;
  readonly source: 'version' | 'payload_fallback';
}

export function assertYearMonth(value: string): string {
  const trimmed = value.trim();
  if (!YEAR_MONTH_RE.test(trimmed)) {
    throw new ValidationError(
      [{ path: 'yearMonth', message: 'Expected YYYY-MM' }],
      'Invalid year-month',
    );
  }
  return trimmed;
}

export function yearMonthFromBusinessDate(date: string): string {
  const trimmed = date.trim();
  if (!BUSINESS_DATE_RE.test(trimmed)) {
    throw new ValidationError(
      [{ path: 'date', message: 'Expected YYYY-MM-DD' }],
      'Invalid business date',
    );
  }
  return assertYearMonth(trimmed.slice(0, 7));
}

/** First calendar day of YYYY-MM as a business date. */
export function firstBusinessDateOfYearMonth(yearMonth: string): string {
  const ym = assertYearMonth(yearMonth);
  return `${ym}-01`;
}

/**
 * Inclusive list of YYYY-MM values from `fromYearMonth` through `toYearMonth`.
 * Used by retro backfill so each month gets its own occurrence (not dumped into current).
 */
export function listYearMonthsInclusive(fromYearMonth: string, toYearMonth: string): string[] {
  const from = assertYearMonth(fromYearMonth);
  const to = assertYearMonth(toYearMonth);
  if (from > to) {
    throw new ValidationError(
      [{ path: 'toYearMonth', message: 'toYearMonth must be on or after fromYearMonth' }],
      'Invalid year-month range',
    );
  }

  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 240) {
      throw new DomainRuleError(
        'Year-month range too large',
        'recurringDrafts.errors.historyRangeTooLarge',
      );
    }
  }
  return months;
}

/**
 * Resolve the amount that applies on `asOfDate` (YYYY-MM-DD).
 * Prefers the matching version with the latest validFrom when windows overlap.
 * Falls back to payload amount/currency when no version covers the date.
 */
export function resolveAmountForDate(
  versions: readonly AmountVersionWindow[],
  asOfDate: string,
  fallback: { readonly amount: string; readonly currency: string },
): ResolvedDraftAmount {
  const date = asOfDate.trim();
  if (!BUSINESS_DATE_RE.test(date)) {
    throw new ValidationError(
      [{ path: 'asOfDate', message: 'Expected YYYY-MM-DD' }],
      'Invalid as-of date',
    );
  }

  const matches = versions.filter((version) => {
    if (version.validFrom > date) return false;
    if (version.validTo != null && version.validTo < date) return false;
    return true;
  });

  if (matches.length === 0) {
    return {
      amount: fallback.amount,
      currency: fallback.currency.toUpperCase(),
      source: 'payload_fallback',
    };
  }

  const chosen = [...matches].sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom < b.validFrom ? 1 : -1;
    // Prefer open-ended when validFrom ties.
    if (a.validTo == null && b.validTo != null) return -1;
    if (a.validTo != null && b.validTo == null) return 1;
    return 0;
  })[0]!;

  return {
    amount: chosen.amount,
    currency: chosen.currency.toUpperCase(),
    source: 'version',
  };
}

/** Day before `date` (YYYY-MM-DD), or the same date when already epoch-like. */
export function dayBeforeBusinessDate(date: string): string {
  const trimmed = date.trim();
  if (!BUSINESS_DATE_RE.test(trimmed)) {
    throw new ValidationError(
      [{ path: 'date', message: 'Expected YYYY-MM-DD' }],
      'Invalid business date',
    );
  }
  const [y, m, d] = trimmed.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
