'use client';

import { useLocale } from 'next-intl';
import * as React from 'react';
import { formatMoney, type FormatMoneyOptions } from '@/shared/money/format';
import { isNegativeMoney, isPositiveMoney, type MoneyValue } from '@/shared/money/money';
import { cn } from '@/shared/ui/cn';

export interface MoneyTextProps extends FormatMoneyOptions {
  value: MoneyValue;
  /** Renders negatives in the danger tone. The sign is always present too. */
  colorizeNegative?: boolean;
  /** Profit, loss, and cash difference: green when positive, red when negative, plain at zero. */
  colorizeResult?: boolean;
  className?: string;
}

/**
 * The single way money reaches the screen. Rendering money through this
 * component keeps the formatting rules from doc 58 in one place: tabular
 * figures, an LTR isolate so the amount reads correctly inside Hebrew text,
 * and a textual sign so profit and loss never rely on colour.
 */
export function MoneyText({
  value,
  colorizeNegative = false,
  colorizeResult = false,
  className,
  ...options
}: MoneyTextProps) {
  const locale = useLocale();
  const formatted = formatMoney(value, locale, options);
  const negative = isNegativeMoney(value);
  const positive = isPositiveMoney(value);

  return (
    <span
      dir="ltr"
      className={cn(
        'pf-numeric inline-block max-w-full',
        colorizeResult && positive && 'text-[var(--pf-status-success-fg)]',
        (colorizeResult || colorizeNegative) && negative && 'text-[var(--pf-status-danger-fg)]',
        className,
      )}
    >
      {formatted}
    </span>
  );
}
