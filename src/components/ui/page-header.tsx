import * as React from 'react';
import { ContextualInfo } from '@/components/ui/contextual-info';
import { cn } from '@/shared/ui/cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** When `info` (default), page description opens from the (i) control beside the title. */
  descriptionMode?: 'info' | 'inline';
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
  descriptionMode = 'info',
  startAccessory,
  meta,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const titleInfo =
    description && descriptionMode === 'info' ? (
      <ContextualInfo
        dialogTitle={typeof title === 'string' ? title : undefined}
        content={description}
        className="mt-0.5"
      />
    ) : null;

  const inlineDescription =
    description && descriptionMode === 'inline' ? (
      <p className="mt-1 break-words text-sm text-[var(--pf-text-secondary)]">{description}</p>
    ) : null;

  return (
    <header data-pf-page-header="" className={cn('flex min-w-0 max-w-full flex-col gap-3', className)}>
      {breadcrumb}
      <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
        {startAccessory ? (
          <div
            dir="rtl"
            className="flex min-w-0 w-full max-w-full flex-1 basis-full items-center gap-2 sm:gap-3"
          >
            <div className="flex min-w-0 flex-1 items-start gap-1.5">
              <h1
                dir="auto"
                className="min-w-0 flex-1 truncate text-start text-xl font-semibold sm:text-2xl"
              >
                {title}
              </h1>
              {titleInfo}
            </div>
            <div dir="ltr" className="shrink-0">
              {startAccessory}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-1.5">
              <h1 className="min-w-0 flex-1 break-words text-xl font-semibold sm:text-2xl">{title}</h1>
              {titleInfo}
            </div>
            {inlineDescription}
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
      {startAccessory && (inlineDescription || meta) ? (
        <div className="min-w-0 max-w-full">
          {inlineDescription}
          {meta ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
