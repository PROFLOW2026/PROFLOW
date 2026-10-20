import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Desktop: catalog + configuration. Mobile: stacks vertically. */
export function MainAppReportWorkspace({
  catalog,
  panel,
  className,
}: {
  catalog: ReactNode;
  panel: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-pf-ma-report-workspace=""
      className={cn(
        'grid min-w-0 max-w-full grid-cols-1 gap-4 lg:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)]',
        className,
      )}
    >
      <aside className="min-w-0 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">{catalog}</aside>
      <div className="min-w-0">{panel}</div>
    </div>
  );
}
