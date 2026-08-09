import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

export interface ResponsiveTableProps<T> {
  /** Rows shared by the desktop table and mobile cards. */
  readonly items: readonly T[];
  readonly getRowKey: (item: T) => string;
  /** Full table markup for lg+ viewports — typically `<Table>…</Table>`. */
  readonly desktop: ReactNode;
  readonly renderMobileCard: (item: T) => ReactNode;
  readonly mobileListClassName?: string;
  readonly mobileCardClassName?: string;
}

/**
 * Desktop table at lg+; stacked tap-friendly cards below.
 * Cards through tablet widths avoid page-level horizontal overflow from wide tables.
 * Matches the projects/clients list pattern (doc 48 §1.8).
 */
export function ResponsiveTable<T>({
  items,
  getRowKey,
  desktop,
  renderMobileCard,
  mobileListClassName,
  mobileCardClassName,
}: ResponsiveTableProps<T>) {
  return (
    <div className="min-w-0 max-w-full">
      <div className="hidden min-w-0 max-w-full lg:block">{desktop}</div>
      <div className={cn('flex min-w-0 max-w-full flex-col gap-3 lg:hidden', mobileListClassName)}>
        {items.map((item) => (
          <div key={getRowKey(item)} className={cn('min-w-0 max-w-full', mobileCardClassName)}>
            {renderMobileCard(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
