import { displayScaleFor, isNegativeMoney, isZeroMoney, toDecimalValue, type MoneyValue } from './money';

/**
 * Locale-aware money presentation (doc 58 §4).
 *
 * Signs are rendered as text so profit/loss never depends on colour alone,
 * and the true minus sign (U+2212) is used instead of a hyphen.
 *
 * he-IL business amounts render as `52,000 ₪` (symbol after, no bare `.00`),
 * assembled from `formatToParts` so bidi marks cannot flip the glyph inside
 * an LTR isolate.
 */

const MINUS_SIGN = '\u2212';
const PLUS_SIGN = '+';
/** LRM / RLM / isolates / embeddings that Intl may inject into currency strings. */
const BIDI_MARKS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export type MoneyDecimalsMode = 'minor-units' | 'whole' | 'auto';

export interface FormatMoneyOptions {
  /** `minor-units` = always show the currency scale, `whole` = never, `auto` = hide `.00`. */
  decimals?: MoneyDecimalsMode;
  /** Renders 310,000 as ₪310K — only for tight mobile cards, never on detail screens. */
  compact?: boolean;
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

function isHebrewLocale(locale: string): boolean {
  const base = locale.toLowerCase().split('-')[0];
  return base === 'he' || base === 'iw';
}

function stripBidiMarks(value: string): string {
  return value.replace(BIDI_MARKS, '');
}

function resolveFractionDigits(value: MoneyValue, mode: MoneyDecimalsMode): number {
  const scale = displayScaleFor(value.currency);
  if (mode === 'whole') return 0;
  if (mode === 'minor-units') return scale;
  return toDecimalValue(value).decimalPlaces() === 0 ? 0 : scale;
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
      part.type === 'fraction' ||
      part.type === 'compact',
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
  const { decimals = 'auto', compact = false, signDisplay = 'auto', currencyDisplay = 'narrowSymbol' } = options;

  const fractionDigits = resolveFractionDigits(value, decimals);
  const decimal = toDecimalValue(value);

  const formatted = formatCurrencyFromParts(locale, Math.abs(decimal.toNumber()), {
    style: 'currency',
    currency: value.currency,
    currencyDisplay,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : fractionDigits,
    maximumFractionDigits: compact ? 1 : fractionDigits,
    signDisplay: 'never',
  });

  if (isZeroMoney(value)) return formatted;
  if (isNegativeMoney(value)) return `${MINUS_SIGN}${formatted}`;
  if (signDisplay === 'always') return `${PLUS_SIGN}${formatted}`;
  return formatted;
}

/** Always shows an explicit sign — for deltas such as approved additions/reductions. */
export function formatMoneyDelta(value: MoneyValue, locale: string, options: FormatMoneyOptions = {}): string {
  return formatMoney(value, locale, { ...options, signDisplay: 'always' });
}

export function formatNumber(value: number | string, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return getFormatter(locale, options).format(Number(value));
}

export function formatPercent(
  value: number | string,
  locale: string,
  options: { maximumFractionDigits?: number; signDisplay?: Intl.NumberFormatOptions['signDisplay'] } = {},
): string {
  const { maximumFractionDigits = 1, signDisplay = 'auto' } = options;
  return getFormatter(locale, {
    style: 'percent',
    maximumFractionDigits,
    signDisplay,
  }).format(Number(value) / 100);
}

/**
 * Digits are a left-to-right island inside Hebrew sentences; wrapping them in
 * an isolate stops the surrounding RTL run from reordering the characters.
 */
export function bidiIsolate(text: string): string {
  return `\u2066${text}\u2069`;
}
