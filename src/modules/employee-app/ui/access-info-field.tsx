'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Username / PIN — full digits visible, copy button stays adjacent. */
export const ACCESS_CREDENTIAL_VALUE_CLASS =
  'shrink-0 overflow-visible whitespace-nowrap font-mono tabular-nums text-clip';

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
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      <div className="flex items-center justify-start gap-1.5">
        <span
          className={cn(
            'text-sm font-semibold text-[var(--pf-text-primary)]',
            valueClassName,
          )}
          dir={valueDir}
        >
          {value}
        </span>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {hint ? <span className="text-xs text-[var(--pf-text-secondary)]">{hint}</span> : null}
    </div>
  );
}
