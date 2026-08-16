import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /**
   * Explains what this area is for and what happens next. Never phrased as a
   * warning or a missing-setup error - empty is a legitimate state (doc 48 §1.5).
   */
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'gap-3 px-6 py-12' : 'gap-2 px-4 py-8',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-[var(--pf-teal-50)] text-[var(--pf-teal-700)]">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <h3 className={cn('font-semibold', size === 'md' ? 'text-base' : 'text-sm')}>{title}</h3>
      {description ? (
        <p className="max-w-prose text-sm text-[var(--pf-text-secondary)]">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
