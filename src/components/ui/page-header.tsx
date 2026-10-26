import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional leading slot on the title row (e.g. dashboard brand lockup). */
  startAccessory?: React.ReactNode;
  /** Status chips, counts, or other inline metadata under the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  startAccessory,
  meta,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <header data-pf-page-header="" className={cn('flex min-w-0 max-w-full flex-col gap-3', className)}>
      {breadcrumb}
      <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
        {startAccessory ? (
          <div
            dir="ltr"
            className="flex min-w-0 w-full max-w-full items-center justify-between gap-2 sm:gap-3"
          >
            <div className="min-w-0 shrink-0 max-w-[min(46%,11rem)] sm:max-w-[min(50%,14rem)]">
              {startAccessory}
            </div>
            <h1
              dir="auto"
              className="min-w-0 flex-1 truncate text-end text-xl font-semibold sm:text-2xl"
            >
              {title}
            </h1>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold sm:text-2xl">{title}</h1>
            {description ? (
              <p className="mt-1 break-words text-sm text-[var(--pf-text-secondary)]">{description}</p>
            ) : null}
            {meta ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
        )}
        {actions ? (
          <div
            data-pf-page-actions=""
            className="flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:justify-end lg:max-w-none"
          >
            {actions}
          </div>
        ) : null}
      </div>
      {startAccessory && (description || meta) ? (
        <div className="min-w-0 max-w-full">
          {description ? (
            <p className="break-words text-sm text-[var(--pf-text-secondary)]">{description}</p>
          ) : null}
          {meta ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
