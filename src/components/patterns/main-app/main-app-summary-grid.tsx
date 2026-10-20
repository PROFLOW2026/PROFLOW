import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

export function MainAppSummaryGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-pf-ma-summary=""
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MainAppSummaryItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 text-start">
      <div className="text-xs font-semibold text-[var(--pf-text-secondary)]">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-[var(--pf-text-primary)]">{children}</div>
    </div>
  );
}
