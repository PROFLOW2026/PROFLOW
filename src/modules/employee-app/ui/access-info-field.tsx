'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

interface AccessInfoFieldProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly actions?: ReactNode;
  readonly valueDir?: 'ltr' | 'rtl' | 'auto';
  readonly className?: string;
}

export function AccessInfoField({
  label,
  value,
  hint,
  actions,
  valueDir = 'auto',
  className,
}: AccessInfoFieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-[var(--pf-text-primary)]" dir={valueDir}>
          {value}
        </span>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {hint ? <span className="text-xs text-[var(--pf-text-secondary)]">{hint}</span> : null}
    </div>
  );
}
