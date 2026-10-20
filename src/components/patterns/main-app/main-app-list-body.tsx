import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Vertical stack for filters + table + pagination inside a list section. */
export function MainAppListBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-pf-ma-list="" data-pf-ma-list-stack="" className={cn('min-w-0 max-w-full', className)}>
      {children}
    </div>
  );
}
