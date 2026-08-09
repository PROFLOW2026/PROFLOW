'use client';

import { useLocale } from 'next-intl';
import * as React from 'react';
import { formatMoney, type FormatMoneyOptions } from '@/shared/money/format';
import { isNegativeMoney, type MoneyValue } from '@/shared/money/money';
import { cn } from '@/shared/ui/cn';

export interface MoneyTextProps extends FormatMoneyOptions {
  value: MoneyValue;
  /** Renders negatives in the danger tone. The sign is always present too. */
  colorizeNegative?: boolean;
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
  className,
  ...options
}: MoneyTextProps) {
  const locale = useLocale();
  const formatted = formatMoney(value, locale, options);
  const negative = isNegativeMoney(value);

  return (
    <span
      dir="ltr"
      className={cn(
        'pf-numeric inline-block',
        colorizeNegative && negative && 'text-[var(--pf-status-danger-fg)]',
        className,
      )}
    >
      {formatted}
    </span>
  );
}
