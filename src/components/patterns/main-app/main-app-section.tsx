import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';
import { mainAppCardClass } from '@/shared/ui/main-app-surface-styles';

export function MainAppSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-pf-ma-section=""
      className={cn(
        mainAppCardClass,
        'flex min-w-0 max-w-full flex-col gap-3 p-3 sm:p-4 shadow-none',
        className,
      )}
    >
      {title || actions ? (
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 max-w-full">{children}</div>
    </section>
  );
}
