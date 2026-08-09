import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Status chips, counts, or other inline metadata under the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex min-w-0 max-w-full flex-col gap-3', className)}>
      {breadcrumb}
      <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 break-words text-sm text-[var(--pf-text-secondary)]">{description}</p>
          ) : null}
          {meta ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:justify-end lg:max-w-none">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
