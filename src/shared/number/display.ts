import Decimal from 'decimal.js';
import { DEFAULT_LOCALE } from '@/shared/i18n/config';
import { resolveIntlLocale } from '@/shared/i18n/intl-locale';

/**
 * Read-only presentation for non-money business decimals (quantities, rates,
 * margins, retention). Always two fraction digits, grouped, half-up.
 * Does not change stored precision. Do not use this to fill an input the user
 * is still editing.
 */

const DISPLAY_FRACTION_DIGITS = 2;
const BIDI_MARKS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export function formatDecimalDisplay(
  value: string | number | Decimal | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  const decimal = parseDisplayDecimal(value);
  if (!decimal) return '';

  const rounded = decimal.toDecimalPlaces(DISPLAY_FRACTION_DIGITS, Decimal.ROUND_HALF_UP);
  const formatted = new Intl.NumberFormat(resolveIntlLocale(locale), {
    minimumFractionDigits: DISPLAY_FRACTION_DIGITS,
    maximumFractionDigits: DISPLAY_FRACTION_DIGITS,
    useGrouping: true,
    numberingSystem: 'latn',
  }).format(rounded.toNumber());

  return formatted.replace(BIDI_MARKS, '').replace(/\u00A0/g, ' ');
}

/** Percent points already stored as 5.000000 (meaning 5%), not a 0–1 ratio. */
export function formatPercentDisplay(
  value: string | number | Decimal | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  const formatted = formatDecimalDisplay(value, locale);
  return formatted ? `${formatted}%` : '';
}

function parseDisplayDecimal(
  value: string | number | Decimal | null | undefined,
): Decimal | null {
  if (value == null || value === '') return null;
  if (value instanceof Decimal) return value.isFinite() ? value : null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Decimal(value);
  }

  const trimmed = value.trim();
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) return null;
  try {
    const decimal = new Decimal(trimmed);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}
