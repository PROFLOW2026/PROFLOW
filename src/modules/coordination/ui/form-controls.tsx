'use client';

import type { ReactNode } from 'react';
import { inputClassName } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';

/** Small labelled-control helpers shared by the coordination forms (native controls, mobile friendly). */

export function FormRow({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--pf-text-primary)]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-[var(--pf-action-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const selectClassName = cn(inputClassName, 'h-11 appearance-auto');

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] px-3 py-2 text-sm text-[var(--pf-status-danger-fg)]"
    >
      {message}
    </p>
  );
}
