'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';

export interface MoneyInputProps extends Omit<InputProps, 'type' | 'numeric' | 'onChange' | 'value'> {
  value: string;
  /** Receives the raw decimal string; never a parsed float (doc 04). */
  onValueChange: (value: string) => void;
  currencySymbol?: string;
}

const ALLOWED = /^[0-9]*[.,]?[0-9]*$/;

/**
 * Money entry keeps the user's text as a decimal string all the way to the
 * server. Parsing to a JS number here is exactly how float drift enters
 * persisted amounts, so the field never does it.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, currencySymbol, className, ...props },
  ref,
) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.trim();
    if (next === '' || ALLOWED.test(next)) {
      onValueChange(next.replace(',', '.'));
    }
  }

  return (
    <div className="relative">
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
        value={value}
        onChange={handleChange}
        className={cn(currencySymbol && 'ps-8', className)}
        {...props}
      />
    </div>
  );
});
