import { displayScaleFor, isNegativeMoney, isZeroMoney, toDecimalValue, type MoneyValue } from './money';

/**
 * Locale-aware money presentation (doc 58 §4).
 *
 * Signs are rendered as text so profit/loss never depends on colour alone,
 * and the true minus sign (U+2212) is used instead of a hyphen.
 */

const MINUS_SIGN = '\u2212';
const PLUS_SIGN = '+';

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

function resolveFractionDigits(value: MoneyValue, mode: MoneyDecimalsMode): number {
  const scale = displayScaleFor(value.currency);
  if (mode === 'whole') return 0;
  if (mode === 'minor-units') return scale;
  return toDecimalValue(value).decimalPlaces() === 0 ? 0 : scale;
}

export function formatMoney(value: MoneyValue, locale: string, options: FormatMoneyOptions = {}): string {
  const { decimals = 'minor-units', compact = false, signDisplay = 'auto', currencyDisplay = 'narrowSymbol' } = options;

  const fractionDigits = resolveFractionDigits(value, decimals);
  const decimal = toDecimalValue(value);

  const formatted = getFormatter(locale, {
    style: 'currency',
    currency: value.currency,
    currencyDisplay,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : fractionDigits,
    maximumFractionDigits: compact ? 1 : fractionDigits,
    signDisplay: 'never',
  }).format(Math.abs(decimal.toNumber()));

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
