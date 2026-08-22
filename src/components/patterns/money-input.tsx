'use client';

import * as React from 'react';
import Decimal from 'decimal.js';
import { Input, type InputProps } from '@/components/ui/input';
import { displayScaleFor, MONEY_STORAGE_SCALE } from '@/shared/money';
import { cn } from '@/shared/ui/cn';

export interface MoneyInputProps extends Omit<InputProps, 'type' | 'numeric' | 'onChange' | 'value'> {
  value: string;
  /** Receives the raw decimal string; never a parsed float (doc 04). */
  onValueChange: (value: string) => void;
  currencySymbol?: string;
  /** ISO currency used to round storage-scale amounts to minor units (e.g. 2 for ILS). */
  currency?: string;
}

/**
 * Normalize typed money text:
 * - Commas are thousands separators (so 52,000 → 52000), never a decimal.
 * - Period is the only decimal separator.
 */
export function normalizeMoneyInputText(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (!/^[0-9.,]*$/.test(trimmed)) return null;
  const withoutThousands = trimmed.replace(/,/g, '');
  if (!/^[0-9]*\.?[0-9]*$/.test(withoutThousands)) return null;
  return withoutThousands;
}

/**
 * Present stored `numeric(18,6)` amounts for customer-facing inputs.
 * Exact storage-scale strings are rounded to the currency display scale via
 * decimal.js (never IEEE-754), then trailing zeros are trimmed.
 * Also rounds any excess fractional precision beyond the display scale when
 * a currency is provided (VAT division leakage such as `547.457627`).
 * In-progress typing (trailing `.` or short fractions while editing) is left untouched.
 *
 * `52000.000000` → `52000`, `52.500000` → `52.5`, `547.457627` + ILS → `547.46`
 */
export function formatMoneyAmountForInput(raw: string, currency?: string): string {
  const trimmed = raw.trim();
  const storageMatch = new RegExp(`^(-?)(\\d+)\\.(\\d{${MONEY_STORAGE_SCALE}})$`).exec(trimmed);
  if (storageMatch) {
    const [, sign = '', integer = '', fraction = ''] = storageMatch;
    const scale = currency ? displayScaleFor(currency) : 2;
    return roundDecimalStringForInput(`${sign}${integer}.${fraction}`, scale);
  }

  if (currency) {
    const excess = /^(-?)(\d+)\.(\d+)$/.exec(trimmed);
    if (excess) {
      const [, sign = '', integer = '', fraction = ''] = excess;
      const scale = displayScaleFor(currency);
      if (fraction.length > scale) {
        return roundDecimalStringForInput(`${sign}${integer}.${fraction}`, scale);
      }
    }
  }

  return raw;
}

function roundDecimalStringForInput(value: string, scale: number): string {
  const rounded = new Decimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const asFixed = rounded.toFixed(scale);
  const negative = asFixed.startsWith('-');
  const [intPart = '0', fracPart = ''] = asFixed.replace(/^-/, '').split('.');
  const significantFraction = fracPart.replace(/0+$/, '');
  const body = significantFraction ? `${intPart}.${significantFraction}` : intPart;
  return negative ? `-${body}` : body;
}

/**
 * Money entry keeps the user's text as a decimal string all the way to the
 * server. Parsing to a JS number here is exactly how float drift enters
 * persisted amounts, so the field never does it.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, currencySymbol, currency, className, ...props },
  ref,
) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const normalized = normalizeMoneyInputText(event.target.value);
    if (normalized !== null) {
      onValueChange(normalized);
    }
  }

  // Whole control is an LTR island so the currency glyph and inline-start
  // padding share one direction (avoids RTL start + LTR input mismatch).
  return (
    <div className="relative pf-ltr-island" dir="ltr">
      {currencySymbol ? (
        <span
          className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-[var(--pf-text-muted)]"
          aria-hidden
        >
          {currencySymbol}
        </span>
      ) : null}
      <Input
        ref={ref}
        numeric
        inputMode="decimal"
        autoComplete="off"
        value={formatMoneyAmountForInput(value, currency)}
        onChange={handleChange}
        className={cn(currencySymbol && 'ps-8', className)}
        {...props}
      />
    </div>
  );
});
