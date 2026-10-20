import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Single-row (wraps on mobile) toolbar: search, filters, primary list actions. */
export function MainAppListToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-pf-ma-list-toolbar=""
      className={cn(
        'flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {children}
    </div>
  );
}
