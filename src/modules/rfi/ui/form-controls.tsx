'use client';

import { ContextualInfo } from '@/components/ui/contextual-info';
import { cn } from '@/shared/ui/cn';

export function selectClassName() {
  return 'mt-1 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-primary)] px-3 py-2 text-sm';
}

export function FormRow({
  label,
  children,
  hint,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  /** Help copy — shown in info dialog, not inline. */
  hint?: string;
  error?: string | null;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm text-[var(--pf-text-primary)]', className)}>
      <span className="inline-flex items-center gap-1 font-medium">
        {label}
        {hint ? <ContextualInfo dialogTitle={label} content={hint} size="sm" /> : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-[var(--pf-action-danger)]">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-[var(--pf-danger-border)] bg-[var(--pf-danger-bg)] px-3 py-2 text-sm text-[var(--pf-danger-text)]">
      {message}
    </p>
  );
}
