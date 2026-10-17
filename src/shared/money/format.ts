import Decimal from 'decimal.js';
import { DEFAULT_LOCALE } from '@/shared/i18n/config';
import { isHebrewLocale, resolveIntlLocale } from '@/shared/i18n/intl-locale';
import {
  displayScaleFor,
  fromNumericString,
  isNegativeMoney,
  isZeroMoney,
  toDecimalValue,
  type MoneyValue,
} from './money';

/**
 * Locale-aware money presentation (doc 58 §4).
 *
 * Signs are rendered as text so profit/loss never depends on colour alone,
 * and the true minus sign (U+2212) is used instead of a hyphen.
 *
 * he-IL business amounts render as `52,000.00 ₪` (symbol after, always the
 * currency fraction digits — two for ILS), assembled from `formatToParts` so
 * bidi marks cannot flip the glyph inside an LTR isolate.
 * Storage stays at numeric(18,6). `whole` is the only display opt-out, for a
 * non-decimal counter. `auto` matches the display scale and does not hide `.00`.
 */

const MINUS_SIGN = '\u2212';
const PLUS_SIGN = '+';
/** LRM / RLM / isolates / embeddings that Intl may inject into currency strings. */
const BIDI_MARKS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export type MoneyDecimalsMode = 'minor-units' | 'whole' | 'auto';

export interface FormatMoneyOptions {
  /**
   * Display default is the currency scale (`minor-units` / `auto`: always two
   * fraction digits for ILS, including whole amounts). `whole` is the explicit
   * opt-out for a non-decimal counter.
   */
  decimals?: MoneyDecimalsMode;
  /** Prefix positive values with `+`; negatives always keep their sign. */
  signDisplay?: 'auto' | 'always' | 'never';
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function stripBidiMarks(value: string): string {
  return value.replace(BIDI_MARKS, '');
}

function resolveFractionDigits(currency: MoneyValue['currency'], mode: MoneyDecimalsMode): number {
  if (mode === 'whole') return 0;
  return displayScaleFor(currency);
}

/**
 * Build a bidi-safe currency string from Intl parts.
 * Hebrew ProjectFlow presentation: `52,000 ₪` (amount, space, symbol).
 */
function formatCurrencyFromParts(
  locale: string,
  absoluteAmount: number,
  intlOptions: Intl.NumberFormatOptions,
): string {
  const parts = getFormatter(locale, intlOptions).formatToParts(absoluteAmount);
  const currency = stripBidiMarks(parts.find((part) => part.type === 'currency')?.value ?? '').trim();
  const amount = parts
    .filter((part) =>
      part.type === 'integer' ||
      part.type === 'group' ||
      part.type === 'decimal' ||
      part.type === 'fraction',
    )
    .map((part) => part.value)
    .join('');

  if (isHebrewLocale(locale) && currency) {
    return `${amount} ${currency}`;
  }

  return stripBidiMarks(
    parts
      .map((part) => part.value)
      .join('')
      .replace(/\u00A0/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatMoney(value: MoneyValue, locale: string, options: FormatMoneyOptions = {}): string {
  const { decimals = 'minor-units', signDisplay = 'auto', currencyDisplay = 'narrowSymbol' } = options;
  const intlLocale = resolveIntlLocale(locale);

  const fractionDigits = resolveFractionDigits(value.currency, decimals);
  const decimal = toDecimalValue(value);

  const formatted = formatCurrencyFromParts(intlLocale, Math.abs(decimal.toNumber()), {
    style: 'currency',
    currency: value.currency,
    currencyDisplay,
    notation: 'standard',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: 'never',
  });

  if (isZeroMoney(value)) return formatted;
  if (isNegativeMoney(value)) return `${MINUS_SIGN}${formatted}`;
  if (signDisplay === 'always') return `${PLUS_SIGN}${formatted}`;
  return formatted;
}

/** Always shows an explicit sign - for deltas such as approved additions/reductions. */
export function formatMoneyDelta(value: MoneyValue, locale: string, options: FormatMoneyOptions = {}): string {
  return formatMoney(value, locale, { ...options, signDisplay: 'always' });
}

export function formatNumber(value: number | string, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return getFormatter(resolveIntlLocale(locale), { notation: 'standard', ...options }).format(Number(value));
}

export function formatPercent(
  value: number | string,
  locale: string,
  options: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
    signDisplay?: Intl.NumberFormatOptions['signDisplay'];
  } = {},
): string {
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? maximumFractionDigits;
  const signDisplay = options.signDisplay ?? 'auto';
  const rounded = new Decimal(value).toDecimalPlaces(maximumFractionDigits, Decimal.ROUND_HALF_UP);
  return getFormatter(resolveIntlLocale(locale), {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  }).format(rounded.div(100).toNumber());
}

/**
 * Digits are a left-to-right island inside Hebrew sentences; wrapping them in
 * an isolate stops the surrounding RTL run from reordering the characters.
 */
export function bidiIsolate(text: string): string {
  return `\u2066${text}\u2069`;
}

/** Server-side display helper — always 2 decimal places (presentation only). */
export function formatMoneyDisplay(value: MoneyValue, locale: string = DEFAULT_LOCALE): string {
  return formatMoney(value, locale, { decimals: 'minor-units' });
}

/**
 * Format a raw DB numeric string (or JSON-decoded number) for UI copy.
 * Presentation only — never changes stored precision.
 */
export function formatMoneyString(
  amount: string | number | null | undefined,
  currency: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const parsed = fromNumericString(amount, currency);
  return parsed ? formatMoneyDisplay(parsed, locale) : `${amount ?? '0'} ${currency}`;
}
