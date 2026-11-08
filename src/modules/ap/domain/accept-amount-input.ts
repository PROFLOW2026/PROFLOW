import Decimal from 'decimal.js';
import { displayScaleFor, money, roundMoney } from '@/shared/money/money';

/**
 * AP amount entry stays on the currency display scale (two decimals for ILS).
 * Extra fraction digits are stored through roundMoney, the same half-up scale
 * formatMoney uses, so the field shows the digits that are kept.
 * Incomplete typing is left unchanged.
 */
export function acceptApAmountInput(raw: string, currency: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return raw;
  const fraction = /^[+-]?\d+\.(\d+)$/.exec(trimmed)?.[1];
  if (!fraction || fraction.length <= displayScaleFor(currency)) return raw;
  return amountAtDisplayScale(trimmed, currency);
}

/** Seed a stored numeric amount into an AP field at the display scale. */
export function seedApAmountInput(stored: string | null | undefined, currency: string): string {
  const trimmed = stored?.trim() ?? '';
  if (trimmed === '') return '';
  try {
    return amountAtDisplayScale(trimmed, currency);
  } catch {
    return trimmed;
  }
}

function amountAtDisplayScale(raw: string, currency: string): string {
  const scale = displayScaleFor(currency);
  const rounded = roundMoney(money(raw, currency), scale);
  return new Decimal(rounded.amount).toFixed(scale);
}
