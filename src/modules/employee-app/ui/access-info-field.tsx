'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Username / PIN — full digits visible, copy button stays adjacent. */
export const ACCESS_CREDENTIAL_VALUE_CLASS =
  'shrink-0 overflow-visible whitespace-nowrap font-mono tabular-nums';

/** Long text (links, names) — use full row width with wrapping. */
export const ACCESS_INFO_WRAP_VALUE_CLASS = 'min-w-0 flex-1 break-words font-normal';

/** Compact inline inset so credential labels/values do not hug the container edge. */
export const ACCESS_CREDENTIALS_INSET_CLASS = 'w-full min-w-0';

interface AccessInfoFieldProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly actions?: ReactNode;
  readonly valueDir?: 'ltr' | 'rtl' | 'auto';
  readonly valueClassName?: string;
  readonly className?: string;
}

export function AccessInfoField({
  label,
  value,
  hint,
  actions,
  valueDir = 'auto',
  valueClassName,
  className,
}: AccessInfoFieldProps) {
  const wrapValue =
    valueClassName?.includes('break-words') ||
    valueClassName?.includes(ACCESS_INFO_WRAP_VALUE_CLASS) ||
    !valueClassName?.includes('whitespace-nowrap');

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      <div className="flex w-full min-w-0 items-start justify-start gap-2">
        <span
          className={cn(
            'text-sm font-semibold text-[var(--pf-text-primary)]',
            wrapValue ? ACCESS_INFO_WRAP_VALUE_CLASS : null,
            valueClassName,
          )}
          dir={valueDir}
        >
          {value}
        </span>
        {actions ? <div className="shrink-0 self-center">{actions}</div> : null}
      </div>
      {hint ? <span className="text-xs text-[var(--pf-text-secondary)]">{hint}</span> : null}
    </div>
  );
}
