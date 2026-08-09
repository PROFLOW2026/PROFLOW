import * as React from 'react';
import { shouldForceLtrInput } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export const inputClassName = cn(
  'block w-full rounded-md border bg-[var(--pf-bg-surface)] px-3 py-2 text-sm text-start',
  'border-[var(--pf-border-strong)] text-[var(--pf-text-primary)]',
  'placeholder:text-[var(--pf-text-muted)]',
  'transition-colors duration-[var(--pf-motion-fast)]',
  'focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]',
  'disabled:cursor-not-allowed disabled:bg-[var(--pf-bg-muted)] disabled:text-[var(--pf-text-disabled)]',
  'aria-[invalid=true]:border-[var(--pf-action-danger)]',
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Numeric fields use tabular figures and stay LTR inside a Hebrew form. */
  numeric?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, numeric, type = 'text', dir, ...props },
  ref,
) {
  const resolvedDir = dir ?? (shouldForceLtrInput(type, dir) || numeric ? 'ltr' : undefined);

  return (
    <input
      ref={ref}
      type={type}
      dir={resolvedDir}
      className={cn(
        inputClassName,
        (numeric || resolvedDir === 'ltr') && 'pf-ltr-island',
        numeric && 'pf-numeric',
        className,
      )}
      {...props}
    />
  );
});
